/**
 * PDFBox-Based PDF Signer
 *
 * Uses Apache PDFBox methodology for guaranteed Adobe compatibility:
 * - PDFDocument API: For loading PDF and adding visual signature appearance
 * - PDFBox port: For writing signature objects with automatic position tracking
 * - node-forge: For PKCS#7 signature creation
 *
 * Key Innovation (from PDFBox):
 * - NO pre-calculation of ByteRange/Contents positions
 * - Write signature dict with placeholders
 * - PDFBox COSWriter automatically tracks positions WHILE writing
 * - Go back and fill in actual positions
 */

import { PDFDocument } from '../document/index.js';
import { ContentStreamBuilder } from '../document/content-stream/index.js';
import { WinAnsiEncoding, encodeTextToHex } from '../document/fonts/encoding.js';
import * as pako from 'pako';
import type { BrowserKeypairSigner, SignatureOptions, SignedPDFResult, AppearanceMode } from '../types';
import { StandardFontMetrics } from '../document/fonts/StandardFontMetrics.js';
import { getDappleWatermarkPng } from './dapple-watermark-data.js';
import forge from 'node-forge';

// Import our PDFBox port
import {
  COSBase,
  COSDictionary,
  COSName,
  COSArray,
  COSInteger,
  COSString,
  COSFloat,
  COSObjectReference,
  COSStream,
  COSObjectKey,
  parsePdfTrailer,
  type TrailerInfo,
  computeDeterministicDocumentId,
  IncrementalUpdateManager,
  COSDocumentState,
  COSInputStream,
  markObjectUpdated,
  IncrementalWriteContext,
  PDSignatureField,
  XRefEntryType,
  loadRawIndirectObjects,
  loadParsedIndirectObjects,
  saveFullDocument,
} from '../pdfbox';
import { parseXrefEntries } from '../pdfbox/parser/xref';
import { buildCompressionPlan } from '../pdfbox/writer/CompressionPool';
import type {
  RawIndirectObject,
  ParsedIndirectObject,
} from '../pdfbox/parser/full-document-loader';
import type {
  FullSaveObject,
  SignatureTrackingInfo,
} from '../pdfbox/writer/FullSaveWriter';
import {
  buildAcroFormUpdatePlan,
  buildPageWidgetDictionary,
  inspectDocumentSignatures,
  createObjectResolver,
  resolvePageObjectNumber,
} from '../pdfbox/parser/object';
import { parseCOSDictionary } from '../pdfbox/parser/cosParser';
import { ensureSupportedTrailerFeatures, ensureValidObjectRef } from './guards';
import { UnsupportedPdfFeatureError } from '../errors/UnsupportedPdfFeatureError';
import { fetchTimestampToken } from './tsa.js';

/**
 * Certificate info extracted from raw DER without forge.pki.certificateFromAsn1().
 * forge.pki.certificateFromAsn1() chokes on ECDSA certs because forge only
 * supports RSA public keys. We only need subject CN, issuer, and serial —
 * none of which require inspecting the public key.
 */
export interface CertInfo {
  subjectCN: string;
  issuerAsn1: forge.asn1.Asn1;
  serialHex: string;
}

/**
 * Extract certificate info by walking the ASN.1 tree directly.
 * Uses forge.asn1.fromDer() which succeeds for any cert (it just parses TLV),
 * unlike forge.pki.certificateFromAsn1() which fails on non-RSA public keys.
 *
 * X.509 TBSCertificate structure:
 *   SEQUENCE {
 *     [0] version (optional, context-specific tag 0)
 *     serialNumber INTEGER
 *     signatureAlgorithm SEQUENCE
 *     issuer SEQUENCE (DN)
 *     validity SEQUENCE
 *     subject SEQUENCE (DN)
 *     subjectPublicKeyInfo  ← forge chokes here for ECDSA
 *     ...
 *   }
 */
export function extractCertInfo(certDer: Uint8Array): CertInfo {
  const derString = String.fromCharCode(...Array.from(certDer));
  const certAsn1 = forge.asn1.fromDer(derString);

  // certAsn1 is the top-level SEQUENCE (Certificate)
  // First child is tbsCertificate SEQUENCE
  const tbs = (certAsn1.value as forge.asn1.Asn1[])[0];
  const tbsChildren = tbs.value as forge.asn1.Asn1[];

  // Determine offset: if first child is context-specific [0] (version), skip it
  let idx = 0;
  if (tbsChildren[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC) {
    idx = 1; // skip version
  }

  // serialNumber is at idx
  const serialNode = tbsChildren[idx];
  const serialBytes = forge.asn1.toDer(serialNode).getBytes();
  // Strip tag (0x02) and length bytes to get raw integer value
  const serialAsn1 = forge.asn1.fromDer(serialBytes);
  const serialRaw = serialAsn1.value as string;
  const serialHex = forge.util.bytesToHex(serialRaw);

  // signatureAlgorithm at idx+1 (skip)
  // issuer at idx+2
  const issuerAsn1 = tbsChildren[idx + 2];

  // validity at idx+3 (skip)
  // subject at idx+4
  const subjectAsn1 = tbsChildren[idx + 4];

  // Extract CN from subject DN
  const subjectCN = extractCNFromDN(subjectAsn1);

  return { subjectCN, issuerAsn1, serialHex };
}

/**
 * Walk a DN (SEQUENCE of SETs of SEQUENCE { OID, value }) to find CN (2.5.4.3).
 */
function extractCNFromDN(dnAsn1: forge.asn1.Asn1): string {
  const OID_CN = forge.asn1.oidToDer('2.5.4.3').getBytes();
  try {
    const sets = dnAsn1.value as forge.asn1.Asn1[];
    for (const rdn of sets) {
      const attrs = rdn.value as forge.asn1.Asn1[];
      for (const attr of attrs) {
        const pair = attr.value as forge.asn1.Asn1[];
        if (pair.length >= 2) {
          const oidNode = pair[0];
          const oidPayload = (oidNode.value as string);
          if (oidPayload === OID_CN) {
            return (pair[1].value as string) || 'Unknown';
          }
        }
      }
    }
  } catch {
    // Fall through
  }
  return 'Unknown';
}

/**
 * Sign PDF using PDFBox approach
 *
 * Steps:
 * 1. Add visual signature appearance to the PDF
 * 2. Get serialized bytes as "original PDF"
 * 3. Use PDFBox port to write incremental update with signature objects
 * 4. PDFBox automatically tracks ByteRange/Contents positions
 * 5. Fill in ByteRange, sign content, inject signature
 */
export interface PreparedPdf {
  pdfBytes: Uint8Array;
  signerName: string;
  catalogObjectNumber: number;
  catalogGenerationNumber: number;
  pageObjectNumber: number;
  pageGenerationNumber: number;
  fieldName?: string;
  hasExistingDocMdp: boolean;
  hasExistingSignature: boolean;
  deterministicId: Uint8Array;
  /** Widget rectangle [x, y, width, height] matching the signature position */
  signatureRect?: [number, number, number, number];
  /** Raw PNG image bytes for Phase 2 to embed in appearance stream */
  imageData?: Uint8Array;
  /** Appearance text line (e.g. "Digitally Signed") */
  appearanceText?: string;
  /** Appearance signer line (e.g. "By: John Doe") */
  appearanceSignerText?: string;
  /** Brand text for info box header (default: "Dapple SafeSign") */
  brandText?: string;
  /** Resolved appearance mode */
  appearanceMode?: AppearanceMode;
  /** Show metadata footer line (default: true) */
  showFooter?: boolean;
}

interface ObjectWriteEntry {
  key: COSObjectKey;
  object: COSBase;
  packInObjectStream?: boolean;
}

interface SignatureWriterResult {
  bytes: Uint8Array;
  signatureInfo: SignatureTrackingInfo;
  startxref: number;
}

export async function preparePdfWithAppearance(
  pdfBytes: Uint8Array,
  signer: BrowserKeypairSigner,
  options: SignatureOptions = {}
): Promise<PreparedPdf> {
  // ── Flatten forms path: uses PDFDocument (terminal operation) ──────────
  if (options.flattenForms) {
    return preparePdfWithFlatten(pdfBytes, signer, options);
  }

  // Check for existing signatures
  const signatureSnapshot = inspectDocumentSignatures(pdfBytes);

  // ── Incremental path (default): preserves original bytes exactly ──────────
  // This is safe for all PDFs — original content streams are never re-serialized.
  // The rewrite path only exists for Java PDFBox byte-parity testing.
  return preparePdfIncremental(pdfBytes, signer, options, signatureSnapshot);
}

/**
 * Flatten-then-sign path: uses PDFDocument to flatten forms, then rewrites.
 * This is a terminal operation — you wouldn't counter-sign after flattening.
 */
async function preparePdfWithFlatten(
  pdfBytes: Uint8Array,
  signer: BrowserKeypairSigner,
  options: SignatureOptions
): Promise<PreparedPdf> {
  const originalTrailer = parsePdfTrailer(pdfBytes);
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    updateMetadata: false,
    throwOnInvalidObject: false,
  });

  const form = pdfDoc.getForm();
  form.flatten();
  console.log('   ✅ Form fields flattened');

  const pdfWithFlatten = await pdfDoc.save({
    useObjectStreams: originalTrailer.hasXRefStream,
  });

  // Re-enter the incremental path with the flattened bytes
  const flattenedOptions = { ...options, flattenForms: false };
  return preparePdfWithAppearance(new Uint8Array(pdfWithFlatten), signer, flattenedOptions);
}

/**
 * First-signature path: loads the PDF via PDFDocument to normalize it (matching
 * the Java signer's behavior of rewriting the PDF). Draws text/rect appearance
 * on the page for backward compatibility with the parity harness, but also
 * passes appearance metadata so Phase 2 can build the appearance stream.
 */
export async function preparePdfWithRewrite(
  pdfBytes: Uint8Array,
  signer: BrowserKeypairSigner,
  options: SignatureOptions,
  signatureSnapshot: { hasDocMdp: boolean; hasSignedFields: boolean }
): Promise<PreparedPdf> {
  const originalTrailer = parsePdfTrailer(pdfBytes);
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    updateMetadata: false,
    throwOnInvalidObject: false,
  });

  const pageCount = pdfDoc.getPageCount();
  console.log(`   ✅ Loaded: ${pageCount} page(s)`);

  const pages = pdfDoc.getPages();
  const defaultSigPosition = { page: 0, x: 50, y: 50, width: 200, height: 50 };
  const sigPosition = { ...defaultSigPosition, ...(options.signatureAppearance?.position ?? {}) };
  const targetPageIndex = Math.min(
    Math.max(sigPosition.page ?? 0, 0),
    Math.max(pages.length - 1, 0)
  );
  const targetPage = pages[targetPageIndex];

  const imageData = options.signatureAppearance?.imageData;

  // Remove dangling /Outlines references and fill xref gaps
  const ctx = pdfDoc._nativeCtx!;
  const outlinesEntry = ctx.catalog.getItem('Outlines');
  if (outlinesEntry instanceof COSObjectReference) {
    const obj = ctx.lookup(outlinesEntry.objectNumber);
    if (!obj) {
      ctx.catalog.removeItem(new COSName('Outlines'));
    }
  }
  const allObjectNumbers = new Set<number>();
  for (const [num] of ctx.enumerateObjects()) {
    allObjectNumbers.add(num);
  }
  if (allObjectNumbers.size > 0) {
    const { COSNull } = await import('../pdfbox/cos/COSTypes.js');
    const maxObjNum = Math.max(...allObjectNumbers);
    for (let i = 1; i <= maxObjNum; i++) {
      if (!allObjectNumbers.has(i)) {
        ctx.assign(i, COSNull.NULL);
      }
    }
  }

  const catalogObjectNumber = ctx.catalogRef.objectNumber;
  const catalogGenerationNumber = ctx.catalogRef.generationNumber;
  const pageRef = (targetPage as any)?.ref as COSObjectReference | undefined;
  const pageObjectNumber = pageRef?.objectNumber ?? 0;
  const pageGenerationNumber = pageRef?.generationNumber ?? 0;

  // Serialize to bytes — this is the "prepared PDF"
  const pdfWithAppearance = await pdfDoc.save({
    useObjectStreams: originalTrailer.hasXRefStream,
  });
  console.log(`   ✅ PDF prepared: ${Math.floor(pdfWithAppearance.length / 1024)} KB`);

  ensureValidObjectRef(catalogObjectNumber, 'catalog');
  ensureValidObjectRef(pageObjectNumber, 'page');

  // Extract signer name from certificate (forge-free — works with ECDSA certs)
  const certChain = await signer.getCertificate();
  const certInfo = extractCertInfo(certChain.cert);
  const signerName = certInfo.subjectCN;

  const fieldName = options.signatureAppearance?.fieldName ?? undefined;
  const deterministicId = computeDeterministicDocumentId(pdfWithAppearance);

  const resolvedMode: AppearanceMode = options.signatureAppearance?.appearanceMode
    ?? (imageData ? 'hybrid' : 'text-only');
  const needsText = resolvedMode !== 'image-only';
  const appearanceText = needsText
    ? (options.signatureAppearance?.text || 'Digitally Signed')
    : undefined;
  const appearanceSignerText = needsText ? `By: ${signerName}` : undefined;
  const brandText = options.signatureAppearance?.brandText ?? (needsText ? 'Dapple SafeSign' : undefined);
  const hasAppearance = !!(imageData || options.signatureAppearance?.position);
  const signatureRect: [number, number, number, number] | undefined = hasAppearance
    ? [sigPosition.x, sigPosition.y, sigPosition.width, sigPosition.height]
    : undefined;

  return {
    pdfBytes: pdfWithAppearance,
    signerName,
    catalogObjectNumber,
    catalogGenerationNumber,
    pageObjectNumber,
    pageGenerationNumber,
    fieldName,
    hasExistingDocMdp: signatureSnapshot.hasDocMdp,
    hasExistingSignature: signatureSnapshot.hasSignedFields,
    deterministicId,
    signatureRect,
    imageData,
    appearanceText,
    appearanceSignerText,
    brandText,
    appearanceMode: resolvedMode,
    showFooter: options.signatureAppearance?.showFooter !== false,
  };
}

/**
 * Counter-signing path: returns ORIGINAL bytes unchanged so that earlier
 * signatures' ByteRanges remain valid. All appearance content is deferred
 * to Phase 2 (incremental write).
 */
async function preparePdfIncremental(
  pdfBytes: Uint8Array,
  signer: BrowserKeypairSigner,
  options: SignatureOptions,
  signatureSnapshot: { hasDocMdp: boolean; hasSignedFields: boolean }
): Promise<PreparedPdf> {
  const trailer = parsePdfTrailer(pdfBytes);
  const documentState = new COSDocumentState(pdfBytes, trailer);
  const resolver = createObjectResolver(documentState, pdfBytes);
  const catalogObj = resolver(trailer.rootRef.objectNumber, trailer.rootRef.generation);

  const catalogObjectNumber = trailer.rootRef.objectNumber;
  const catalogGenerationNumber = trailer.rootRef.generation;

  const defaultSigPosition = { page: 0, x: 50, y: 50, width: 200, height: 50 };
  const sigPosition = { ...defaultSigPosition, ...(options.signatureAppearance?.position ?? {}) };
  const requestedPageIndex = Math.max(sigPosition.page ?? 0, 0);

  // Clamp page index to valid range using /Pages /Count
  const catalogDict = parseCOSDictionary(catalogObj.body);
  const pagesEntry = catalogDict.getItem('Pages');
  let pageCount = 1;
  if (pagesEntry instanceof COSObjectReference) {
    const pagesObj = resolver(pagesEntry.objectNumber, pagesEntry.generationNumber);
    const pagesDict = parseCOSDictionary(pagesObj.body);
    const countVal = pagesDict.getItem('Count');
    if (countVal instanceof COSInteger) {
      pageCount = countVal.getValue();
    }
  }
  const targetPageIndex = Math.min(requestedPageIndex, Math.max(pageCount - 1, 0));
  const pageRef = resolvePageObjectNumber(resolver, catalogObj.body, targetPageIndex);
  const pageObjectNumber = pageRef.objectNumber;
  const pageGenerationNumber = pageRef.generationNumber;

  console.log(`   ✅ Parsed (counter-sign): catalog=${catalogObjectNumber}, page=${pageObjectNumber}`);
  ensureValidObjectRef(catalogObjectNumber, 'catalog');
  ensureValidObjectRef(pageObjectNumber, 'page');

  // Extract signer name from certificate (forge-free — works with ECDSA certs)
  const certChain = await signer.getCertificate();
  const certInfo = extractCertInfo(certChain.cert);
  const signerName = certInfo.subjectCN;

  const imageData = options.signatureAppearance?.imageData;
  const fieldName = options.signatureAppearance?.fieldName ?? undefined;
  const deterministicId = computeDeterministicDocumentId(pdfBytes);

  const resolvedMode: AppearanceMode = options.signatureAppearance?.appearanceMode
    ?? (imageData ? 'hybrid' : 'text-only');
  const needsText = resolvedMode !== 'image-only';
  const appearanceText = needsText
    ? (options.signatureAppearance?.text || 'Digitally Signed')
    : undefined;
  const appearanceSignerText = needsText ? `By: ${signerName}` : undefined;
  const brandText = options.signatureAppearance?.brandText ?? (needsText ? 'Dapple SafeSign' : undefined);
  const hasAppearance = !!(imageData || options.signatureAppearance?.position);
  const signatureRect: [number, number, number, number] | undefined = hasAppearance
    ? [sigPosition.x, sigPosition.y, sigPosition.width, sigPosition.height]
    : undefined;

  return {
    pdfBytes,  // ← ORIGINAL bytes, not rewritten!
    signerName,
    catalogObjectNumber,
    catalogGenerationNumber,
    pageObjectNumber,
    pageGenerationNumber,
    fieldName,
    hasExistingDocMdp: signatureSnapshot.hasDocMdp,
    hasExistingSignature: signatureSnapshot.hasSignedFields,
    deterministicId,
    signatureRect,
    imageData,
    appearanceText,
    appearanceSignerText,
    brandText,
    appearanceMode: resolvedMode,
    showFooter: options.signatureAppearance?.showFooter !== false,
  };
}

export async function signPreparedPdfWithPDFBox(
  prepared: PreparedPdf,
  signer: BrowserKeypairSigner,
  options: SignatureOptions = {}
): Promise<SignedPDFResult> {
  const pdfWithAppearance = prepared.pdfBytes;
  const signerName = prepared.signerName;
  const originalLength = pdfWithAppearance.length;
  const {
    catalogObjectNumber,
    catalogGenerationNumber,
    pageObjectNumber,
    pageGenerationNumber,
    fieldName: preparedFieldName,
    hasExistingDocMdp,
    hasExistingSignature,
    deterministicId,
    signatureRect,
    imageData,
    appearanceText,
    brandText,
    appearanceMode: resolvedAppearanceMode,
    showFooter: showFooterFlag,
  } = prepared;

  if (!catalogObjectNumber || !pageObjectNumber) {
    throw new Error('Missing catalog or page references for incremental update');
  }

  const trailerInfo = parsePdfTrailer(pdfWithAppearance);
  if (deterministicId) {
    applyDeterministicId(trailerInfo, deterministicId);
  }
  ensureSupportedTrailerFeatures(trailerInfo);
  const { forceFullSave, reason: fullSaveReason } = decideFullSaveMode(
    pdfWithAppearance,
    trailerInfo,
    options.forceFullSave
  );
  const enableObjStm = false;
  const documentState = new COSDocumentState(pdfWithAppearance, trailerInfo);
  const updateManager = new IncrementalUpdateManager(trailerInfo);
  let writeContext: IncrementalWriteContext | undefined;
  if (!forceFullSave) {
    writeContext = new IncrementalWriteContext(pdfWithAppearance, {
      enableObjectStreams: enableObjStm,
      objectStreamMinObjectNumber: trailerInfo.size,
    });
    writeContext.enableIncrementalTracking(originalLength);
    writeContext.bindUpdateManager(updateManager);
  } else {
    const why = fullSaveReason ? ` (${fullSaveReason})` : '';
    console.log(`   ⚙️  Full save requested – rewriting entire document.${why}`);
  }
  const sigFieldKey = updateManager.allocateObject();
  const sigKey = updateManager.allocateObject();
  const appearanceDictKey = updateManager.allocateObject();
  const sigFieldNum = sigFieldKey.objectNumber;
  const sigDictNum = sigKey.objectNumber;

  console.log('   📎 Trailer summary:');
  console.log(`      • startxref: ${trailerInfo.startxref}`);
  console.log(`      • size: ${trailerInfo.size}`);
  console.log(`      • next object: ${sigDictNum}`);
  console.log(
    `      • catalog/page objects: ${catalogObjectNumber}, ${pageObjectNumber}`
  );

  ensureValidObjectRef(catalogObjectNumber, 'catalog');
  ensureValidObjectRef(pageObjectNumber, 'page');
  const catalogOffset = documentState.getObjectOffset(
    catalogObjectNumber,
    catalogGenerationNumber
  );
  if (catalogOffset === undefined) {
    console.warn(
      `   ⚠️ Catalog object ${catalogObjectNumber} ${catalogGenerationNumber} R missing from xref table; rewritten object will be appended.`
    );
  } else {
    logOriginalObjectSnippet('catalog', pdfWithAppearance, catalogOffset);
  }

  const pageOffset = documentState.getObjectOffset(
    pageObjectNumber,
    pageGenerationNumber
  );
  if (pageOffset === undefined) {
    console.warn(
      `   ⚠️ Page object ${pageObjectNumber} ${pageGenerationNumber} R missing from xref table; rewritten object will be appended.`
    );
  } else {
    logOriginalObjectSnippet('page', pdfWithAppearance, pageOffset);
  }
  const catalogObject = loadObjectOrThrow(
    documentState,
    pdfWithAppearance,
    catalogObjectNumber,
    catalogGenerationNumber,
    'catalog'
  );
  const pageObject = loadObjectOrThrow(
    documentState,
    pdfWithAppearance,
    pageObjectNumber,
    pageGenerationNumber,
    'page'
  );

  const certChain = await signer.getCertificate();
  const certInfo = extractCertInfo(certChain.cert);

  // =========================================================================
  // STEP 2: Create signature objects using PDFBox port
  // =========================================================================
  console.log('\n2️⃣  Creating signature objects with PDFBox...');

  // Create signature dictionary with placeholders
  // Match PDFBox's SignatureOptions.DEFAULT_SIGNATURE_SIZE * 2 (0x2500 * 2 = 18944 bytes)
  // Increase to 0x4000 * 2 when timestamping (TSA responses include cert chains)
  const placeholderSize = options.timestampURL ? 0x4000 * 2 : 0x2500 * 2;

  // ByteRange placeholder (values will be patched later)
  const placeholderLargeHigh = 1_000_000_000;
  const placeholderLargeLow = 1_000_000_000;
  const byteRange = new COSArray();
  byteRange.add(COSInteger.ZERO);
  byteRange.add(new COSInteger(placeholderLargeHigh));
  byteRange.add(new COSInteger(placeholderLargeHigh));
  byteRange.add(new COSInteger(placeholderLargeLow));
  markObjectUpdated(byteRange);

  // Contents placeholder (8192 bytes of zeros)
  const placeholder = new Uint8Array(placeholderSize).fill(0);
  const contents = new COSString(placeholder, true);
  markObjectUpdated(contents);

  // Add timestamp
  const pdfSigningDate = getDeterministicSignatureDate('PDFBOX_TS_SIGN_TIME');
  const cmsSigningDate = getDeterministicSignatureDate(
    'PDFBOX_TS_CMS_SIGN_TIME',
    pdfSigningDate
  );
  const pdfDate = formatPDFDate(pdfSigningDate);
  let referenceArray: COSArray | undefined;
  let sigRefDict: COSDictionary | undefined;
  let sigRefKey: COSObjectKey | undefined;
  let permsDict: COSDictionary | undefined;
  let permsKey: COSObjectKey | undefined;

  const widgetRef = new COSObjectReference(
    sigFieldKey.objectNumber,
    sigFieldKey.generationNumber
  );

  const objectResolver = createObjectResolver(documentState, pdfWithAppearance);
  const acroFormPlan = buildAcroFormUpdatePlan(
    objectResolver,
    catalogObject.body,
    widgetRef
  );

  const existingApproval =
    hasExistingDocMdp ||
    hasExistingSignature ||
    acroFormPlan.hasDocMdp ||
    acroFormPlan.hasExistingSignatures;
  const shouldAddDocMdp = !existingApproval;
  console.log(`   DocMDP required: ${shouldAddDocMdp}`);

  if (shouldAddDocMdp) {
    sigRefDict = createDocMdpReferenceDictionary();
    referenceArray = new COSArray();
    // PDFBox writes the SigRef inline in the /Reference array AND as a
    // separate indirect object.  We mirror both behaviors for parity.
    referenceArray.add(sigRefDict);
    sigRefKey = updateManager.allocateObject();
    permsDict = createDocMdpPermsDictionary(sigKey);
  }
  const appearanceStreamKey = updateManager.allocateObject();
  // Allocate Resources dict as indirect object — Adobe Reader rejects
  // inline Resources dicts with "Expected a dict object".
  let resourcesDictKey: COSObjectKey | undefined;
  let fontDictKey: COSObjectKey | undefined;
  let fontBoldDictKey: COSObjectKey | undefined;
  let imageXObjectKey: COSObjectKey | undefined;
  let logoXObjectKey: COSObjectKey | undefined;
  const effectiveMode = resolvedAppearanceMode ?? (imageData ? 'hybrid' : 'text-only');
  const hasVisualAppearance = !!(signatureRect && (imageData || appearanceText));
  if (hasVisualAppearance) {
    resourcesDictKey = updateManager.allocateObject();
    if (effectiveMode === 'image-only') {
      imageXObjectKey = updateManager.allocateObject();
      if (showFooterFlag !== false) {
        fontDictKey = updateManager.allocateObject();
      }
    } else if (effectiveMode === 'hybrid') {
      imageXObjectKey = updateManager.allocateObject();
      fontDictKey = updateManager.allocateObject();
      fontBoldDictKey = updateManager.allocateObject();
      logoXObjectKey = updateManager.allocateObject();
    } else {
      // text-only: two fonts + logo watermark
      fontDictKey = updateManager.allocateObject();
      fontBoldDictKey = updateManager.allocateObject();
      logoXObjectKey = updateManager.allocateObject();
    }
  }
  if (shouldAddDocMdp) {
    permsKey = updateManager.allocateObject();
  }

  const sigDict = createSignatureDictionary({
    signerName,
    reason: options.reason,
    location: options.location,
    pdfDate,
    byteRange,
    contents,
    referenceArray,
  });
  console.log('\n4️⃣  Creating signature field + AcroForm references...');

  const fieldCount = acroFormPlan.fieldCount ?? 0;
  const defaultFieldName =
    options.signatureAppearance?.fieldName ?? `Signature${fieldCount + 1}`;

  const signatureFieldName = preparedFieldName ?? defaultFieldName;
  const signatureField = new PDSignatureField(signatureFieldName);
  // Use actual position when image is provided; otherwise zero rect for parity.
  signatureField.setRectangle(
    signatureRect
      ? [signatureRect[0], signatureRect[1],
         signatureRect[0] + signatureRect[2], signatureRect[1] + signatureRect[3]]
      : [0, 0, 0, 0]
  );
  signatureField.setAppearance(new COSObjectReference(appearanceDictKey));
  signatureField.setValue(new COSObjectReference(sigKey));
  signatureField.setPage(
    new COSObjectReference(pageObjectNumber, pageGenerationNumber)
  );
  const signatureFieldDict = signatureField.getCOSObject();

  const catalogKey = new COSObjectKey(catalogObjectNumber, catalogGenerationNumber);
  const pageKey = new COSObjectKey(pageObjectNumber, pageGenerationNumber);
  const catalogDict = acroFormPlan.catalogDict;
  const existingAcroForm = catalogDict.getItem(new COSName('AcroForm'));
  if (existingAcroForm) {
    catalogDict.removeItem(new COSName('AcroForm'));
  }
  if (shouldAddDocMdp && permsDict) {
    const permsRef = permsKey
      ? new COSObjectReference(permsKey.objectNumber, permsKey.generationNumber)
      : undefined;
    catalogDict.setItem(new COSName('Perms'), permsRef ?? permsDict);
  }
  if (existingAcroForm) {
    catalogDict.setItem(new COSName('AcroForm'), existingAcroForm);
  }

  const updatedPageDict = buildPageWidgetDictionary(pageObject.body, widgetRef);

  const appearanceDict = new COSDictionary();
  appearanceDict.setItem(
    new COSName('N'),
    new COSObjectReference(appearanceStreamKey)
  );
  const appearanceStream = new COSStream();
  let resourcesDict: COSDictionary | undefined;
  let fontDict: COSDictionary | undefined;
  let fontBoldDict: COSDictionary | undefined;
  let imageXObject: COSStream | undefined;
  let logoXObject: COSStream | undefined;

  if (hasVisualAppearance && signatureRect && resourcesDictKey) {
    const w = signatureRect[2];
    const h = signatureRect[3];

    if (effectiveMode === 'image-only' && imageData && imageXObjectKey) {
      // ── Image-only appearance: full-bleed PNG + optional metadata footer ──
      const stream = new ContentStreamBuilder();
      const footerH = (showFooterFlag !== false && fontDictKey) ? Math.min(8, h * 0.12) + 3 : 0;
      const imgH = h - footerH;
      stream.pushGraphicsState().concatMatrix(w, 0, 0, imgH, 0, footerH).drawXObject('Img').popGraphicsState();

      // Metadata footer line
      if (showFooterFlag !== false && fontDictKey) {
        const footerSize = Math.min(5.5, Math.max(4, h * 0.07));
        const footerText = buildFooterText(brandText, pdfSigningDate, signatureFieldName);
        const truncFooter = truncateToFit(footerText, footerSize, w - 6);
        stream.beginText()
          .setFontAndSize('F1', footerSize)
          .raw('0.6 0.6 0.6 rg')
          .moveText(3, 2)
          .showText(encodeTextToHex(truncFooter, WinAnsiEncoding))
          .endText();
      }

      appearanceStream.setData(new TextEncoder().encode(stream.toString()));
      setFormXObjectHeaders(appearanceStream, w, h);
      imageXObject = buildPngXObject(imageData);

      // Resources
      const xobjectDict = new COSDictionary();
      xobjectDict.setItem(new COSName('Img'), new COSObjectReference(imageXObjectKey));
      resourcesDict = new COSDictionary();
      resourcesDict.setItem(new COSName('XObject'), xobjectDict);
      if (fontDictKey) {
        fontDict = buildStandardFontDict('Helvetica');
        const fontRefDict = new COSDictionary();
        fontRefDict.setItem(new COSName('F1'), new COSObjectReference(fontDictKey));
        resourcesDict.setItem(new COSName('Font'), fontRefDict);
      }
      appearanceStream.setItem(
        new COSName('Resources'),
        new COSObjectReference(resourcesDictKey.objectNumber, resourcesDictKey.generationNumber)
      );
    } else if ((effectiveMode === 'hybrid' || effectiveMode === 'text-only') && fontDictKey) {
      // ── Hybrid or text-only: branded info box (with optional image) ──
      const stream = buildInfoBoxContentStream({
        w,
        h,
        hasImage: !!(effectiveMode === 'hybrid' && imageData),
        brandText: brandText ?? 'Dapple SafeSign',
        signerName,
        signingDate: pdfSigningDate,
        reason: options.reason,
        location: options.location,
        showFooter: showFooterFlag !== false,
        fieldName: signatureFieldName,
      });
      appearanceStream.setData(new TextEncoder().encode(stream.toString()));
      setFormXObjectHeaders(appearanceStream, w, h);

      // Build font dicts
      fontDict = buildStandardFontDict('Helvetica');
      fontBoldDict = buildStandardFontDict('Helvetica-Bold');

      // Build resources
      const fontRefDict = new COSDictionary();
      fontRefDict.setItem(new COSName('F1'), new COSObjectReference(fontDictKey));
      if (fontBoldDictKey) {
        fontRefDict.setItem(new COSName('F2'), new COSObjectReference(fontBoldDictKey));
      }
      resourcesDict = new COSDictionary();
      resourcesDict.setItem(new COSName('Font'), fontRefDict);

      // Build XObject resources (signature image + logo watermark)
      const xobjectDict = new COSDictionary();
      if (effectiveMode === 'hybrid' && imageData && imageXObjectKey) {
        imageXObject = buildPngXObject(imageData);
        xobjectDict.setItem(new COSName('Img'), new COSObjectReference(imageXObjectKey));
      }
      if (logoXObjectKey) {
        logoXObject = buildPngXObject(getDappleWatermarkPng());
        xobjectDict.setItem(new COSName('Logo'), new COSObjectReference(logoXObjectKey));
      }
      if (imageXObjectKey || logoXObjectKey) {
        resourcesDict.setItem(new COSName('XObject'), xobjectDict);
      }

      appearanceStream.setItem(
        new COSName('Resources'),
        new COSObjectReference(resourcesDictKey.objectNumber, resourcesDictKey.generationNumber)
      );
    }
  } else {
    // Empty stream with zero BBox — preserve original key order for parity
    appearanceStream.setData(new Uint8Array());
    appearanceStream.setItem(COSName.TYPE, new COSName('XObject'));
    appearanceStream.setItem(new COSName('Subtype'), new COSName('Form'));
    appearanceStream.setItem(new COSName('BBox'), buildZeroBBoxArray());
  }

  const packSignatureObjects = false;
  const objectWriteQueue: ObjectWriteEntry[] = [];
  const enqueueObject = (
    key?: COSObjectKey,
    object?: COSBase,
    packInObjectStream: boolean = false
  ): void => {
    if (!key || !object) {
      return;
    }
    objectWriteQueue.push({ key, object, packInObjectStream });
  };

  if (acroFormPlan.existingFieldObjects?.length) {
    for (const existingField of acroFormPlan.existingFieldObjects) {
      enqueueObject(
        new COSObjectKey(existingField.objectNumber, existingField.generationNumber),
        existingField.dict
      );
    }
  }

  enqueueObject(sigFieldKey, signatureFieldDict, packSignatureObjects);
  enqueueObject(sigKey, sigDict, packSignatureObjects);
  // PDFBox writes the SigRef dict as a separate indirect object in the
  // incremental update (in addition to inlining it in the sig dict's
  // /Reference array).  Write it right after the sig dict to match Java's
  // object ordering.
  if (sigRefKey && sigRefDict) {
    enqueueObject(sigRefKey, sigRefDict, packSignatureObjects);
  }
  enqueueObject(appearanceDictKey, appearanceDict, packSignatureObjects);
  enqueueObject(appearanceStreamKey, appearanceStream);
  if (fontDictKey && fontDict) {
    enqueueObject(fontDictKey, fontDict, packSignatureObjects);
  }
  if (fontBoldDictKey && fontBoldDict) {
    enqueueObject(fontBoldDictKey, fontBoldDict, packSignatureObjects);
  }
  if (imageXObjectKey && imageXObject) {
    enqueueObject(imageXObjectKey, imageXObject);
  }
  if (logoXObjectKey && logoXObject) {
    enqueueObject(logoXObjectKey, logoXObject);
  }
  if (resourcesDictKey && resourcesDict) {
    enqueueObject(resourcesDictKey, resourcesDict, packSignatureObjects);
  }
  enqueueObject(pageKey, updatedPageDict, packSignatureObjects);
  if (acroFormPlan.acroFormObject) {
    enqueueObject(
      new COSObjectKey(
        acroFormPlan.acroFormObject.objectNumber,
        acroFormPlan.acroFormObject.generationNumber
      ),
      acroFormPlan.acroFormObject.dict,
      packSignatureObjects
    );
  }
  if (permsKey && permsDict) {
    enqueueObject(permsKey, permsDict, packSignatureObjects);
  }
  enqueueObject(catalogKey, catalogDict, false);

  // =========================================================================
  // STEP 3: Get tracked positions (THE MAGIC!)
  // =========================================================================
  console.log('\n3️⃣  Retrieving tracked positions...');

  let trackingInfo: SignatureTrackingInfo;
  let xrefStart: number;
  let pdfBytes_withPlaceholders: Uint8Array;

  if (!forceFullSave) {
    if (!writeContext) {
      throw new Error('Incremental write context unavailable');
    }
    let sigDictOffset = -1;
    for (const entry of objectWriteQueue) {
      const offset = writeContext.writeIndirectObject(
        entry.key.objectNumber,
        entry.object,
        entry.key.generationNumber
      );
      if (offset >= 0) {
        updateManager.registerOffset(entry.key, offset);
        if (
          entry.key.objectNumber === sigDictNum &&
          entry.key.generationNumber === sigKey.generationNumber
        ) {
          sigDictOffset = offset;
        }
      }
    }
    if (sigDictOffset >= 0) {
      console.log(`   ✅ Signature dictionary at offset ${sigDictOffset}`);
    }
    trackingInfo = writeContext.writer.getSignatureInfo();
    console.log(`   📍 ByteRange offset: ${trackingInfo.byteRangeOffset}`);
    console.log(`   📍 ByteRange length: ${trackingInfo.byteRangeLength}`);
    console.log(`   📍 Contents offset: ${trackingInfo.signatureOffset}`);
    console.log(`   📍 Contents length: ${trackingInfo.signatureLength}`);
    if (trackingInfo.signatureOffset === 0) {
      throw new Error('PDFBox did not detect signature! Check COSWriter signature detection logic.');
    }
    console.log('\n5️⃣  Writing xref table...');
    xrefStart = writeContext.finalizeIncremental(updateManager, trailerInfo);
    console.log(`   ✅ XRef table at offset ${xrefStart}`);
    pdfBytes_withPlaceholders = writeContext.toUint8Array();
  } else {
    const fullSaveResult = writeFullDocumentForSignature({
      originalPdf: pdfWithAppearance,
      trailer: trailerInfo,
      replacements: objectWriteQueue,
      useXrefStream: trailerInfo.hasXRefStream,
    });
    trackingInfo = fullSaveResult.signatureInfo;
    xrefStart = fullSaveResult.startxref;
    pdfBytes_withPlaceholders = fullSaveResult.bytes;
    console.log(`   📍 ByteRange offset: ${trackingInfo.byteRangeOffset}`);
    console.log(`   📍 ByteRange length: ${trackingInfo.byteRangeLength}`);
    console.log(`   📍 Contents offset: ${trackingInfo.signatureOffset}`);
    console.log(`   📍 Contents length: ${trackingInfo.signatureLength}`);
    console.log('\n5️⃣  Writing xref table...');
    console.log(`   ✅ Full save startxref at offset ${xrefStart}`);
    if (trackingInfo.signatureOffset === 0) {
      throw new Error('PDFBox did not detect signature in full-save mode.');
    }
  }

  // =========================================================================
  // STEP 6: Calculate actual ByteRange
  // =========================================================================
  console.log('\n6️⃣  Calculating ByteRange...');

  // ByteRange format: [0, A, B, C]
  // Where:
  // - A = offset of /Contents (everything before signature)
  // - B = offset after signature
  // - C = length from B to EOF
  const A = trackingInfo.signatureOffset;
  const B = trackingInfo.signatureOffset + trackingInfo.signatureLength;
  const C = pdfBytes_withPlaceholders.length - B;

  console.log(`   ByteRange: [0, ${A}, ${B}, ${C}]`);

  // =========================================================================
  // STEP 7: Fill in ByteRange values
  // =========================================================================
  console.log('\n7️⃣  Filling in ByteRange...');

  const byteRangeString = `0 ${A} ${B} ${C}`;
  const byteRangeBytes = new TextEncoder().encode(`${byteRangeString}]`);

  if (byteRangeBytes.length > trackingInfo.byteRangeLength) {
    throw new Error(
      `ByteRange too long! ${byteRangeBytes.length} > ${trackingInfo.byteRangeLength}`
    );
  }

  const pdfWithByteRange = new Uint8Array(pdfBytes_withPlaceholders);
  const byteRangeStart = trackingInfo.byteRangeOffset;
  const placeholderEnd = trackingInfo.byteRangeOffset + trackingInfo.byteRangeLength;

  pdfWithByteRange.set(byteRangeBytes, byteRangeStart);
  const spacesStart = byteRangeStart + byteRangeBytes.length;
  if (spacesStart < placeholderEnd) {
    pdfWithByteRange.fill(0x20, spacesStart, placeholderEnd);
  }

  console.log(`   ✅ ByteRange filled: ${byteRangeString}`);

  // =========================================================================
  // STEP 8: Sign the content (everything except signature)
  // =========================================================================
  console.log('\n8️⃣  Signing content...');

  // Extract content to sign (everything except /Contents value)
  const part1 = pdfWithByteRange.slice(0, A);
  const part2 = pdfWithByteRange.slice(B);
  const contentToSign = new Uint8Array(part1.length + part2.length);
  contentToSign.set(part1, 0);
  contentToSign.set(part2, part1.length);

  console.log(`   Content to sign: ${contentToSign.length} bytes`);

  const signerAlgorithm = signer.getAlgorithm();
  const isEcdsa = signerAlgorithm.signature === 'ECDSA';

  // BER (indefinite-length) encoding for parity with Java PDFBox in Node.js;
  // DER in browser because node-forge's asn1.fromDer() can't parse BER for verification
  const useBerIndefiniteLength = typeof process !== 'undefined' && !process.env?.PDFBOX_TS_CMS_DER;
  console.log(`   CMS encoding: ${useBerIndefiniteLength ? 'BER (indefinite)' : 'DER (definite)'}`);
  console.log(`   Signature algorithm: ${isEcdsa ? 'ECDSA P-256' : 'RSA'}`);

  let precomputedSig: string;
  let privateKey: forge.pki.rsa.PrivateKey | undefined;

  if (isEcdsa) {
    // ECDSA path: use signer.sign() (WebCrypto ECDSA → DER signature)
    // Build authenticated attributes to sign
    const contentDigest = sha256Digest(contentToSign);
    const authenticatedAttributesList = buildAuthenticatedAttributes({
      signingTime: formatSigningTime(cmsSigningDate),
      contentDigest,
      signatureAlgorithm: 'ECDSA',
    });
    const attributeSetForDigest = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      authenticatedAttributesList
    );
    const attributeDer = forge.asn1.toDer(attributeSetForDigest).getBytes();
    // signer.sign() receives the raw authenticated attributes DER —
    // the signer is responsible for hashing (SHA-256) and signing (ECDSA).
    // Do NOT pre-hash here: @noble/curves p256.sign() hashes internally.
    const ecdsaSigBytes = await signer.sign(byteStringToUint8Array(attributeDer));
    precomputedSig = uint8ArrayToBinaryString(ecdsaSigBytes);
  } else {
    // RSA path: use globalThis.__forgePrivateKey (existing behavior)
    privateKey = (globalThis as any).__forgePrivateKey;
    if (!privateKey) {
      throw new Error('Forge private key not found. Did you call signer.unlock()?');
    }
    precomputedSig = computeRsaSignature({
      contentToSign,
      privateKey,
      signingDate: cmsSigningDate,
    });
  }

  let timestampToken: Uint8Array | undefined;
  if (options.timestampURL) {
    console.log(`   Fetching timestamp from ${options.timestampURL}...`);
    const sigBytes = byteStringToUint8Array(precomputedSig);
    timestampToken = await fetchTimestampToken(options.timestampURL, sigBytes);
    console.log(`   ✅ Timestamp token: ${timestampToken.length} bytes`);
  }

  const signatureBytes = buildPdfBoxCmsSignature({
    contentToSign,
    certInfo,
    rawCertificateDer: certChain.cert,
    privateKey,
    signingDate: cmsSigningDate,
    useBerIndefiniteLength,
    precomputedSignature: precomputedSig,
    timestampToken,
    chainCertsDer: certChain.chain.length > 0 ? certChain.chain : undefined,
    signatureAlgorithm: isEcdsa ? 'ECDSA' : 'RSA',
  });
  const signatureHex = uint8ArrayToHex(signatureBytes);

  console.log(`   ✅ Signature created: ${signatureHex.length / 2} bytes`);

  // =========================================================================
  // STEP 9: Inject signature into PDF
  // =========================================================================
  console.log('\n9️⃣  Injecting signature...');

  const signatureBytesHex = new TextEncoder().encode(signatureHex);

  if (signatureBytesHex.length > trackingInfo.signatureLength - 2) {
    // -2 for < and >
    throw new Error(
      `Signature too long! ${signatureBytesHex.length} > ${trackingInfo.signatureLength - 2}`
    );
  }

  // Fill placeholder in /Contents <...>
  // Note: trackingInfo.signatureOffset points to '<', so we start at +1
  const signedPDF = new Uint8Array(pdfWithByteRange);
  signedPDF.set(signatureBytesHex, trackingInfo.signatureOffset + 1);

  console.log(`   ✅ Signature injected at offset ${trackingInfo.signatureOffset}`);

  // =========================================================================
  // DONE!
  // =========================================================================
  console.log('\n✅ PDF signing complete!');
  console.log(`   Final size: ${Math.floor(signedPDF.length / 1024)} KB`);

  return {
    signedData: signedPDF,
      signatureInfo: {
        signedAt: pdfSigningDate,
      signedBy: signerName,
      byteRange: [0, A, B, C],
      signatureSize: signatureHex.length / 2, // Convert hex chars to bytes
      xrefStart,
      objects: {
        signature: sigDictNum,
        widget: sigFieldNum,
        acroForm: acroFormPlan.acroFormObject
          ? acroFormPlan.acroFormObject.objectNumber
          : catalogObjectNumber,
        catalog: catalogObjectNumber,
        page: pageObjectNumber,
      },
    },
  };
}

/**
 * Detect if a PDF has an /Encrypt dictionary in its trailer.
 * Signing encrypted PDFs produces corrupt output.
 */
function isEncryptedPdf(pdfBytes: Uint8Array): boolean {
  // Scan the last 4KB for trailer dict containing /Encrypt
  const tailSize = Math.min(4096, pdfBytes.length);
  const tail = new TextDecoder('latin1').decode(pdfBytes.subarray(pdfBytes.length - tailSize));
  // Check for /Encrypt in trailer region (handles both traditional and xref stream trailers)
  return /\/Encrypt\s/.test(tail) || /\/Encrypt\s*</.test(tail);
}

export async function signPDFWithPDFBox(
  pdfBytes: Uint8Array,
  signer: BrowserKeypairSigner,
  options: SignatureOptions = {}
): Promise<SignedPDFResult> {
  // Reject encrypted PDFs — signing them produces corrupt output
  if (isEncryptedPdf(pdfBytes)) {
    throw new Error('Cannot sign encrypted PDF. Decrypt the PDF first before signing.');
  }

  console.log('🎯 PDFBox-Based PDF Signing');
  console.log(`   PDF size: ${Math.floor(pdfBytes.length / 1024)} KB`);

  console.log('\n1️⃣  Adding visual signature appearance...');
  const prepared = await preparePdfWithAppearance(pdfBytes, signer, options);

  const result = await signPreparedPdfWithPDFBox(prepared, signer, options);

  // If LTV is enabled, append DSS dictionary as a second incremental save
  if (options.enableLTV) {
    console.log('\n🔒 Adding LTV (Long-Term Validation) data...');
    const { addLtvToPdf } = await import('./ltv.js');
    const ltvResult = await addLtvToPdf(result.signedData, options.ltvOptions);
    console.log(
      `   ✅ DSS embedded: ${ltvResult.certsEmbedded} certs, ` +
      `${ltvResult.ocspsEmbedded} OCSPs, ${ltvResult.crlsEmbedded} CRLs`
    );
    console.log(`   VRI key: ${ltvResult.vriKey}`);
    result.signedData = ltvResult.pdfBytes;
  }

  return result;
}

/**
 * Format date for PDF (D:YYYYMMDDHHmmSSOHH'mm')
 */
function formatPDFDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');

  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());

  return `D:${year}${month}${day}${hour}${minute}${second}+00'00'`;
}

function formatSigningTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getUTCFullYear() % 100;
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  return `${pad(year)}${month}${day}${hour}${minute}${second}Z`;
}

function getDeterministicSignatureDate(
  envVar = 'PDFBOX_TS_SIGN_TIME',
  fallback?: Date
): Date {
  const override = envVar && typeof process !== 'undefined' ? process.env?.[envVar] : undefined;
  if (override) {
    const parsed = Date.parse(override);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return fallback ?? new Date();
}

interface SignatureDictionaryOptions {
  signerName: string;
  reason?: string;
  location?: string;
  pdfDate: string;
  byteRange: COSArray;
  contents: COSString;
  referenceArray?: COSArray;
}

function createSignatureDictionary(options: SignatureDictionaryOptions): COSDictionary {
  const dict = new COSDictionary();
  dict.setItem(COSName.TYPE, COSName.SIG);
  dict.setItem(new COSName('Filter'), new COSName('Adobe.PPKLite'));
  dict.setItem(COSName.SUBFILTER, new COSName('adbe.pkcs7.detached'));
  dict.setItem(COSName.NAME, new COSString(options.signerName));
  if (options.reason) {
    dict.setItem(COSName.REASON, new COSString(options.reason));
  }
  if (options.location) {
    dict.setItem(COSName.LOCATION, new COSString(options.location));
  }
  dict.setItem(COSName.M, new COSString(options.pdfDate));
  if (options.referenceArray) {
    dict.setItem(new COSName('Reference'), options.referenceArray);
  }
  dict.setItem(COSName.CONTENTS, options.contents);
  dict.setItem(COSName.BYTERANGE, options.byteRange);
  return dict;
}

function createDocMdpReferenceDictionary(): COSDictionary {
  const sigRef = new COSDictionary();
  sigRef.setItem(COSName.TYPE, new COSName('SigRef'));
  sigRef.setItem(new COSName('TransformMethod'), new COSName('DocMDP'));
  sigRef.setItem(new COSName('DigestMethod'), new COSName('SHA1'));
  const transformParams = new COSDictionary();
  transformParams.setItem(COSName.TYPE, new COSName('TransformParams'));
  transformParams.setItem(COSName.P, new COSInteger(2));
  transformParams.setItem(new COSName('V'), new COSName('1.2'));
  sigRef.setItem(new COSName('TransformParams'), transformParams);
  return sigRef;
}

function createDocMdpPermsDictionary(sigKey: COSObjectKey): COSDictionary {
  const dict = new COSDictionary();
  dict.setItem(new COSName('DocMDP'), new COSObjectReference(sigKey));
  return dict;
}

/** OID for ecdsaWithSHA256 (1.2.840.10045.4.3.2) — not in forge.pki.oids */
const OID_ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';

interface PdfBoxCmsInputs {
  contentToSign: Uint8Array;
  /** Certificate info extracted from raw DER (forge-free, works with ECDSA). */
  certInfo: CertInfo;
  rawCertificateDer: Uint8Array;
  /** RSA private key. Required when signatureAlgorithm is 'RSA' and no precomputedSignature. */
  privateKey?: forge.pki.rsa.PrivateKey;
  signingDate: Date;
  useBerIndefiniteLength?: boolean;
  /** Pre-computed signature (forge binary string). Skips signing when provided. */
  precomputedSignature?: string;
  /** Pre-fetched RFC 3161 TimeStampToken DER bytes. Added as unsigned attribute. */
  timestampToken?: Uint8Array;
  /** Additional certificate chain (DER). Embedded in CMS certificates field for LTV. */
  chainCertsDer?: Uint8Array[];
  /** Signature algorithm. Default: 'RSA'. */
  signatureAlgorithm?: 'RSA' | 'ECDSA';
}

interface IndefiniteAsn1 extends forge.asn1.Asn1 {
  indefinite?: boolean;
  rawBytes?: Uint8Array;
}

interface AuthenticatedAttributeInputs {
  signingTime: string;
  contentDigest: Uint8Array;
  /** Signature algorithm for cmsAlgorithmProtection attribute. Default: 'RSA'. */
  signatureAlgorithm?: 'RSA' | 'ECDSA';
}

/**
 * Compute the RSA signature over authenticated attributes.
 *
 * Extracted from buildPdfBoxCmsSignature so the raw signature bytes
 * are available for RFC 3161 timestamping before CMS assembly.
 * Returns a forge binary string (same format as privateKey.sign()).
 */
export function computeRsaSignature(inputs: {
  contentToSign: Uint8Array;
  privateKey: forge.pki.rsa.PrivateKey;
  signingDate: Date;
}): string {
  const contentDigest = sha256Digest(inputs.contentToSign);
  const authenticatedAttributesList = buildAuthenticatedAttributes({
    signingTime: formatSigningTime(inputs.signingDate),
    contentDigest,
  });
  const attributeSetForDigest = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    authenticatedAttributesList
  );
  const attributeDer = forge.asn1.toDer(attributeSetForDigest).getBytes();
  const md = forge.md.sha256.create();
  md.update(attributeDer, 'raw');
  return inputs.privateKey.sign(md);
}

export function buildPdfBoxCmsSignature(inputs: PdfBoxCmsInputs): Uint8Array {
  const { contentToSign, certInfo, rawCertificateDer, signingDate } = inputs;
  const asn1 = forge.asn1;

  const digestAlgorithmSet = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [
    buildAlgorithmIdentifier(forge.pki.oids.sha256, false),
  ]);

  const encapContentInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    createObjectIdentifier(forge.pki.oids.data),
  ]);

  const certAsn1Node = {
    tagClass: forge.asn1.Class.UNIVERSAL,
    type: forge.asn1.Type.SEQUENCE,
    constructed: true,
    value: [],
    rawBytes: rawCertificateDer,
  } as unknown as IndefiniteAsn1;
  // Build certificates list: signing cert + chain certs (for LTV)
  const certNodes: forge.asn1.Asn1[] = [certAsn1Node];
  if (inputs.chainCertsDer && inputs.chainCertsDer.length > 0) {
    for (const chainDer of inputs.chainCertsDer) {
      certNodes.push({
        tagClass: forge.asn1.Class.UNIVERSAL,
        type: forge.asn1.Type.SEQUENCE,
        constructed: true,
        value: [],
        rawBytes: chainDer,
      } as unknown as IndefiniteAsn1);
    }
  }
  const certificatesNode = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true,
    certNodes,
  ) as IndefiniteAsn1;

  // Use issuer + serial from certInfo (forge-free — works with ECDSA certs)
  const signerIdentifier = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    certInfo.issuerAsn1,
    createIntegerFromHex(certInfo.serialHex),
  ]);

  const sigAlgo = inputs.signatureAlgorithm || 'RSA';
  const contentDigest = sha256Digest(contentToSign);
  const authenticatedAttributesList = buildAuthenticatedAttributes({
    signingTime: formatSigningTime(signingDate),
    contentDigest,
    signatureAlgorithm: sigAlgo,
  });
  const authenticatedAttributes = asn1.create(
    asn1.Class.CONTEXT_SPECIFIC,
    0,
    true,
    authenticatedAttributesList
  );

  let encryptedDigestBytes: string;
  if (inputs.precomputedSignature !== undefined) {
    encryptedDigestBytes = inputs.precomputedSignature;
  } else {
    if (!inputs.privateKey) {
      throw new Error('privateKey required when precomputedSignature is not provided');
    }
    const attributeSetForDigest = asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.SET,
      true,
      authenticatedAttributesList
    );
    const attributeDer = asn1.toDer(attributeSetForDigest).getBytes();
    const md = forge.md.sha256.create();
    md.update(attributeDer, 'raw');
    encryptedDigestBytes = inputs.privateKey.sign(md);
  }

  // SignerInfo signature algorithm: ECDSA omits NULL parameter (RFC 5754)
  const sigAlgOid = sigAlgo === 'ECDSA' ? OID_ECDSA_WITH_SHA256 : forge.pki.oids.sha256WithRSAEncryption;
  const includeNull = sigAlgo !== 'ECDSA';

  const signerInfoChildren: (forge.asn1.Asn1 | IndefiniteAsn1)[] = [
    createInteger(1),
    signerIdentifier,
    buildAlgorithmIdentifier(forge.pki.oids.sha256, false),
    authenticatedAttributes,
    buildAlgorithmIdentifier(sigAlgOid, includeNull),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, encryptedDigestBytes),
  ];

  if (inputs.timestampToken) {
    signerInfoChildren.push(buildUnsignedAttributes(inputs.timestampToken));
  }

  const signerInfo = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.SEQUENCE,
    true,
    signerInfoChildren as forge.asn1.Asn1[]
  );

  const signerInfos = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [signerInfo]);
  const signedData = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    createInteger(1),
    digestAlgorithmSet,
    encapContentInfo,
    certificatesNode,
    signerInfos,
  ]) as IndefiniteAsn1;

  const signedDataWrapper = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    signedData,
  ]) as IndefiniteAsn1;

  const contentInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    createObjectIdentifier(forge.pki.oids.signedData),
    signedDataWrapper,
  ]) as IndefiniteAsn1;

  if (inputs.useBerIndefiniteLength !== false) {
    markPdfBoxIndefiniteNodes(contentInfo, signedDataWrapper, signedData, certificatesNode);
  }
  return encodeAsn1Node(contentInfo);
}

function buildAuthenticatedAttributes(
  inputs: AuthenticatedAttributeInputs
): forge.asn1.Asn1[] {
  const asn1 = forge.asn1;
  const contentTypeAttr = createAttribute(forge.pki.oids.contentType, [
    createObjectIdentifier(forge.pki.oids.data),
  ]);

  const signingTimeAttr = createAttribute(forge.pki.oids.signingTime, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.UTCTIME,
      false,
      inputs.signingTime
    ),
  ]);

  const isEcdsa = inputs.signatureAlgorithm === 'ECDSA';
  const sigAlgOid = isEcdsa ? OID_ECDSA_WITH_SHA256 : forge.pki.oids.sha256WithRSAEncryption;

  // ECDSA algorithm identifiers omit the NULL parameter (RFC 5754 §3.2)
  // RSA algorithm identifiers include explicit NULL (RFC 4055)
  const sigAlgChildren: forge.asn1.Asn1[] = [createObjectIdentifier(sigAlgOid)];
  if (!isEcdsa) {
    sigAlgChildren.push(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''));
  }

  const cmsAlgorithmProtectionAttr = createAttribute('1.2.840.113549.1.9.52', [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      buildAlgorithmIdentifier(forge.pki.oids.sha256, false),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, sigAlgChildren),
    ]),
  ]);

  const messageDigestAttr = createAttribute(forge.pki.oids.messageDigest, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      uint8ArrayToBinaryString(inputs.contentDigest)
    ),
  ]);

  return [contentTypeAttr, signingTimeAttr, cmsAlgorithmProtectionAttr, messageDigestAttr];
}

/**
 * Build unsigned attributes node containing an RFC 3161 timestamp token.
 *
 * UnsignedAttributes ::= [1] IMPLICIT SET OF Attribute
 * The single attribute is id-aa-timeStampToken (1.2.840.113549.1.9.16.2.14)
 * with the raw DER of the TimeStampToken as its value.
 */
function buildUnsignedAttributes(timestampToken: Uint8Array): IndefiniteAsn1 {
  const asn1 = forge.asn1;
  const tsTokenOid = '1.2.840.113549.1.9.16.2.14';

  // Inject the TimeStampToken DER as raw bytes (same pattern as certificate DER)
  const tsTokenNode = {
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.SEQUENCE,
    constructed: true,
    value: [],
    rawBytes: timestampToken,
  } as unknown as IndefiniteAsn1;

  const attribute = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    createObjectIdentifier(tsTokenOid),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [tsTokenNode]),
  ]);

  // [1] IMPLICIT SET OF Attribute
  return asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [attribute]) as IndefiniteAsn1;
}

function buildAlgorithmIdentifier(oid: string, includeNull: boolean): forge.asn1.Asn1 {
  const asn1 = forge.asn1;
  const children: forge.asn1.Asn1[] = [createObjectIdentifier(oid)];
  if (includeNull) {
    children.push(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''));
  }
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children);
}

function createAttribute(oid: string, values: forge.asn1.Asn1[]): forge.asn1.Asn1 {
  const asn1 = forge.asn1;
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    createObjectIdentifier(oid),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, values),
  ]);
}

function createInteger(value: number): forge.asn1.Asn1 {
  const asn1 = forge.asn1;
  const der = forge.asn1.integerToDer(value);
  return asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.INTEGER,
    false,
    der.getBytes()
  );
}

function createIntegerFromHex(hex: string): forge.asn1.Asn1 {
  const asn1 = forge.asn1;
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const needsPadding = parseInt(normalized.slice(0, 2), 16) & 0x80;
  const bytes = forge.util.hexToBytes((needsPadding ? '00' : '') + normalized);
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, bytes);
}

function createObjectIdentifier(oid: string): forge.asn1.Asn1 {
  const asn1 = forge.asn1;
  return asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.OID,
    false,
    forge.asn1.oidToDer(oid).getBytes()
  );
}

function markPdfBoxIndefiniteNodes(
  contentInfo: IndefiniteAsn1,
  signedDataWrapper: IndefiniteAsn1,
  signedData: IndefiniteAsn1,
  certificatesNode: IndefiniteAsn1
): void {
  contentInfo.indefinite = true;
  signedDataWrapper.indefinite = true;
  signedData.indefinite = true;
  certificatesNode.indefinite = true;
}

function encodeAsn1Node(node: IndefiniteAsn1): Uint8Array {
  if (node.rawBytes) {
    return node.rawBytes;
  }
  const tagByte = buildTagByte(node);
  let content: Uint8Array;
  if (node.constructed) {
    const children = (node.value ?? []) as IndefiniteAsn1[];
    const encodedChildren = children.map((child) => encodeAsn1Node(child));
    content = concatUint8Arrays(encodedChildren);
  } else {
    content = extractPrimitiveContent(node);
  }

  if (node.indefinite && node.constructed) {
    return concatUint8Arrays([
      Uint8Array.of(tagByte, 0x80),
      content,
      Uint8Array.of(0x00, 0x00),
    ]);
  }

  const lengthBytes = encodeLength(content.length);
  return concatUint8Arrays([Uint8Array.of(tagByte), lengthBytes, content]);
}

function extractPrimitiveContent(node: forge.asn1.Asn1): Uint8Array {
  const derStr = forge.asn1.toDer(node).getBytes();
  const bytes = byteStringToUint8Array(derStr);
  const { headerLength, contentLength } = decodeHeader(bytes);
  return bytes.subarray(headerLength, headerLength + contentLength);
}

function buildTagByte(node: forge.asn1.Asn1): number {
  const tagClass = (node.tagClass ?? forge.asn1.Class.UNIVERSAL) & 0xc0;
  const constructedBit = node.constructed ? 0x20 : 0x00;
  const type = node.type & 0x1f;
  return tagClass | constructedBit | type;
}

function encodeLength(length: number): Uint8Array {
  if (length < 0x80) {
    return Uint8Array.of(length);
  }
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function decodeHeader(bytes: Uint8Array): { headerLength: number; contentLength: number } {
  let offset = 0;
  offset += 1; // tag
  const firstLenByte = bytes[offset];
  offset += 1;
  if ((firstLenByte & 0x80) === 0) {
    return { headerLength: offset, contentLength: firstLenByte };
  }
  const numBytes = firstLenByte & 0x7f;
  let contentLength = 0;
  for (let i = 0; i < numBytes; i++) {
    contentLength = (contentLength << 8) | bytes[offset + i];
  }
  offset += numBytes;
  return { headerLength: offset, contentLength };
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

function byteStringToUint8Array(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

function sha256Digest(data: Uint8Array): Uint8Array {
  const md = forge.md.sha256.create();
  md.update(uint8ArrayToBinaryString(data), 'raw');
  return byteStringToUint8Array(md.digest().getBytes());
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

// ─── Appearance stream helpers ─────────────────────────────────────────────

/** Set common Form XObject headers (Type, Subtype, BBox). */
function setFormXObjectHeaders(stream: COSStream, w: number, h: number): void {
  stream.setItem(COSName.TYPE, new COSName('XObject'));
  stream.setItem(new COSName('Subtype'), new COSName('Form'));
  const bboxArray = new COSArray();
  bboxArray.add(new COSFloat(0, '0'));
  bboxArray.add(new COSFloat(0, '0'));
  bboxArray.add(new COSFloat(w, String(w)));
  bboxArray.add(new COSFloat(h, String(h)));
  stream.setItem(new COSName('BBox'), bboxArray);
}

/** Build a standard Type1 font dict (Helvetica, Helvetica-Bold, etc.). */
function buildStandardFontDict(baseFontName: string): COSDictionary {
  const dict = new COSDictionary();
  dict.setItem(new COSName('Type'), new COSName('Font'));
  dict.setItem(new COSName('Subtype'), new COSName('Type1'));
  dict.setItem(new COSName('BaseFont'), new COSName(baseFontName));
  dict.setItem(new COSName('Encoding'), new COSName('WinAnsiEncoding'));
  return dict;
}

/** Build the metadata footer text for all appearance modes. */
function buildFooterText(brandText: string | undefined, date: Date, fieldName: string): string {
  const brand = brandText || 'Dapple SafeSign';
  const dateStr = formatDisplayDate(date);
  return `Digitally signed via ${brand}  |  ${dateStr}  |  ${fieldName}`;
}

/** Format a Date for display in the signature info box. */
function formatDisplayDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const hr = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  return `${y}-${m}-${d} ${hr}:${min} UTC`;
}

/** Truncate text to fit within maxWidth using font metrics, appending "..." */
function truncateToFit(
  text: string,
  fontSize: number,
  maxWidth: number,
  fontName: string = 'Helvetica'
): string {
  const metrics = StandardFontMetrics.load(fontName);
  const fullWidth = metrics.widthOfTextAtSize(text, fontSize, WinAnsiEncoding);
  if (fullWidth <= maxWidth) return text;

  const ellipsis = '...';
  const ellipsisWidth = metrics.widthOfTextAtSize(ellipsis, fontSize, WinAnsiEncoding);
  const targetWidth = maxWidth - ellipsisWidth;

  let truncated = '';
  let currentWidth = 0;
  for (const char of text) {
    const charWidth = metrics.widthOfTextAtSize(char, fontSize, WinAnsiEncoding);
    if (currentWidth + charWidth > targetWidth) break;
    truncated += char;
    currentWidth += charWidth;
  }
  return truncated + ellipsis;
}

/**
 * Build the signature appearance content stream.
 * Mirrors Adobe Acrobat's clean signature style:
 * - No background fill, no heavy borders — clean and open
 * - Signature image spans the left ~50%, full height
 * - Subtle brand watermark behind the text (very light, like Adobe's red swoosh)
 * - "Digitally signed / by [name]" in bold, date + details below
 * - Small "Dapple SafeSign" branding at bottom-right, understated
 */
function buildInfoBoxContentStream(params: {
  w: number;
  h: number;
  hasImage: boolean;
  brandText: string;
  signerName: string;
  signingDate: Date;
  reason?: string;
  location?: string;
  showFooter?: boolean;
  fieldName?: string;
}): ContentStreamBuilder {
  const { w, h, hasImage, brandText, signerName, signingDate, reason, location, showFooter, fieldName } = params;

  const stream = new ContentStreamBuilder();

  // ── Layout ──
  // Reserve footer space at bottom, then split remaining height for content
  const brandSize = Math.min(5.5, Math.max(4, h * 0.065));
  const footerH = (showFooter !== false) ? brandSize + 4 : 0;
  const contentH = h - footerH;  // usable height for image + text
  const imgFraction = hasImage ? 0.38 : 0;
  const imgAreaW = Math.round(w * imgFraction);
  const textX = imgAreaW + (hasImage ? 2 : 6);
  const rightPad = 4;
  const textW = w - textX - rightPad;

  // ── 0. White background for text area (snug — minimal right margin) ──
  stream.pushGraphicsState()
    .raw('1 1 1 rg')
    .raw(`${imgAreaW} ${footerH} ${w - imgAreaW - rightPad} ${contentH} re`)
    .raw('f')
    .popGraphicsState();

  // ── 1. Dapple logo watermark behind text (right-biased under text) ──
  {
    const logoSize = contentH * 0.75;
    const textCenterX = imgAreaW + (w - imgAreaW) * 0.6;
    const logoX = textCenterX - logoSize / 2;
    const logoY = footerH + (contentH - logoSize) / 2;
    stream.pushGraphicsState()
      .concatMatrix(logoSize, 0, 0, logoSize, logoX, logoY)
      .drawXObject('Logo')
      .popGraphicsState();
  }

  // ── 2. Draw signature image on left (flush with content area) ──
  if (hasImage) {
    stream.pushGraphicsState()
      .concatMatrix(imgAreaW, 0, 0, contentH, 0, footerH)
      .drawXObject('Img')
      .popGraphicsState();
  }

  // ── 3. Text: "Digitally signed / by [name]" ──
  const headerSize = Math.min(9, Math.max(6, contentH * 0.15));
  const bodySize = Math.min(7.5, Math.max(5, contentH * 0.11));
  const headerLineH = headerSize + 2;
  const bodyLineH = bodySize + 2;

  let cursorY = footerH + contentH - headerSize - 2;

  // "Digitally signed" (bold)
  stream.beginText()
    .setFontAndSize('F2', headerSize)
    .raw('0.2 0.15 0.25 rg')
    .moveText(textX, cursorY)
    .showText(encodeTextToHex(
      truncateToFit('Digitally signed', headerSize, textW, 'Helvetica-Bold'),
      WinAnsiEncoding))
    .endText();
  cursorY -= headerLineH;

  // "by [Name]" (bold)
  stream.beginText()
    .setFontAndSize('F2', headerSize)
    .raw('0.2 0.15 0.25 rg')
    .moveText(textX, cursorY)
    .showText(encodeTextToHex(
      truncateToFit(`by ${signerName}`, headerSize, textW, 'Helvetica-Bold'),
      WinAnsiEncoding))
    .endText();
  cursorY -= headerLineH + 1;

  // ── 4. Date + reason + location (regular weight, lighter color) ──
  const details: string[] = [];
  details.push(`Date: ${formatDisplayDate(signingDate)}`);
  if (reason) details.push(`Reason: ${reason}`);
  if (location) details.push(`Location: ${location}`);

  if (cursorY > footerH + 4) {
    stream.beginText()
      .setFontAndSize('F1', bodySize)
      .raw('0.35 0.30 0.40 rg')
      .moveText(textX, cursorY);

    for (let i = 0; i < details.length; i++) {
      if (cursorY - i * bodyLineH < footerH + 4) break;
      stream.showText(encodeTextToHex(
        truncateToFit(details[i], bodySize, textW),
        WinAnsiEncoding));
      if (i < details.length - 1) stream.moveText(0, -bodyLineH);
    }
    stream.endText();
  }

  // ── 5. Metadata footer at bottom ──
  if (showFooter !== false) {
    const footerText = buildFooterText(brandText, signingDate, fieldName || 'Signature');
    const truncFooter = truncateToFit(footerText, brandSize, w - 6);
    const footerW = StandardFontMetrics.load('Helvetica')
      .widthOfTextAtSize(truncFooter, brandSize, WinAnsiEncoding);
    stream.beginText()
      .setFontAndSize('F1', brandSize)
      .raw('0.6 0.6 0.6 rg')
      .moveText(w - footerW - 3, 2)
      .showText(encodeTextToHex(truncFooter, WinAnsiEncoding))
      .endText();
  }

  return stream;
}

/**
 * Build a PNG XObject stream for embedding in the appearance stream.
 * Handles no-alpha PNGs with FlateDecode + PNG Predictor.
 * Alpha PNGs are supported by splitting into image + SMask.
 */
function buildPngXObject(imageBytes: Uint8Array): COSStream {
  // Parse PNG chunks
  if (imageBytes[0] !== 137 || imageBytes[1] !== 80 || imageBytes[2] !== 78 || imageBytes[3] !== 71) {
    throw new Error('Not a valid PNG file (missing signature)');
  }
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];
  while (offset < imageBytes.length) {
    const length = (imageBytes[offset] << 24) | (imageBytes[offset + 1] << 16) |
      (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
    const type = String.fromCharCode(imageBytes[offset + 4], imageBytes[offset + 5],
      imageBytes[offset + 6], imageBytes[offset + 7]);
    if (type === 'IHDR') {
      width = (imageBytes[offset + 8] << 24) | (imageBytes[offset + 9] << 16) |
        (imageBytes[offset + 10] << 8) | imageBytes[offset + 11];
      height = (imageBytes[offset + 12] << 24) | (imageBytes[offset + 13] << 16) |
        (imageBytes[offset + 14] << 8) | imageBytes[offset + 15];
      bitDepth = imageBytes[offset + 16];
      colorType = imageBytes[offset + 17];
    } else if (type === 'IDAT') {
      idatChunks.push(imageBytes.slice(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const totalLength = idatChunks.reduce((sum, c) => sum + c.length, 0);
  const idatData = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of idatChunks) { idatData.set(chunk, pos); pos += chunk.length; }

  // Decompress IDAT
  let rawData: Uint8Array;
  try { rawData = pako.inflate(idatData); } catch {
    rawData = pako.inflateRaw(idatData.slice(2, idatData.length - 4));
  }

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 3;
  const hasAlpha = colorType === 4 || colorType === 6;
  const colorChannels = hasAlpha ? channels - 1 : channels;
  const colorSpace = colorChannels === 1 ? 'DeviceGray' : 'DeviceRGB';

  if (!hasAlpha) {
    // No alpha — use IDAT data with PNG Predictor
    const stream = new COSStream();
    stream.setItem('Type', new COSName('XObject'));
    stream.setItem('Subtype', new COSName('Image'));
    stream.setItem('Width', new COSInteger(width));
    stream.setItem('Height', new COSInteger(height));
    stream.setItem('ColorSpace', new COSName(colorSpace));
    stream.setItem('BitsPerComponent', new COSInteger(bitDepth));
    stream.setItem('Filter', new COSName('FlateDecode'));
    const decodeParms = new COSDictionary();
    decodeParms.setDirect(true);
    decodeParms.setItem('Predictor', new COSInteger(15));
    decodeParms.setItem('Columns', new COSInteger(width));
    decodeParms.setItem('Colors', new COSInteger(colorChannels));
    decodeParms.setItem('BitsPerComponent', new COSInteger(bitDepth));
    stream.setItem('DecodeParms', decodeParms);
    stream.setData(pako.deflate(rawData));
    return stream;
  }

  // Alpha PNG: split color and alpha channels
  const bytesPerPixel = channels * (bitDepth / 8);
  const rowBytes = Math.ceil(width * bytesPerPixel) + 1;
  const colorBpp = colorChannels * (bitDepth / 8);
  const alphaBpp = bitDepth / 8;
  const colorRowBytes = 1 + width * colorBpp;
  const alphaRowBytes = 1 + width * alphaBpp;
  const colorData = new Uint8Array(colorRowBytes * height);
  const alphaData = new Uint8Array(alphaRowBytes * height);
  for (let row = 0; row < height; row++) {
    const srcOffset = row * rowBytes;
    const filterByte = rawData[srcOffset];
    colorData[row * colorRowBytes] = filterByte;
    alphaData[row * alphaRowBytes] = filterByte;
    for (let x = 0; x < width; x++) {
      const pixelStart = srcOffset + 1 + x * bytesPerPixel;
      const colorDst = row * colorRowBytes + 1 + x * colorBpp;
      const alphaDst = row * alphaRowBytes + 1 + x * alphaBpp;
      for (let c = 0; c < colorChannels; c++) {
        colorData[colorDst + c * (bitDepth / 8)] = rawData[pixelStart + c * (bitDepth / 8)];
      }
      for (let a = 0; a < alphaBpp; a++) {
        alphaData[alphaDst + a] = rawData[pixelStart + colorChannels * (bitDepth / 8) + a];
      }
    }
  }

  // Build SMask stream (not registered as separate object — inline via setDirect on stream isn't
  // possible, so we'll embed it as an inline value. For signature images this is fine.)
  // Actually, COSStream can't be direct in all writers, so we embed the alpha as a simple
  // deflated stream in the main image's SMask. For simplicity with the signing pipeline,
  // we'll just strip alpha and produce a non-alpha image.
  // Signature images rarely need alpha — just use the color channels.
  const stream = new COSStream();
  stream.setItem('Type', new COSName('XObject'));
  stream.setItem('Subtype', new COSName('Image'));
  stream.setItem('Width', new COSInteger(width));
  stream.setItem('Height', new COSInteger(height));
  stream.setItem('ColorSpace', new COSName(colorSpace));
  stream.setItem('BitsPerComponent', new COSInteger(bitDepth));
  stream.setItem('Filter', new COSName('FlateDecode'));
  const decodeParms = new COSDictionary();
  decodeParms.setDirect(true);
  decodeParms.setItem('Predictor', new COSInteger(15));
  decodeParms.setItem('Columns', new COSInteger(width));
  decodeParms.setItem('Colors', new COSInteger(colorChannels));
  decodeParms.setItem('BitsPerComponent', new COSInteger(bitDepth));
  stream.setItem('DecodeParms', decodeParms);
  stream.setData(pako.deflate(colorData));
  return stream;
}

function buildZeroBBoxArray(): COSArray {
  const array = new COSArray();
  for (let i = 0; i < 4; i++) {
    array.add(new COSFloat(0, '0.0'));
  }
  return array;
}

function writeFullDocumentForSignature(params: {
  originalPdf: Uint8Array;
  trailer: TrailerInfo;
  replacements: ObjectWriteEntry[];
  useXrefStream?: boolean;
}): SignatureWriterResult {
  const { originalPdf, trailer, replacements } = params;
  const rawDocument = loadRawIndirectObjects(originalPdf, trailer);
  const parsedObjects: ParsedIndirectObject[] = loadParsedIndirectObjects(originalPdf, trailer);
  const rawMap = new Map<string, RawIndirectObject>();
  for (const obj of rawDocument.objects) {
    rawMap.set(buildObjectMapKey(obj.key), obj);
  }
  const replacementMap = new Map<string, ObjectWriteEntry>();
  for (const entry of replacements) {
    replacementMap.set(buildObjectMapKey(entry.key), entry);
  }

  // Build object map for compression plan - include both parsed objects and replacements
  const objectsMap = new Map<string, COSBase>();
  for (const parsed of parsedObjects) {
    objectsMap.set(buildObjectMapKey(parsed.key), parsed.object);
  }
  // Replacements override existing objects and add new ones
  for (const entry of replacements) {
    if (entry.object) {
      objectsMap.set(buildObjectMapKey(entry.key), entry.object);
    }
  }

  const compressionPlan = buildCompressionPlan({
    trailerRoot: new COSObjectKey(trailer.rootRef.objectNumber, trailer.rootRef.generation),
    trailerInfo: trailer.infoRef
      ? new COSObjectKey(trailer.infoRef.objectNumber, trailer.infoRef.generation)
      : undefined,
    trailerEncrypt: trailer.encryptRef
      ? new COSObjectKey(trailer.encryptRef.objectNumber, trailer.encryptRef.generation)
      : undefined,
    objects: objectsMap,
  });
  if (typeof process !== 'undefined' && process.env?.PDFBOX_TS_TRACE && process.env.PDFBOX_TS_TRACE !== '0') {
    console.log('[TS TRACE] compressionPlan', {
      parsedSize: parsedObjects.length,
      replacementSize: replacements.length,
      objStm: compressionPlan.objectStreamKeys.length,
      topLevel: compressionPlan.topLevelKeys.length,
    });
  }

  const pickPayload = (keyStr: string): { key: COSObjectKey; object?: COSBase; raw?: Uint8Array } => {
    const replacement = replacementMap.get(keyStr);
    if (replacement) {
      return { key: replacement.key, object: replacement.object };
    }
    const parsed = parsedObjects.find((p) => buildObjectMapKey(p.key) === keyStr);
    if (parsed) {
      return { key: parsed.key, object: parsed.object };
    }
    const raw = rawMap.get(keyStr);
    if (raw) {
      return { key: raw.key, raw: raw.raw };
    }
    const [obj, gen] = keyStr.split('_').map((v) => Number(v));
    return { key: new COSObjectKey(obj, gen) };
  };

  const finalObjects: FullSaveObject[] = [];
  const addedKeys = new Set<string>();
  const appendObject = (entry: FullSaveObject) => {
    const keyStr = buildObjectMapKey(entry.key);
    if (addedKeys.has(keyStr)) {
      return;
    }
    addedKeys.add(keyStr);
    finalObjects.push(entry);
  };

  // Process top-level objects from compression plan (streams, gen>0, trailer refs, signatures)
  for (const key of compressionPlan.topLevelKeys) {
    const keyStr = buildObjectMapKey(key);
    const payload = pickPayload(keyStr);
    if (!payload.object && !payload.raw) {
      continue;
    }
    appendObject({
      key: payload.key,
      object: payload.object,
      raw: payload.raw,
      packInObjectStream: false,
    });
    replacementMap.delete(keyStr);
  }

  // Process packable objects from compression plan
  for (const key of compressionPlan.objectStreamKeys) {
    const keyStr = buildObjectMapKey(key);
    const payload = pickPayload(keyStr);
    if (!payload.object) {
      // only pack if we have a parsed object
      continue;
    }
    appendObject({
      key: payload.key,
      object: payload.object,
      packInObjectStream: true,
    });
    replacementMap.delete(keyStr);
  }

  // Any replacements not covered by compression plan (shouldn't happen normally)
  const remainingReplacements = [...replacementMap.values()].sort((a, b) => {
    if (a.key.objectNumber === b.key.objectNumber) {
      return a.key.generationNumber - b.key.generationNumber;
    }
    return a.key.objectNumber - b.key.objectNumber;
  });
  for (const entry of remainingReplacements) {
    appendObject({
      key: entry.key,
      object: entry.object,
      packInObjectStream: entry.packInObjectStream,
    });
  }

  const result = saveFullDocument({
    trailer,
    objects: finalObjects,
    autoPackObjectStreams: true,
    objectStreamMinNumber: 1,
    // Full-save should mirror PDFBox's compressed save: prefer xref stream when packing ObjStm.
    useXrefStream: true,
  });
  return {
    bytes: result.bytes,
    signatureInfo: result.signatureInfo,
    startxref: result.startxref,
  };
}

function buildObjectMapKey(key: COSObjectKey): string {
  return `${key.objectNumber}_${key.generationNumber}`;
}

function decideFullSaveMode(
  pdfBytes: Uint8Array,
  trailer: TrailerInfo,
  explicit?: boolean
): { forceFullSave: boolean; reason?: string } {
  // Check environment variable override for testing (highest priority for debugging)
  // Guarded for browser environments where `process` is not defined
  try {
    const envForce = typeof process !== 'undefined' && process.env?.PDFBOX_TS_FORCE_FULL_SAVE;
    if (envForce === '1' || envForce === 'true') {
      return { forceFullSave: true, reason: 'env-override' };
    }
  } catch {
    // Browser environment — no process global
  }

  // Check for explicit option
  if (explicit !== undefined) {
    return { forceFullSave: !!explicit, reason: 'explicit-option' };
  }

  try {
    const { entries } = parseXrefEntries(pdfBytes, trailer);
    const hasObjStm = entries.some((e) => e.type === XRefEntryType.OBJECT_STREAM);
    const usesXrefStream = trailer.hasXRefStream;

    // PDFBox triggers full-save for documents with object streams
    // This matches Java's behavior of repacking ObjStm documents
    if (usesXrefStream && hasObjStm) {
      return {
        forceFullSave: true,
        reason: 'xref-stream-with-objstm',
      };
    }

    return { forceFullSave: false };
  } catch (error) {
    return {
      forceFullSave: true,
      reason: 'xref-parse-failed',
    };
  }
}

function applyDeterministicId(trailer: TrailerInfo, id: Uint8Array): void {
  const normalized = normalizeDeterministicId(id);
  trailer.generatedId = normalized;
  trailer.idLiteral = buildIdLiteral(normalized);
}

function normalizeDeterministicId(id: Uint8Array): Uint8Array {
  const normalized = new Uint8Array(id.length);
  normalized.set(id);
  return normalized;
}

function buildIdLiteral(id: Uint8Array): string {
  const hex = toUpperHex(id);
  return `[<${hex}> <${hex}>]`;
}

function toUpperHex(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).padStart(2, '0');
  }
  return result.toUpperCase();
}

const SNIPPET_DECODER = new TextDecoder('latin1');

function logOriginalObjectSnippet(
  label: string,
  pdfBytes: Uint8Array,
  offset: number
): void {
  try {
    const stream = new COSInputStream(pdfBytes, offset, offset + 80);
    const snippetBytes = stream.read(80);
    const snippet = SNIPPET_DECODER.decode(snippetBytes).replace(/\s+/g, ' ').trim();
    console.log(`      • original ${label}@${offset}: ${snippet}`);
  } catch (error) {
    console.warn(
      `      • Failed to read original ${label} object at ${offset}: ${(error as Error).message}`
    );
  }
}

function loadObjectOrThrow(
  state: COSDocumentState,
  pdfBytes: Uint8Array,
  objectNumber: number,
  generation: number,
  label: string
) {
  try {
    const resolve = createObjectResolver(state, pdfBytes);
    return resolve(objectNumber, generation);
  } catch (error) {
    throw new UnsupportedPdfFeatureError({
      feature: 'missing-object',
      message: `Failed to locate ${label} object ${objectNumber} ${generation} R in the original PDF.`,
      recommendation:
        "Port PDFBox's COSParser/COSDocument traversal so previously existing objects can be resolved deterministically.",
      context: { label, objectNumber, generation, cause: (error as Error).message },
    });
  }
}
