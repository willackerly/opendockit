/**
 * LTV (Long-Term Validation) Support
 *
 * Adds a DSS (Document Security Store) dictionary to a signed PDF via a
 * second incremental save.  This embeds all certificates, OCSP responses,
 * and CRLs needed to validate the signature offline, even after the signer
 * certificate expires.
 *
 * References:
 * - PDF 2.0 spec §12.8.4 (DSS dictionary)
 * - ETSI EN 319 142-1 (PAdES baseline signatures)
 * - PAdES Part 4 (ETSI TS 102 778-4)
 * - Java PDFBox AddValidationInformation.java
 */

import forge from 'node-forge';
import { deflate } from 'pako';
import {
  COSArray,
  COSDictionary,
  COSName,
  COSInteger,
  COSStream,
  COSString,
  COSObjectReference,
  COSObjectKey,
  parsePdfTrailer,
  IncrementalUpdateManager,
  IncrementalWriteContext,
  COSDocumentState,
} from '../pdfbox';
import { createObjectResolver } from '../pdfbox/parser/object';
import { parseCOSDictionary } from '../pdfbox/parser/cosParser';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface LtvOptions {
  /** Extra certificates (DER) to embed beyond those in the CMS signature. */
  extraCerts?: Uint8Array[];
  /** Pre-fetched OCSP responses (DER) to embed. If not provided and
   *  `fetchRevocationData` is true, OCSP will be fetched from AIA URLs. */
  ocspResponses?: Uint8Array[];
  /** Pre-fetched CRLs (DER) to embed. If not provided and
   *  `fetchRevocationData` is true, CRLs will be fetched from CDP URLs. */
  crls?: Uint8Array[];
  /** Attempt to fetch OCSP/CRL data from cert extensions. Default: true. */
  fetchRevocationData?: boolean;
  /** Timeout (ms) for OCSP/CRL HTTP requests. Default: 15000. */
  timeoutMs?: number;
}

export interface LtvResult {
  /** PDF bytes with DSS dictionary appended as incremental save. */
  pdfBytes: Uint8Array;
  /** Certificates embedded in the DSS. */
  certsEmbedded: number;
  /** OCSP responses embedded in the DSS. */
  ocspsEmbedded: number;
  /** CRLs embedded in the DSS. */
  crlsEmbedded: number;
  /** VRI key (uppercase hex SHA-1 of signature Contents). */
  vriKey: string;
}

export class LtvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LtvError';
  }
}

/**
 * Add LTV (Long-Term Validation) data to a signed PDF.
 *
 * This appends a second incremental save containing a DSS dictionary
 * in the catalog with embedded certificates, OCSP responses, and CRLs.
 *
 * The signed PDF's existing signature is NOT modified — the DSS is added
 * as a separate incremental update, which is the standard approach per
 * PAdES-LTV (ETSI TS 102 778-4) and PDF 2.0 §12.8.4.
 */
export async function addLtvToPdf(
  signedPdf: Uint8Array,
  options: LtvOptions = {}
): Promise<LtvResult> {
  const fetchRevocation = options.fetchRevocationData ?? true;
  const timeoutMs = options.timeoutMs ?? 15_000;

  // ─── Step 1: Extract the CMS signature from /Contents ───────────────
  const sigContents = extractSignatureContents(signedPdf);
  if (!sigContents) {
    throw new LtvError('No signature /Contents found in the PDF');
  }

  // ─── Step 2: Compute VRI key (SHA-1 of raw signature bytes) ─────────
  const vriKey = computeVriKey(sigContents);

  // ─── Step 3: Extract certificates from the CMS SignedData ───────────
  const cmsCerts = extractCertsFromCms(sigContents);

  // Merge with any extra certs the caller provided
  const allCertsDer: Uint8Array[] = [...cmsCerts];
  if (options.extraCerts) {
    for (const extra of options.extraCerts) {
      if (!allCertsDer.some((c) => arraysEqual(c, extra))) {
        allCertsDer.push(extra);
      }
    }
  }

  // ─── Step 4: Fetch OCSP / CRL revocation data ──────────────────────
  const ocspResponses: Uint8Array[] = [...(options.ocspResponses ?? [])];
  const crls: Uint8Array[] = [...(options.crls ?? [])];

  if (fetchRevocation && allCertsDer.length > 0) {
    await fetchRevocationDataForChain(
      allCertsDer,
      ocspResponses,
      crls,
      timeoutMs
    );
  }

  // ─── Step 5: Build DSS dictionary and write incremental save ────────
  const result = writeDssIncrementalSave(
    signedPdf,
    allCertsDer,
    ocspResponses,
    crls,
    vriKey
  );

  return {
    pdfBytes: result,
    certsEmbedded: allCertsDer.length,
    ocspsEmbedded: ocspResponses.length,
    crlsEmbedded: crls.length,
    vriKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the raw CMS signature bytes from the PDF's /Contents field.
 * Returns null if no signature dictionary is found.
 */
function extractSignatureContents(pdf: Uint8Array): Uint8Array | null {
  // Scan backwards from the end to find the most recent signature's ByteRange
  const text = uint8ArrayToString(pdf);

  // Find /Type /Sig dictionaries — look for /Contents <hex>
  // We need the last signature in the file (most recent incremental save)
  let lastContentsOffset = -1;
  const contentsPattern = /\/Contents\s*</g;
  let match: RegExpExecArray | null;
  while ((match = contentsPattern.exec(text)) !== null) {
    // Verify this is inside a /Type /Sig dictionary by checking nearby context
    const contextStart = Math.max(0, match.index - 500);
    const context = text.slice(contextStart, match.index);
    if (context.includes('/Type /Sig') || context.includes('/Type/Sig')) {
      lastContentsOffset = match.index;
    }
  }

  if (lastContentsOffset < 0) {
    return null;
  }

  // Extract the hex string between < and >
  const hexStart = text.indexOf('<', lastContentsOffset + '/Contents'.length);
  if (hexStart < 0) return null;
  const hexEnd = text.indexOf('>', hexStart + 1);
  if (hexEnd < 0) return null;

  const hexStr = text.slice(hexStart + 1, hexEnd);
  // Strip zero-padding from the hex string
  const trimmedHex = hexStr.replace(/0+$/, '');
  if (trimmedHex.length === 0) return null;
  // Ensure even length
  const evenHex = trimmedHex.length % 2 === 0 ? trimmedHex : trimmedHex + '0';
  return hexToUint8Array(evenHex);
}

// ─────────────────────────────────────────────────────────────────────────────
// VRI key computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the VRI key for a signature: uppercase hex SHA-1 of the raw
 * CMS signature bytes.
 *
 * Per ETSI EN 319 142-1: "The name used to identify a specific Signature
 * VRI dictionary shall be the base-16 (uppercase) encoded SHA-1 digest
 * of the signature to which it applies."
 */
export function computeVriKey(signatureBytes: Uint8Array): string {
  const md = forge.md.sha1.create();
  md.update(uint8ArrayToBinaryString(signatureBytes), 'raw');
  const hashBytes = md.digest().getBytes();
  return binaryStringToHex(hashBytes).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Certificate extraction from CMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract all X.509 certificates from a CMS SignedData structure.
 * Returns DER-encoded certificate bytes.
 *
 * Handles both DER and BER (indefinite-length) encoded CMS.
 * When forge.asn1.fromDer() fails on BER, falls back to manual
 * certificate extraction by scanning for X.509 certificate sequences.
 */
function extractCertsFromCms(cmsBytes: Uint8Array): Uint8Array[] {
  const certs: Uint8Array[] = [];

  // First try standard ASN.1 parsing
  try {
    const asn1 = forge.asn1.fromDer(uint8ArrayToBinaryString(cmsBytes));
    const contentInfo = (asn1 as any).value as forge.asn1.Asn1[];
    if (contentInfo && contentInfo.length >= 2) {
      const contentWrapper = contentInfo[1]; // [0] EXPLICIT
      const signedDataSeq = ((contentWrapper as any).value as forge.asn1.Asn1[])?.[0];
      if (signedDataSeq) {
        const sdChildren = (signedDataSeq as any).value as forge.asn1.Asn1[];
        for (const child of sdChildren) {
          if (
            child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
            child.type === 0
          ) {
            const certSequences = (child as any).value as forge.asn1.Asn1[];
            for (const certSeq of certSequences) {
              try {
                const certDer = forge.asn1.toDer(certSeq).getBytes();
                certs.push(binaryStringToUint8Array(certDer));
              } catch {
                // Skip individual cert serialization failures
              }
            }
            break;
          }
        }
      }
    }
  } catch {
    // forge.asn1.fromDer() fails on BER indefinite-length encoding.
    // Fall back to manual extraction: scan for X.509 SEQUENCE patterns.
  }

  // If ASN.1 parsing didn't find certs (common with BER indefinite-length),
  // scan the raw bytes for X.509 certificate SEQUENCE patterns.
  if (certs.length === 0) {
    const found = scanForCertificates(cmsBytes);
    certs.push(...found);
  }

  return certs;
}

// ─────────────────────────────────────────────────────────────────────────────
// OCSP & CRL fetching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the OCSP responder URL from a certificate's AIA extension.
 * OID: 1.3.6.1.5.5.7.1.1 (Authority Information Access)
 * Access method: 1.3.6.1.5.5.7.48.1 (id-ad-ocsp)
 */
export function extractOcspUrl(certDer: Uint8Array): string | null {
  try {
    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(uint8ArrayToBinaryString(certDer))
    );
    const aiaExt = cert.getExtension('authorityInfoAccess');
    if (!aiaExt) return null;

    // forge doesn't fully parse AIA — parse the raw ASN.1 value
    const aiaAsn1 = forge.asn1.fromDer((aiaExt as any).value as string);
    const accessDescriptions = (aiaAsn1 as any).value as forge.asn1.Asn1[];
    for (const desc of accessDescriptions) {
      const children = desc.value as forge.asn1.Asn1[];
      if (children.length < 2) continue;
      const methodOid = forge.asn1.derToOid(children[0].value as string);
      // id-ad-ocsp = 1.3.6.1.5.5.7.48.1
      if (methodOid === '1.3.6.1.5.5.7.48.1') {
        // Access location is a GeneralName [6] (uniformResourceIdentifier)
        const accessLocation = children[1];
        if (
          accessLocation.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
          accessLocation.type === 6
        ) {
          return accessLocation.value as string;
        }
      }
    }
  } catch {
    // Extension not present or unparseable
  }
  return null;
}

/**
 * Extract CRL Distribution Point URLs from a certificate.
 * OID: 2.5.29.31 (CRL Distribution Points)
 */
export function extractCrlUrls(certDer: Uint8Array): string[] {
  const urls: string[] = [];
  try {
    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(uint8ArrayToBinaryString(certDer))
    );
    const cdpExt = cert.getExtension('cRLDistributionPoints');
    if (!cdpExt) return urls;

    // Parse the raw ASN.1
    const cdpAsn1 = forge.asn1.fromDer((cdpExt as any).value as string);
    const distributionPoints = (cdpAsn1 as any).value as forge.asn1.Asn1[];
    for (const dp of distributionPoints) {
      const dpChildren = dp.value as forge.asn1.Asn1[];
      for (const child of dpChildren) {
        // distributionPoint [0]
        if (
          child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
          child.type === 0
        ) {
          // Recursively search for uniformResourceIdentifier [6] nodes.
          // The ASN.1 structure is: distributionPoint [0] → fullName [0] → GeneralName [6]
          // with varying nesting depth depending on the encoder.
          const findUris = (node: forge.asn1.Asn1): void => {
            if (
              node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
              node.type === 6 &&
              !node.constructed
            ) {
              urls.push(node.value as string);
            } else if (Array.isArray(node.value)) {
              for (const child of node.value as forge.asn1.Asn1[]) {
                findUris(child);
              }
            }
          };
          findUris(child);
        }
      }
    }
  } catch {
    // Extension not present or unparseable
  }
  return urls;
}

/**
 * Build an OCSP request for a certificate against its issuer.
 * Returns DER-encoded OCSPRequest bytes.
 */
export function buildOcspRequest(
  certDer: Uint8Array,
  issuerCertDer: Uint8Array
): Uint8Array {
  const asn1 = forge.asn1;
  const cert = forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(uint8ArrayToBinaryString(certDer))
  );
  const issuer = forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(uint8ArrayToBinaryString(issuerCertDer))
  );

  // issuerNameHash = SHA-1(DER(issuer.subject))
  const issuerSubjectDer = forge.asn1.toDer(
    forge.pki.distinguishedNameToAsn1(issuer.subject)
  ).getBytes();
  const issuerNameHash = forge.md.sha1.create();
  issuerNameHash.update(issuerSubjectDer, 'raw');

  // issuerKeyHash = SHA-1(issuer.subjectPublicKey raw bits)
  const issuerKeyDer = forge.asn1.toDer(
    forge.pki.publicKeyToAsn1(issuer.publicKey as forge.pki.rsa.PublicKey)
  ).getBytes();
  // The SubjectPublicKeyInfo contains AlgorithmIdentifier + BIT STRING.
  // We need just the BIT STRING contents (the raw key bytes).
  const spkiAsn1 = forge.asn1.fromDer(issuerKeyDer);
  const bitString = (spkiAsn1.value as forge.asn1.Asn1[])[1];
  // BIT STRING value starts with unused-bits byte (0x00), skip it
  const rawKeyBytes = (bitString.value as string).slice(1);
  const issuerKeyHash = forge.md.sha1.create();
  issuerKeyHash.update(rawKeyBytes, 'raw');

  // Serial number
  const serialBytes = forge.util.hexToBytes(cert.serialNumber);

  const sha1Oid = '1.3.14.3.2.26'; // id-sha1

  const certId = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    // hashAlgorithm
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.OID,
        false,
        forge.asn1.oidToDer(sha1Oid).getBytes()
      ),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
    ]),
    // issuerNameHash
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      issuerNameHash.digest().getBytes()
    ),
    // issuerKeyHash
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      issuerKeyHash.digest().getBytes()
    ),
    // serialNumber
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, serialBytes),
  ]);

  const request = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    certId,
  ]);

  const tbsRequest = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.SEQUENCE,
    true,
    [
      // requestList
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [request]),
    ]
  );

  const ocspRequest = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.SEQUENCE,
    true,
    [tbsRequest]
  );

  return binaryStringToUint8Array(forge.asn1.toDer(ocspRequest).getBytes());
}

/**
 * Fetch an OCSP response from the given URL.
 */
export async function fetchOcspResponse(
  certDer: Uint8Array,
  issuerCertDer: Uint8Array,
  ocspUrl: string,
  timeoutMs: number = 15_000
): Promise<Uint8Array> {
  const reqBody = buildOcspRequest(certDer, issuerCertDer);

  const response = await fetch(ocspUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ocsp-request',
    },
    body: reqBody as unknown as BodyInit,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new LtvError(
      `OCSP HTTP error: ${response.status} ${response.statusText} from ${ocspUrl}`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Fetch a CRL from the given URL.
 */
export async function fetchCrl(
  url: string,
  timeoutMs: number = 15_000
): Promise<Uint8Array> {
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new LtvError(
      `CRL HTTP error: ${response.status} ${response.statusText} from ${url}`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Fetch OCSP responses and CRLs for all certificates in a chain.
 * Modifies `ocspResponses` and `crls` arrays in place.
 */
async function fetchRevocationDataForChain(
  certsDer: Uint8Array[],
  ocspResponses: Uint8Array[],
  crls: Uint8Array[],
  timeoutMs: number
): Promise<void> {
  // Build a map of subject -> cert for issuer lookup
  const certsBySubject = new Map<string, Uint8Array>();
  for (const certDer of certsDer) {
    try {
      const cert = forge.pki.certificateFromAsn1(
        forge.asn1.fromDer(uint8ArrayToBinaryString(certDer))
      );
      const subjectHash = forge.pki.getPublicKeyFingerprint(
        cert.publicKey as forge.pki.rsa.PublicKey,
        { encoding: 'hex' }
      );
      certsBySubject.set(subjectHash, certDer);
    } catch {
      // Skip unparseable certs
    }
  }

  for (const certDer of certsDer) {
    try {
      const cert = forge.pki.certificateFromAsn1(
        forge.asn1.fromDer(uint8ArrayToBinaryString(certDer))
      );

      // Skip self-signed (root) certificates — they have no revocation data
      if (isSelfSigned(cert)) continue;

      // Find issuer cert
      const issuerCertDer = findIssuerCert(certDer, certsDer);
      if (!issuerCertDer) continue;

      // Try OCSP first
      const ocspUrl = extractOcspUrl(certDer);
      if (ocspUrl) {
        try {
          const ocspResp = await fetchOcspResponse(
            certDer,
            issuerCertDer,
            ocspUrl,
            timeoutMs
          );
          ocspResponses.push(ocspResp);
          continue; // OCSP success — skip CRL for this cert
        } catch (e) {
          console.log(
            `   LTV: OCSP fetch failed for ${ocspUrl}: ${(e as Error).message}`
          );
        }
      }

      // Fall back to CRL
      const crlUrls = extractCrlUrls(certDer);
      for (const crlUrl of crlUrls) {
        try {
          const crl = await fetchCrl(crlUrl, timeoutMs);
          crls.push(crl);
          break; // One CRL is enough per cert
        } catch (e) {
          console.log(
            `   LTV: CRL fetch failed for ${crlUrl}: ${(e as Error).message}`
          );
        }
      }
    } catch {
      // Skip certs that can't be parsed
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DSS dictionary building and incremental save
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Flate-compressed COSStream from raw DER data.
 * Mirrors Java PDFBox's writeDataToStream().
 */
function createFlateStream(data: Uint8Array): COSStream {
  const stream = new COSStream();
  const compressed = deflate(data);
  stream.setItem(new COSName('Filter'), new COSName('FlateDecode'));
  stream.setItem(COSName.LENGTH, new COSInteger(compressed.length));
  stream.setData(compressed);
  return stream;
}

/**
 * Write the DSS dictionary as a second incremental save.
 */
function writeDssIncrementalSave(
  signedPdf: Uint8Array,
  certsDer: Uint8Array[],
  ocspResponses: Uint8Array[],
  crls: Uint8Array[],
  vriKey: string
): Uint8Array {
  const trailer = parsePdfTrailer(signedPdf);
  const documentState = new COSDocumentState(signedPdf, trailer);
  const updateManager = new IncrementalUpdateManager(trailer);

  // Parse catalog using object resolver
  const catalogNum = trailer.rootRef.objectNumber;
  const catalogGen = trailer.rootRef.generation ?? 0;
  const resolver = createObjectResolver(documentState, signedPdf);
  const catalogParsed = resolver(catalogNum, catalogGen);
  const catalogDict = parseCOSDictionary(catalogParsed.body);

  // Allocate object numbers for all streams
  const certStreamKeys: COSObjectKey[] = [];
  const certStreams: COSStream[] = [];
  for (const certDer of certsDer) {
    const key = updateManager.allocateObject();
    certStreamKeys.push(key);
    certStreams.push(createFlateStream(certDer));
  }

  const ocspStreamKeys: COSObjectKey[] = [];
  const ocspStreams: COSStream[] = [];
  for (const ocsp of ocspResponses) {
    const key = updateManager.allocateObject();
    ocspStreamKeys.push(key);
    ocspStreams.push(createFlateStream(ocsp));
  }

  const crlStreamKeys: COSObjectKey[] = [];
  const crlStreams: COSStream[] = [];
  for (const crl of crls) {
    const key = updateManager.allocateObject();
    crlStreamKeys.push(key);
    crlStreams.push(createFlateStream(crl));
  }

  // Allocate DSS dictionary object
  const dssKey = updateManager.allocateObject();

  // Build DSS dictionary
  const dssDictionary = new COSDictionary();
  dssDictionary.setItem(COSName.TYPE, new COSName('DSS'));

  // /Certs array — references to cert stream objects
  if (certStreamKeys.length > 0) {
    const certsArray = new COSArray();
    for (const key of certStreamKeys) {
      certsArray.add(
        new COSObjectReference(key.objectNumber, key.generationNumber)
      );
    }
    dssDictionary.setItem(new COSName('Certs'), certsArray);
  }

  // /OCSPs array
  if (ocspStreamKeys.length > 0) {
    const ocspsArray = new COSArray();
    for (const key of ocspStreamKeys) {
      ocspsArray.add(
        new COSObjectReference(key.objectNumber, key.generationNumber)
      );
    }
    dssDictionary.setItem(new COSName('OCSPs'), ocspsArray);
  }

  // /CRLs array
  if (crlStreamKeys.length > 0) {
    const crlsArray = new COSArray();
    for (const key of crlStreamKeys) {
      crlsArray.add(
        new COSObjectReference(key.objectNumber, key.generationNumber)
      );
    }
    dssDictionary.setItem(new COSName('CRLs'), crlsArray);
  }

  // /VRI dictionary
  const vriDictionary = new COSDictionary();
  const vriEntry = new COSDictionary();

  // VRI entry contains per-signature cert/OCSP/CRL references
  if (certStreamKeys.length > 0) {
    const vriCerts = new COSArray();
    for (const key of certStreamKeys) {
      vriCerts.add(
        new COSObjectReference(key.objectNumber, key.generationNumber)
      );
    }
    vriEntry.setItem(new COSName('Cert'), vriCerts);
  }
  if (ocspStreamKeys.length > 0) {
    const vriOcsps = new COSArray();
    for (const key of ocspStreamKeys) {
      vriOcsps.add(
        new COSObjectReference(key.objectNumber, key.generationNumber)
      );
    }
    vriEntry.setItem(new COSName('OCSP'), vriOcsps);
  }
  if (crlStreamKeys.length > 0) {
    const vriCrls = new COSArray();
    for (const key of crlStreamKeys) {
      vriCrls.add(
        new COSObjectReference(key.objectNumber, key.generationNumber)
      );
    }
    vriEntry.setItem(new COSName('CRL'), vriCrls);
  }

  // /TU (Time Updated) — current timestamp
  const now = new Date();
  const tuValue = formatPdfDate(now);
  vriEntry.setItem(new COSName('TU'), new COSString(tuValue));

  vriDictionary.setItem(new COSName(vriKey), vriEntry);
  dssDictionary.setItem(new COSName('VRI'), vriDictionary);

  // Update catalog to reference DSS
  catalogDict.setItem(
    new COSName('DSS'),
    new COSObjectReference(dssKey.objectNumber, dssKey.generationNumber)
  );

  // Write incremental update
  const writeContext = new IncrementalWriteContext(signedPdf, {
    useXrefStream: trailer.hasXRefStream,
  });
  writeContext.enableIncrementalTracking(signedPdf.length);
  writeContext.bindUpdateManager(updateManager);

  // Write all stream objects first
  for (let i = 0; i < certStreams.length; i++) {
    const offset = writeContext.writeIndirectObject(
      certStreamKeys[i].objectNumber,
      certStreams[i],
      certStreamKeys[i].generationNumber
    );
    updateManager.registerOffset(certStreamKeys[i], offset);
  }
  for (let i = 0; i < ocspStreams.length; i++) {
    const offset = writeContext.writeIndirectObject(
      ocspStreamKeys[i].objectNumber,
      ocspStreams[i],
      ocspStreamKeys[i].generationNumber
    );
    updateManager.registerOffset(ocspStreamKeys[i], offset);
  }
  for (let i = 0; i < crlStreams.length; i++) {
    const offset = writeContext.writeIndirectObject(
      crlStreamKeys[i].objectNumber,
      crlStreams[i],
      crlStreamKeys[i].generationNumber
    );
    updateManager.registerOffset(crlStreamKeys[i], offset);
  }

  // Write DSS dictionary
  const dssOffset = writeContext.writeIndirectObject(
    dssKey.objectNumber,
    dssDictionary,
    dssKey.generationNumber
  );
  updateManager.registerOffset(dssKey, dssOffset);

  // Write updated catalog
  const catalogKey = new COSObjectKey(catalogNum, catalogGen);
  const catalogObjOffset = writeContext.writeIndirectObject(
    catalogNum,
    catalogDict,
    catalogGen
  );
  updateManager.registerOffset(catalogKey, catalogObjOffset);

  // Finalize with xref + trailer
  writeContext.finalizeIncremental(updateManager, trailer);

  return writeContext.toUint8Array();
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan raw CMS bytes for embedded X.509 certificates by looking for
 * ASN.1 SEQUENCE headers and trying to parse each as a certificate.
 * This is the fallback when ASN.1 parsing fails on BER indefinite-length CMS.
 */
function scanForCertificates(cmsBytes: Uint8Array): Uint8Array[] {
  const certs: Uint8Array[] = [];
  // X.509 certificate starts with SEQUENCE (0x30) followed by a length
  for (let i = 0; i < cmsBytes.length - 4; i++) {
    if (cmsBytes[i] !== 0x30) continue;

    // Try to read ASN.1 length
    const lenResult = readAsn1Length(cmsBytes, i + 1);
    if (!lenResult) continue;

    const totalLen = 1 + lenResult.headerLen + lenResult.contentLen;
    if (i + totalLen > cmsBytes.length) continue;
    if (totalLen < 100) continue; // Too small for a cert

    const candidate = cmsBytes.slice(i, i + totalLen);
    try {
      // Try to parse as X.509 certificate
      const cert = forge.pki.certificateFromAsn1(
        forge.asn1.fromDer(uint8ArrayToBinaryString(candidate))
      );
      // If we get here, it's a valid cert — verify it has basic fields
      if (cert.subject && cert.issuer) {
        certs.push(candidate);
        i += totalLen - 1; // Skip past this cert
      }
    } catch {
      // Not a valid certificate at this position
    }
  }
  return certs;
}

/**
 * Read an ASN.1 definite-length encoding.
 * Returns { headerLen, contentLen } or null if invalid.
 */
function readAsn1Length(
  data: Uint8Array,
  offset: number
): { headerLen: number; contentLen: number } | null {
  if (offset >= data.length) return null;
  const firstByte = data[offset];
  if (firstByte < 0x80) {
    // Short form
    return { headerLen: 1, contentLen: firstByte };
  }
  if (firstByte === 0x80) {
    // Indefinite form — not for cert extraction
    return null;
  }
  const numBytes = firstByte & 0x7f;
  if (numBytes > 4) return null; // Too large
  if (offset + 1 + numBytes > data.length) return null;
  let len = 0;
  for (let j = 0; j < numBytes; j++) {
    len = (len << 8) | data[offset + 1 + j];
  }
  return { headerLen: 1 + numBytes, contentLen: len };
}

function isSelfSigned(cert: forge.pki.Certificate): boolean {
  try {
    return cert.isIssuer(cert);
  } catch {
    return false;
  }
}

function findIssuerCert(
  certDer: Uint8Array,
  chainDer: Uint8Array[]
): Uint8Array | null {
  try {
    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(uint8ArrayToBinaryString(certDer))
    );
    for (const candidateDer of chainDer) {
      if (arraysEqual(certDer, candidateDer)) continue; // skip self
      try {
        const candidate = forge.pki.certificateFromAsn1(
          forge.asn1.fromDer(uint8ArrayToBinaryString(candidateDer))
        );
        if (cert.isIssuer(candidate)) {
          return candidateDer;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Can't parse cert
  }
  return null;
}

function formatPdfDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  return `D:${year}${month}${day}${hour}${minute}${second}+00'00'`;
}

function uint8ArrayToString(bytes: Uint8Array): string {
  // For large PDFs, chunk to avoid stack overflow
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode(...chunk));
  }
  return chunks.join('');
}

function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

function binaryStringToUint8Array(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

function binaryStringToHex(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return arr;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
