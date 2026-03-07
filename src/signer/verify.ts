/**
 * PDF Signature Verification
 *
 * Verifies digital signatures embedded in PDF files by:
 * 1. Locating signature fields in the AcroForm
 * 2. Extracting ByteRange content and CMS SignedData
 * 3. Checking integrity (SHA-256 content digest matches CMS MessageDigest)
 * 4. Checking authenticity (RSA or ECDSA signature over authenticated attributes)
 * 5. Verifying certificate chain (self-signed, partial, or full chain)
 * 6. Verifying timestamp tokens (RFC 3161 TSA response inside unsigned attributes)
 *
 * This inverts the signing flow in pdfbox-signer.ts (buildPdfBoxCmsSignature).
 */

import forge from 'node-forge';
import { p256, p384, p521 } from '@noble/curves/nist.js';
import { parsePdfTrailer } from '../pdfbox/parser/trailer.js';
import { parseCOSDictionary } from '../pdfbox/parser/cosParser.js';
import { COSDocumentState } from '../pdfbox/writer/COSDocumentState.js';
import {
  createObjectResolver,
  createRawResolver,
  collectFieldObjects,
} from '../pdfbox/parser/object.js';
import type { ObjectResolver } from '../pdfbox/parser/object.js';
import {
  COSObjectReference,
  COSDictionary,
  COSString,
  COSArray,
  COSInteger,
  COSName,
  COSFloat,
} from '../pdfbox/cos/COSTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ChainStatus = 'valid' | 'partial' | 'self-signed' | 'unknown';

export interface TimestampInfo {
  signerCn: string;
  signedAt: Date;
  hashAlgorithm: string;
  verified: boolean;
  serialNumber: string;
}

export interface SignatureVerificationResult {
  fieldName: string;
  signedBy: string;
  signedAt: Date | null;
  reason: string | null;
  location: string | null;
  byteRange: [number, number, number, number];
  integrityValid: boolean;
  signatureValid: boolean;
  algorithm: 'RSA' | 'ECDSA' | 'unknown';
  chainStatus: ChainStatus;
  hasTimestamp: boolean;
  timestampInfo: TimestampInfo | null;
  certificateDer: Uint8Array;
  error?: string;
}

/**
 * Verify all digital signatures in a PDF.
 *
 * Returns one result per signed signature field. Unsigned fields and
 * non-signature fields are skipped. Returns an empty array for unsigned
 * PDFs or if parsing fails.
 *
 * Checks:
 * - **integrityValid**: SHA-256 of ByteRange content matches CMS MessageDigest
 * - **signatureValid**: RSA or ECDSA signature over authenticated attributes verifies
 * - **chainStatus**: Certificate chain validation (self-signed, partial, valid, unknown)
 * - **timestampInfo**: RFC 3161 timestamp token verification (if present)
 */
export function verifySignatures(
  pdfBytes: Uint8Array
): SignatureVerificationResult[] {
  try {
    return verifySignaturesInternal(pdfBytes);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal implementation
// ─────────────────────────────────────────────────────────────────────────────

function verifySignaturesInternal(
  pdfBytes: Uint8Array
): SignatureVerificationResult[] {
  const trailer = parsePdfTrailer(pdfBytes);

  let resolve: ObjectResolver;
  try {
    const state = new COSDocumentState(pdfBytes, trailer);
    resolve = createObjectResolver(state, pdfBytes);
  } catch {
    resolve = createRawResolver(pdfBytes);
  }

  const catalogObject = resolve(
    trailer.rootRef.objectNumber,
    trailer.rootRef.generation
  );
  const catalogDict = parseCOSDictionary(catalogObject.body);

  const acroFormEntry = catalogDict.getItem('AcroForm');
  if (!acroFormEntry) return [];

  let acroFormDict: COSDictionary;
  if (acroFormEntry instanceof COSObjectReference) {
    const parsed = resolve(
      acroFormEntry.objectNumber,
      acroFormEntry.generationNumber
    );
    acroFormDict = parseCOSDictionary(parsed.body);
  } else if (acroFormEntry instanceof COSDictionary) {
    acroFormDict = acroFormEntry;
  } else {
    return [];
  }

  const fieldObjects = collectFieldObjects(resolve, acroFormDict);
  const results: SignatureVerificationResult[] = [];

  for (const field of fieldObjects) {
    const ft = field.dict.getItem('FT');
    if (!(ft instanceof COSName) || ft.getName() !== 'Sig') continue;

    const valueEntry = field.dict.getItem('V');
    if (!valueEntry) continue;

    let sigDict: COSDictionary;
    if (valueEntry instanceof COSObjectReference) {
      try {
        const sigObj = resolve(
          valueEntry.objectNumber,
          valueEntry.generationNumber
        );
        sigDict = parseCOSDictionary(sigObj.body);
      } catch {
        continue;
      }
    } else if (valueEntry instanceof COSDictionary) {
      sigDict = valueEntry;
    } else {
      continue;
    }

    const result = verifySignatureField(pdfBytes, field.dict, sigDict);
    if (result) results.push(result);
  }

  return results;
}

function verifySignatureField(
  pdfBytes: Uint8Array,
  fieldDict: COSDictionary,
  sigDict: COSDictionary
): SignatureVerificationResult | null {
  // Extract field name
  const tEntry = fieldDict.getItem('T');
  const fieldName =
    tEntry instanceof COSString ? tEntry.getString() : 'Unknown';

  // Extract ByteRange
  const byteRangeEntry = sigDict.getItem('ByteRange');
  if (!(byteRangeEntry instanceof COSArray)) return null;
  const byteRange = extractByteRange(byteRangeEntry);
  if (!byteRange) return null;

  // Extract /Contents hex string → raw CMS bytes
  const contentsEntry = sigDict.getItem('Contents');
  if (!(contentsEntry instanceof COSString)) return null;
  const rawContents = contentsEntry.getBytes();
  const cmsLength = berTlvLength(rawContents, 0);
  const cmsBytes = cmsLength > 0 ? rawContents.subarray(0, cmsLength) : rawContents;
  if (cmsBytes.length === 0) return null;

  // Extract metadata from signature dictionary
  const reason = extractStringValue(sigDict, 'Reason');
  const location = extractStringValue(sigDict, 'Location');
  const nameValue = extractStringValue(sigDict, 'Name');
  const mValue = extractStringValue(sigDict, 'M');

  // Reconstruct signed content from ByteRange
  const [off1, len1, off2, len2] = byteRange;
  const signedContent = new Uint8Array(len1 + len2);
  signedContent.set(pdfBytes.subarray(off1, off1 + len1), 0);
  signedContent.set(pdfBytes.subarray(off2, off2 + len2), len1);

  // Compute content digest
  const contentDigest = sha256Digest(signedContent);

  // Parse CMS and verify
  try {
    const cmsInfo = parseCmsSignedData(cmsBytes);
    const integrityValid = arraysEqual(contentDigest, cmsInfo.messageDigest);

    let signatureValid = false;
    let algorithm: 'RSA' | 'ECDSA' | 'unknown' = 'unknown';

    if (integrityValid) {
      const result = verifySignatureOverAuthAttrs(
        cmsInfo.cert,
        cmsInfo.signerCertDer,
        cmsInfo.authAttrsDer,
        cmsInfo.encryptedDigest,
        cmsInfo.signatureAlgorithmOid
      );
      signatureValid = result.valid;
      algorithm = result.algorithm;
    } else {
      algorithm = detectAlgorithm(cmsInfo.signatureAlgorithmOid);
    }

    const chainStatus = verifyCertificateChain(
      cmsInfo.signerCertDer,
      cmsInfo.allCertificatesDer
    );

    let timestampInfo: TimestampInfo | null = null;
    if (cmsInfo.unauthAttrsNode && cmsInfo.hasTimestamp) {
      timestampInfo = verifyTimestampToken(
        cmsInfo.unauthAttrsNode,
        cmsInfo.encryptedDigest
      );
    }

    const signedBy = extractCertCn(cmsInfo.cert) || nameValue || 'Unknown';
    const signedAt = cmsInfo.signingTime || parsePdfDate(mValue);

    return {
      fieldName,
      signedBy,
      signedAt,
      reason,
      location,
      byteRange,
      integrityValid,
      signatureValid,
      algorithm,
      chainStatus,
      hasTimestamp: cmsInfo.hasTimestamp,
      timestampInfo,
      certificateDer: cmsInfo.signerCertDer,
    };
  } catch (e) {
    return {
      fieldName,
      signedBy: nameValue || 'Unknown',
      signedAt: parsePdfDate(mValue),
      reason,
      location,
      byteRange,
      integrityValid: false,
      signatureValid: false,
      algorithm: 'unknown',
      chainStatus: 'unknown',
      hasTimestamp: false,
      timestampInfo: null,
      certificateDer: new Uint8Array(0),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CMS parsing
// ─────────────────────────────────────────────────────────────────────────────

interface CmsParseResult {
  messageDigest: Uint8Array;
  signingTime: Date | null;
  authAttrsDer: Uint8Array;
  encryptedDigest: Uint8Array;
  cert: forge.pki.Certificate;
  signerCertDer: Uint8Array;
  allCertificatesDer: Uint8Array[];
  signatureAlgorithmOid: string;
  hasTimestamp: boolean;
  unauthAttrsNode: forge.asn1.Asn1 | null;
}

function parseCmsSignedData(cmsBytes: Uint8Array): CmsParseResult {
  const binaryStr = uint8ArrayToBinaryString(cmsBytes);

  // forge.asn1.fromDer handles both DER and BER (indefinite-length)
  const asn1 = forge.asn1.fromDer(binaryStr);

  // ContentInfo → SEQUENCE { OID, [0] EXPLICIT SignedData }
  const contentInfo = asn1.value as forge.asn1.Asn1[];
  if (!contentInfo || contentInfo.length < 2) {
    throw new Error('Invalid CMS ContentInfo structure');
  }

  // [0] EXPLICIT → SignedData SEQUENCE
  const signedDataWrapper = contentInfo[1];
  const signedDataSeq = (signedDataWrapper.value as forge.asn1.Asn1[])?.[0];
  if (!signedDataSeq) {
    throw new Error('Missing SignedData in CMS');
  }

  const sdChildren = signedDataSeq.value as forge.asn1.Asn1[];
  // SignedData: version, digestAlgorithms, encapContentInfo, [0] certificates, signerInfos
  // certificates is CONTEXT_SPECIFIC tag 0, signerInfos is SET (last element)

  let certNode: forge.asn1.Asn1 | undefined;
  let signerInfosNode: forge.asn1.Asn1 | undefined;

  for (const child of sdChildren) {
    if (
      child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
      child.type === 0
    ) {
      certNode = child;
    }
    // SignerInfos is the last SET in SignedData
    if (
      child.tagClass === forge.asn1.Class.UNIVERSAL &&
      child.type === forge.asn1.Type.SET &&
      child.constructed
    ) {
      signerInfosNode = child;
    }
  }

  if (!certNode) throw new Error('No certificates in CMS SignedData');
  if (!signerInfosNode) throw new Error('No signerInfos in CMS SignedData');

  // Extract ALL certificates
  const certSequences = certNode.value as forge.asn1.Asn1[];
  if (!certSequences || certSequences.length === 0) {
    throw new Error('Empty certificates set');
  }

  const allCertificatesDer: Uint8Array[] = [];
  for (const certAsn1 of certSequences) {
    const derStr = forge.asn1.toDer(certAsn1).getBytes();
    allCertificatesDer.push(byteStringToUint8Array(derStr));
  }

  // Use first cert as signer cert (typical CMS convention)
  const firstCertAsn1 = certSequences[0];
  const signerCertDer = allCertificatesDer[0];
  const cert = forge.pki.certificateFromAsn1(firstCertAsn1);

  // Parse first SignerInfo
  const signerInfos = signerInfosNode.value as forge.asn1.Asn1[];
  if (!signerInfos || signerInfos.length === 0) {
    throw new Error('Empty signerInfos');
  }
  const signerInfo = signerInfos[0];
  const siChildren = signerInfo.value as forge.asn1.Asn1[];

  // SignerInfo: version, sid, digestAlg, [0] authAttrs, digestEncAlg, encDigest, [1] unauthAttrs
  let authAttrsNode: forge.asn1.Asn1 | undefined;
  let encryptedDigestNode: forge.asn1.Asn1 | undefined;
  let digestEncAlgNode: forge.asn1.Asn1 | undefined;
  let hasTimestamp = false;
  let unauthAttrsNode: forge.asn1.Asn1 | null = null;

  // Track position to find digestEncryptionAlgorithm (SEQUENCE before OCTETSTRING)
  for (let i = 0; i < siChildren.length; i++) {
    const child = siChildren[i];
    if (
      child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
      child.type === 0
    ) {
      authAttrsNode = child;
    }
    if (
      child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
      child.type === 1
    ) {
      // Unsigned attributes — check for timestamp token
      unauthAttrsNode = child;
      hasTimestamp = checkForTimestampToken(child);
    }
    if (
      child.tagClass === forge.asn1.Class.UNIVERSAL &&
      child.type === forge.asn1.Type.OCTETSTRING &&
      !child.constructed
    ) {
      encryptedDigestNode = child;
      // The SEQUENCE just before the OCTETSTRING is the digestEncryptionAlgorithm
      if (i > 0) {
        const prev = siChildren[i - 1];
        if (
          prev.tagClass === forge.asn1.Class.UNIVERSAL &&
          prev.type === forge.asn1.Type.SEQUENCE &&
          prev.constructed
        ) {
          digestEncAlgNode = prev;
        }
      }
    }
  }

  if (!authAttrsNode) throw new Error('No authenticated attributes in SignerInfo');
  if (!encryptedDigestNode) throw new Error('No encrypted digest in SignerInfo');

  // Extract signature algorithm OID
  let signatureAlgorithmOid = '';
  if (digestEncAlgNode) {
    const algChildren = digestEncAlgNode.value as forge.asn1.Asn1[];
    if (algChildren && algChildren.length > 0) {
      signatureAlgorithmOid = forge.asn1.derToOid(algChildren[0].value as string);
    }
  }

  // Extract MessageDigest and SigningTime from authenticated attributes
  const authAttrsChildren = authAttrsNode.value as forge.asn1.Asn1[];
  let messageDigest: Uint8Array | undefined;
  let signingTime: Date | null = null;

  for (const attr of authAttrsChildren) {
    const attrChildren = attr.value as forge.asn1.Asn1[];
    if (!attrChildren || attrChildren.length < 2) continue;

    const oid = forge.asn1.derToOid(attrChildren[0].value as string);

    if (oid === forge.pki.oids.messageDigest) {
      // SET { OCTET STRING }
      const attrValues = attrChildren[1].value as forge.asn1.Asn1[];
      if (attrValues && attrValues.length > 0) {
        const digestValue = attrValues[0].value as string;
        messageDigest = byteStringToUint8Array(digestValue);
      }
    }

    if (oid === forge.pki.oids.signingTime) {
      // SET { UTCTime | GeneralizedTime }
      const attrValues = attrChildren[1].value as forge.asn1.Asn1[];
      if (attrValues && attrValues.length > 0) {
        signingTime = parseAsn1Time(attrValues[0]);
      }
    }
  }

  if (!messageDigest) throw new Error('No MessageDigest attribute found');

  // Re-encode authenticated attributes as SET for signature verification
  const authAttrsDer = reencodeAuthAttrsAsSet(authAttrsNode);

  const encryptedDigest = byteStringToUint8Array(encryptedDigestNode.value as string);

  return {
    messageDigest,
    signingTime,
    authAttrsDer,
    encryptedDigest,
    cert,
    signerCertDer: signerCertDer,
    allCertificatesDer,
    signatureAlgorithmOid,
    hasTimestamp,
    unauthAttrsNode,
  };
}

/**
 * Re-encode authenticated attributes from [0] IMPLICIT (tag 0xA0) to
 * SET (tag 0x31) for signature verification.
 *
 * The signing code (pdfbox-signer.ts:1115-1120) builds authenticated attributes
 * as CONTEXT_SPECIFIC [0], but signs them re-tagged as a SET (tag 0x31).
 * For verification, we must perform the same re-encoding.
 */
function reencodeAuthAttrsAsSet(authAttrsNode: forge.asn1.Asn1): Uint8Array {
  const setNode = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    authAttrsNode.value as forge.asn1.Asn1[]
  );
  const derStr = forge.asn1.toDer(setNode).getBytes();
  return byteStringToUint8Array(derStr);
}

/**
 * Check if unsigned attributes contain a timestamp token.
 * OID: 1.2.840.113549.1.9.16.2.14 (id-aa-timeStampToken)
 */
function checkForTimestampToken(unauthAttrsNode: forge.asn1.Asn1): boolean {
  try {
    const attrs = unauthAttrsNode.value as forge.asn1.Asn1[];
    for (const attr of attrs) {
      const attrChildren = attr.value as forge.asn1.Asn1[];
      if (!attrChildren || attrChildren.length < 1) continue;
      const oid = forge.asn1.derToOid(attrChildren[0].value as string);
      if (oid === '1.2.840.113549.1.9.16.2.14') return true;
    }
  } catch {
    // Ignore parsing errors in unsigned attributes
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature verification (RSA + ECDSA dispatch)
// ─────────────────────────────────────────────────────────────────────────────

// RSA OIDs
const RSA_OIDS: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'SHA-256',   // rsaEncryption (hash from digestAlgorithm)
  '1.2.840.113549.1.1.5': 'SHA-1',     // sha1WithRSAEncryption
  '1.2.840.113549.1.1.11': 'SHA-256',  // sha256WithRSAEncryption
  '1.2.840.113549.1.1.12': 'SHA-384',  // sha384WithRSAEncryption
  '1.2.840.113549.1.1.13': 'SHA-512',  // sha512WithRSAEncryption
};

// ECDSA OIDs
const ECDSA_OIDS: Record<string, string> = {
  '1.2.840.10045.4.1': 'SHA-1',     // ecdsa-with-SHA1
  '1.2.840.10045.4.3.2': 'SHA-256', // ecdsa-with-SHA256
  '1.2.840.10045.4.3.3': 'SHA-384', // ecdsa-with-SHA384
  '1.2.840.10045.4.3.4': 'SHA-512', // ecdsa-with-SHA512
};

// Named curve OIDs
const CURVE_P256 = '1.2.840.10045.3.1.7';
const CURVE_P384 = '1.3.132.0.34';
const CURVE_P521 = '1.3.132.0.35';

function detectAlgorithm(algOid: string): 'RSA' | 'ECDSA' | 'unknown' {
  if (RSA_OIDS[algOid]) return 'RSA';
  if (ECDSA_OIDS[algOid]) return 'ECDSA';
  return 'unknown';
}

function verifySignatureOverAuthAttrs(
  cert: forge.pki.Certificate,
  certDer: Uint8Array,
  authAttrsDer: Uint8Array,
  encryptedDigest: Uint8Array,
  algOid: string
): { valid: boolean; algorithm: 'RSA' | 'ECDSA' | 'unknown' } {
  if (ECDSA_OIDS[algOid]) {
    const hashAlg = ECDSA_OIDS[algOid];
    const valid = verifyEcdsaSignature(certDer, authAttrsDer, encryptedDigest, hashAlg);
    return { valid, algorithm: 'ECDSA' };
  }

  if (RSA_OIDS[algOid] || algOid === '') {
    // Default to RSA (our signing code uses rsaEncryption OID)
    const valid = verifyRsaSignature(cert, authAttrsDer, encryptedDigest);
    return { valid, algorithm: 'RSA' };
  }

  return { valid: false, algorithm: 'unknown' };
}

function verifyRsaSignature(
  cert: forge.pki.Certificate,
  authAttrsDer: Uint8Array,
  encryptedDigest: Uint8Array
): boolean {
  const md = forge.md.sha256.create();
  md.update(uint8ArrayToBinaryString(authAttrsDer), 'raw');
  return (cert.publicKey as forge.pki.rsa.PublicKey).verify(
    md.digest().getBytes(),
    uint8ArrayToBinaryString(encryptedDigest)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ECDSA verification via @noble/curves
// ─────────────────────────────────────────────────────────────────────────────

function verifyEcdsaSignature(
  certDer: Uint8Array,
  authAttrsDer: Uint8Array,
  signature: Uint8Array,
  hashAlg: string
): boolean {
  try {
    const pubKeyBytes = extractEcPublicKeyFromCert(certDer);
    const curveOid = extractCurveOidFromCert(certDer);
    const hash = computeHash(authAttrsDer, hashAlg);

    // CMS signatures are DER-encoded; @noble/curves v2 expects compact (r||s)
    if (curveOid === CURVE_P256) {
      const compact = derSignatureToCompact(signature, 32);
      return p256.verify(compact, hash, pubKeyBytes);
    } else if (curveOid === CURVE_P384) {
      const compact = derSignatureToCompact(signature, 48);
      return p384.verify(compact, hash, pubKeyBytes);
    } else if (curveOid === CURVE_P521) {
      const compact = derSignatureToCompact(signature, 66);
      return p521.verify(compact, hash, pubKeyBytes);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Convert a DER-encoded ECDSA signature (SEQUENCE { INTEGER r, INTEGER s })
 * to the compact (r || s) format expected by @noble/curves v2.
 */
function derSignatureToCompact(der: Uint8Array, componentSize: number): Uint8Array {
  // SEQUENCE tag
  if (der[0] !== 0x30) throw new Error('Expected SEQUENCE tag in DER signature');
  let pos = 2; // skip tag + length byte
  if (der[1] & 0x80) pos = 2 + (der[1] & 0x7f); // long-form length

  // Parse r INTEGER
  if (der[pos] !== 0x02) throw new Error('Expected INTEGER tag for r');
  const rLen = der[pos + 1]; pos += 2;
  let rBytes = der.subarray(pos, pos + rLen); pos += rLen;

  // Parse s INTEGER
  if (der[pos] !== 0x02) throw new Error('Expected INTEGER tag for s');
  const sLen = der[pos + 1]; pos += 2;
  let sBytes = der.subarray(pos, pos + sLen);

  // Normalize to fixed-size: strip leading zeros, left-pad to componentSize
  const compact = new Uint8Array(componentSize * 2);
  copyFixedWidth(rBytes, compact, 0, componentSize);
  copyFixedWidth(sBytes, compact, componentSize, componentSize);
  return compact;
}

function copyFixedWidth(src: Uint8Array, dest: Uint8Array, destOffset: number, width: number): void {
  // Strip leading zero padding from DER INTEGER
  let start = 0;
  while (start < src.length - 1 && src[start] === 0) start++;
  const trimmed = src.subarray(start);

  if (trimmed.length <= width) {
    // Left-pad with zeros
    dest.set(trimmed, destOffset + width - trimmed.length);
  } else {
    // Truncate (shouldn't happen with valid signatures)
    dest.set(trimmed.subarray(trimmed.length - width), destOffset);
  }
}

/**
 * Extract the EC public key bytes (uncompressed point) from a DER-encoded X.509 certificate.
 *
 * X.509 certificate structure:
 *   SEQUENCE {
 *     SEQUENCE (tbsCertificate) {
 *       ... (version, serialNumber, signature, issuer, validity, subject)
 *       SEQUENCE (subjectPublicKeyInfo) {
 *         SEQUENCE (algorithm) { OID, OID (namedCurve) }
 *         BIT STRING (subjectPublicKey) ← the EC point bytes
 *       }
 *       ...
 *     }
 *     ...
 *   }
 */
export function extractEcPublicKeyFromCert(certDer: Uint8Array): Uint8Array {
  const spki = findSubjectPublicKeyInfo(certDer);
  if (!spki) throw new Error('Could not find SubjectPublicKeyInfo in certificate');

  // Find BIT STRING in SPKI
  const bitStringOffset = findTagInSequence(spki.data, spki.contentOffset, 0x03);
  if (bitStringOffset < 0) throw new Error('No BIT STRING in SubjectPublicKeyInfo');

  const { contentOffset, contentLength } = parseTlv(spki.data, bitStringOffset);
  // BIT STRING has a leading "unused bits" byte (should be 0x00 for EC keys)
  return spki.data.subarray(contentOffset + 1, contentOffset + contentLength);
}

/**
 * Extract the named curve OID from a DER-encoded X.509 certificate.
 */
export function extractCurveOidFromCert(certDer: Uint8Array): string {
  const spki = findSubjectPublicKeyInfo(certDer);
  if (!spki) throw new Error('Could not find SubjectPublicKeyInfo in certificate');

  // Algorithm is first SEQUENCE in SPKI
  const algSeqOffset = findTagInSequence(spki.data, spki.contentOffset, 0x30);
  if (algSeqOffset < 0) throw new Error('No algorithm SEQUENCE in SubjectPublicKeyInfo');

  const algSeq = parseTlv(spki.data, algSeqOffset);

  // Find OIDs in algorithm sequence. First is algorithm, second is curve.
  let oidCount = 0;
  let pos = algSeq.contentOffset;
  const end = algSeq.contentOffset + algSeq.contentLength;
  while (pos < end) {
    const tag = spki.data[pos];
    const tlv = parseTlv(spki.data, pos);
    if (tag === 0x06) { // OID
      oidCount++;
      if (oidCount === 2) {
        // This is the named curve OID
        return derBytesToOid(spki.data.subarray(tlv.contentOffset, tlv.contentOffset + tlv.contentLength));
      }
    }
    pos = tlv.contentOffset + tlv.contentLength;
  }

  throw new Error('Could not find curve OID in SubjectPublicKeyInfo');
}

/**
 * Locate SubjectPublicKeyInfo in a DER X.509 certificate.
 *
 * Strategy: Walk tbsCertificate children. SPKI is the SEQUENCE that contains
 * a nested SEQUENCE with the ecPublicKey OID (1.2.840.10045.2.1) or
 * rsaEncryption OID, followed by a BIT STRING.
 */
function findSubjectPublicKeyInfo(certDer: Uint8Array): { data: Uint8Array; contentOffset: number; contentLength: number } | null {
  // Certificate → SEQUENCE → tbsCertificate (first SEQUENCE)
  const certTlv = parseTlv(certDer, 0);
  const tbsTlv = parseTlv(certDer, certTlv.contentOffset);

  let pos = tbsTlv.contentOffset;
  const end = tbsTlv.contentOffset + tbsTlv.contentLength;

  // Known algorithm OIDs for SubjectPublicKeyInfo identification
  // ecPublicKey: 1.2.840.10045.2.1 → DER: 2a 86 48 ce 3d 02 01
  const EC_PUB_KEY_OID = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  // rsaEncryption: 1.2.840.113549.1.1.1 → DER: 2a 86 48 86 f7 0d 01 01 01
  const RSA_PUB_KEY_OID = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);

  while (pos < end) {
    const tag = certDer[pos];
    const tlv = parseTlv(certDer, pos);
    const nextPos = tlv.contentOffset + tlv.contentLength;

    if (tag === 0x30) { // SEQUENCE candidate
      // Check if this SEQUENCE contains a known algorithm OID
      const content = certDer.subarray(tlv.contentOffset, nextPos);
      if (containsOid(content, EC_PUB_KEY_OID) || containsOid(content, RSA_PUB_KEY_OID)) {
        // Verify it also has a BIT STRING child
        let innerPos = tlv.contentOffset;
        const innerEnd = nextPos;
        while (innerPos < innerEnd) {
          if (certDer[innerPos] === 0x03) { // BIT STRING
            return { data: certDer, contentOffset: tlv.contentOffset, contentLength: tlv.contentLength };
          }
          const innerTlv = parseTlv(certDer, innerPos);
          innerPos = innerTlv.contentOffset + innerTlv.contentLength;
        }
      }
    }

    pos = nextPos;
  }

  return null;
}

function containsOid(data: Uint8Array, oidBytes: Uint8Array): boolean {
  // Search for OID tag (0x06) + length + exact bytes
  for (let i = 0; i < data.length - oidBytes.length - 1; i++) {
    if (data[i] === 0x06 && data[i + 1] === oidBytes.length) {
      let match = true;
      for (let j = 0; j < oidBytes.length; j++) {
        if (data[i + 2 + j] !== oidBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Certificate chain verification
// ─────────────────────────────────────────────────────────────────────────────

function verifyCertificateChain(
  signerCertDer: Uint8Array,
  allCertsDer: Uint8Array[]
): ChainStatus {
  try {
    // Parse all certificates
    const certs: forge.pki.Certificate[] = [];
    for (const der of allCertsDer) {
      try {
        const asn1 = forge.asn1.fromDer(uint8ArrayToBinaryString(der));
        certs.push(forge.pki.certificateFromAsn1(asn1));
      } catch {
        // Skip unparseable certificates
      }
    }

    if (certs.length === 0) return 'unknown';

    const signerAsn1 = forge.asn1.fromDer(uint8ArrayToBinaryString(signerCertDer));
    const signerCert = forge.pki.certificateFromAsn1(signerAsn1);

    // Check if self-signed
    if (isSelfSigned(signerCert)) {
      // Verify self-signature
      try {
        if (signerCert.verify(signerCert)) {
          return 'self-signed';
        }
      } catch {
        // Self-signed but signature doesn't verify
      }
      return 'self-signed';
    }

    // Walk chain from signer → issuer → ... → root
    const visited = new Set<string>();
    let current = signerCert;
    let chainLength = 0;

    while (chainLength < 10) { // max depth guard
      const fingerprint = forge.md.sha256.create()
        .update(forge.asn1.toDer(forge.pki.certificateToAsn1(current)).getBytes())
        .digest().toHex();

      if (visited.has(fingerprint)) break; // loop detection
      visited.add(fingerprint);
      chainLength++;

      // Find issuer cert
      const issuer = findIssuerCert(current, certs, visited);
      if (!issuer) {
        // Chain is incomplete — couldn't find issuer
        return chainLength > 1 ? 'partial' : 'unknown';
      }

      // Verify the link
      try {
        if (!issuer.verify(current)) {
          return chainLength > 1 ? 'partial' : 'unknown';
        }
      } catch {
        return chainLength > 1 ? 'partial' : 'unknown';
      }

      // If issuer is self-signed, we've reached the root
      if (isSelfSigned(issuer)) {
        return 'valid';
      }

      current = issuer;
    }

    return chainLength > 1 ? 'partial' : 'unknown';
  } catch {
    return 'unknown';
  }
}

function isSelfSigned(cert: forge.pki.Certificate): boolean {
  return cert.isIssuer(cert);
}

function findIssuerCert(
  subject: forge.pki.Certificate,
  candidates: forge.pki.Certificate[],
  visited: Set<string>
): forge.pki.Certificate | null {
  for (const candidate of candidates) {
    // Skip self
    const fp = forge.md.sha256.create()
      .update(forge.asn1.toDer(forge.pki.certificateToAsn1(candidate)).getBytes())
      .digest().toHex();
    if (visited.has(fp)) continue;

    if (candidate.isIssuer(subject)) {
      return candidate;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp token verification
// ─────────────────────────────────────────────────────────────────────────────

const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';

function verifyTimestampToken(
  unauthAttrsNode: forge.asn1.Asn1,
  encryptedDigest: Uint8Array
): TimestampInfo | null {
  try {
    const attrs = unauthAttrsNode.value as forge.asn1.Asn1[];
    for (const attr of attrs) {
      const attrChildren = attr.value as forge.asn1.Asn1[];
      if (!attrChildren || attrChildren.length < 2) continue;

      const oid = forge.asn1.derToOid(attrChildren[0].value as string);
      if (oid !== OID_TIMESTAMP_TOKEN) continue;

      // SET { ContentInfo }
      const attrValues = attrChildren[1].value as forge.asn1.Asn1[];
      if (!attrValues || attrValues.length === 0) continue;

      const tsContentInfo = attrValues[0];
      return parseAndVerifyTimestampToken(tsContentInfo, encryptedDigest);
    }
  } catch {
    // Ignore timestamp parsing errors
  }
  return null;
}

function parseAndVerifyTimestampToken(
  tsContentInfo: forge.asn1.Asn1,
  encryptedDigest: Uint8Array
): TimestampInfo | null {
  // ContentInfo → SEQUENCE { OID (signedData), [0] EXPLICIT SignedData }
  const ciChildren = tsContentInfo.value as forge.asn1.Asn1[];
  if (!ciChildren || ciChildren.length < 2) return null;

  const signedDataWrapper = ciChildren[1];
  const signedDataSeq = (signedDataWrapper.value as forge.asn1.Asn1[])?.[0];
  if (!signedDataSeq) return null;

  const sdChildren = signedDataSeq.value as forge.asn1.Asn1[];

  // Find encapContentInfo, certificates, and signerInfos
  let encapContentInfo: forge.asn1.Asn1 | undefined;
  let tsCertNode: forge.asn1.Asn1 | undefined;
  let tsSignerInfosNode: forge.asn1.Asn1 | undefined;

  for (const child of sdChildren) {
    if (
      child.tagClass === forge.asn1.Class.UNIVERSAL &&
      child.type === forge.asn1.Type.SEQUENCE &&
      child.constructed
    ) {
      // Check if this is encapContentInfo (SEQUENCE with OID first child)
      const seqChildren = child.value as forge.asn1.Asn1[];
      if (seqChildren && seqChildren.length > 0) {
        const firstChild = seqChildren[0];
        if (
          firstChild.tagClass === forge.asn1.Class.UNIVERSAL &&
          firstChild.type === forge.asn1.Type.OID
        ) {
          const contentOid = forge.asn1.derToOid(firstChild.value as string);
          if (contentOid === OID_TST_INFO) {
            encapContentInfo = child;
          }
        }
      }
    }
    if (
      child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
      child.type === 0
    ) {
      tsCertNode = child;
    }
    if (
      child.tagClass === forge.asn1.Class.UNIVERSAL &&
      child.type === forge.asn1.Type.SET &&
      child.constructed
    ) {
      tsSignerInfosNode = child;
    }
  }

  if (!encapContentInfo) return null;

  // Extract TSTInfo from encapContentInfo → [0] EXPLICIT → OCTET STRING → TSTInfo
  const tstInfoBytes = extractEncapContent(encapContentInfo);
  if (!tstInfoBytes) return null;

  // Parse TSTInfo
  const tstInfo = parseTstInfo(tstInfoBytes);
  if (!tstInfo) return null;

  // Verify: messageImprint hash matches SHA-256 of encryptedDigest
  const digestOfSig = computeHash(encryptedDigest, tstInfo.hashAlgorithm);
  const imprintMatches = arraysEqual(digestOfSig, tstInfo.messageImprintHash);

  // Verify TSA signature over authenticated attributes
  let tsaSigValid = false;
  if (tsSignerInfosNode && tsCertNode) {
    tsaSigValid = verifyTsaSignature(tsSignerInfosNode, tsCertNode);
  }

  // Extract TSA signer CN
  let signerCn = 'Unknown TSA';
  if (tsCertNode) {
    try {
      const tsCertSequences = tsCertNode.value as forge.asn1.Asn1[];
      if (tsCertSequences && tsCertSequences.length > 0) {
        const tsaCert = forge.pki.certificateFromAsn1(tsCertSequences[0]);
        signerCn = extractCertCn(tsaCert) || 'Unknown TSA';
      }
    } catch {
      // Ignore
    }
  }

  return {
    signerCn,
    signedAt: tstInfo.genTime,
    hashAlgorithm: tstInfo.hashAlgorithm,
    verified: imprintMatches && tsaSigValid,
    serialNumber: tstInfo.serialNumber,
  };
}

function extractEncapContent(encapContentInfo: forge.asn1.Asn1): Uint8Array | null {
  // SEQUENCE { OID, [0] EXPLICIT { OCTET STRING } }
  const children = encapContentInfo.value as forge.asn1.Asn1[];
  if (!children || children.length < 2) return null;

  const wrapper = children[1]; // [0] EXPLICIT
  const wrapperChildren = wrapper.value as forge.asn1.Asn1[];
  if (!wrapperChildren || wrapperChildren.length === 0) return null;

  const octetString = wrapperChildren[0];
  if (octetString.type === forge.asn1.Type.OCTETSTRING) {
    return byteStringToUint8Array(octetString.value as string);
  }

  // Could be constructed OCTET STRING
  if (octetString.constructed) {
    let result = '';
    const parts = octetString.value as forge.asn1.Asn1[];
    for (const part of parts) {
      result += part.value as string;
    }
    return byteStringToUint8Array(result);
  }

  return null;
}

interface TstInfoParsed {
  genTime: Date;
  hashAlgorithm: string;
  messageImprintHash: Uint8Array;
  serialNumber: string;
}

// Hash algorithm OIDs
const HASH_OID_TO_NAME: Record<string, string> = {
  '1.3.14.3.2.26': 'SHA-1',
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
};

function parseTstInfo(tstInfoBytes: Uint8Array): TstInfoParsed | null {
  try {
    const asn1 = forge.asn1.fromDer(uint8ArrayToBinaryString(tstInfoBytes));
    const children = asn1.value as forge.asn1.Asn1[];
    if (!children || children.length < 5) return null;

    // TSTInfo: version, policy, messageImprint, serialNumber, genTime, ...
    // messageImprint is SEQUENCE { SEQUENCE { OID, NULL }, OCTET STRING }
    const messageImprint = children[2];
    const miChildren = messageImprint.value as forge.asn1.Asn1[];
    if (!miChildren || miChildren.length < 2) return null;

    // Hash algorithm from messageImprint
    const hashAlgSeq = miChildren[0];
    const hashAlgChildren = hashAlgSeq.value as forge.asn1.Asn1[];
    const hashOid = forge.asn1.derToOid(hashAlgChildren[0].value as string);
    const hashAlgorithm = HASH_OID_TO_NAME[hashOid] || hashOid;

    // Hash value
    const messageImprintHash = byteStringToUint8Array(miChildren[1].value as string);

    // Serial number (INTEGER)
    const serialNumberNode = children[3];
    const serialBytes = byteStringToUint8Array(serialNumberNode.value as string);
    const serialNumber = Array.from(serialBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // genTime (GeneralizedTime)
    const genTimeNode = children[4];
    const genTime = parseAsn1Time(genTimeNode);
    if (!genTime) return null;

    return { genTime, hashAlgorithm, messageImprintHash, serialNumber };
  } catch {
    return null;
  }
}

function verifyTsaSignature(
  signerInfosNode: forge.asn1.Asn1,
  certNode: forge.asn1.Asn1
): boolean {
  try {
    const signerInfos = signerInfosNode.value as forge.asn1.Asn1[];
    if (!signerInfos || signerInfos.length === 0) return false;

    const signerInfo = signerInfos[0];
    const siChildren = signerInfo.value as forge.asn1.Asn1[];

    let authAttrsNode: forge.asn1.Asn1 | undefined;
    let encDigestNode: forge.asn1.Asn1 | undefined;
    let digestEncAlgNode: forge.asn1.Asn1 | undefined;

    for (let i = 0; i < siChildren.length; i++) {
      const child = siChildren[i];
      if (child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && child.type === 0) {
        authAttrsNode = child;
      }
      if (
        child.tagClass === forge.asn1.Class.UNIVERSAL &&
        child.type === forge.asn1.Type.OCTETSTRING &&
        !child.constructed
      ) {
        encDigestNode = child;
        if (i > 0) {
          const prev = siChildren[i - 1];
          if (
            prev.tagClass === forge.asn1.Class.UNIVERSAL &&
            prev.type === forge.asn1.Type.SEQUENCE &&
            prev.constructed
          ) {
            digestEncAlgNode = prev;
          }
        }
      }
    }

    if (!authAttrsNode || !encDigestNode) return false;

    const authAttrsDer = reencodeAuthAttrsAsSet(authAttrsNode);
    const encDigest = byteStringToUint8Array(encDigestNode.value as string);

    // Get signature algorithm OID
    let algOid = '';
    if (digestEncAlgNode) {
      const algChildren = digestEncAlgNode.value as forge.asn1.Asn1[];
      if (algChildren && algChildren.length > 0) {
        algOid = forge.asn1.derToOid(algChildren[0].value as string);
      }
    }

    // Get TSA certificate
    const certSequences = certNode.value as forge.asn1.Asn1[];
    if (!certSequences || certSequences.length === 0) return false;

    const tsaCertAsn1 = certSequences[0];
    const tsaCert = forge.pki.certificateFromAsn1(tsaCertAsn1);
    const tsaCertDer = byteStringToUint8Array(forge.asn1.toDer(tsaCertAsn1).getBytes());

    const result = verifySignatureOverAuthAttrs(tsaCert, tsaCertDer, authAttrsDer, encDigest, algOid);
    return result.valid;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hashing helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeHash(data: Uint8Array, algorithm: string): Uint8Array {
  const binaryStr = uint8ArrayToBinaryString(data);
  let md: forge.md.MessageDigest;

  switch (algorithm) {
    case 'SHA-1':
      md = forge.md.sha1.create();
      break;
    case 'SHA-384':
      md = forge.md.sha384.create();
      break;
    case 'SHA-512':
      md = forge.md.sha512.create();
      break;
    case 'SHA-256':
    default:
      md = forge.md.sha256.create();
      break;
  }

  md.update(binaryStr, 'raw');
  return byteStringToUint8Array(md.digest().getBytes());
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level DER parsing helpers (for EC key extraction without forge)
// ─────────────────────────────────────────────────────────────────────────────

interface TlvInfo {
  tag: number;
  contentOffset: number;
  contentLength: number;
}

function parseTlv(data: Uint8Array, offset: number): TlvInfo {
  const tag = data[offset];
  let pos = offset + 1;

  // Multi-byte tag
  if ((tag & 0x1f) === 0x1f) {
    while (pos < data.length && data[pos] & 0x80) pos++;
    pos++;
  }

  const lengthByte = data[pos++];
  let contentLength: number;

  if (lengthByte === 0x80) {
    // Indefinite length — not expected in DER certificates
    contentLength = 0;
  } else if (lengthByte & 0x80) {
    const numBytes = lengthByte & 0x7f;
    contentLength = 0;
    for (let i = 0; i < numBytes; i++) {
      contentLength = (contentLength * 256) + data[pos++];
    }
  } else {
    contentLength = lengthByte;
  }

  return { tag, contentOffset: pos, contentLength };
}

function findTagInSequence(data: Uint8Array, offset: number, targetTag: number): number {
  let pos = offset;
  const parentTlv = parseTlv(data, offset > 0 ? offset - 1 : 0);
  const end = offset === 0 ? data.length : (offset + (parentTlv.contentLength || data.length - offset));

  // If offset is the content start of a SEQUENCE, iterate its children
  while (pos < end && pos < data.length) {
    const tag = data[pos];
    if (tag === targetTag) return pos;
    const childTlv = parseTlv(data, pos);
    pos = childTlv.contentOffset + childTlv.contentLength;
  }

  return -1;
}

function derBytesToOid(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  const components: number[] = [];
  // First byte encodes first two components: value = 40 * first + second
  components.push(Math.floor(bytes[0] / 40));
  components.push(bytes[0] % 40);

  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = (value * 128) + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      components.push(value);
      value = 0;
    }
  }

  return components.join('.');
}

// ─────────────────────────────────────────────────────────────────────────────
// General helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractByteRange(
  arr: COSArray
): [number, number, number, number] | null {
  const elements = arr.getElements();
  if (elements.length !== 4) return null;
  const nums = elements.map((e) => {
    if (e instanceof COSInteger) return e.getValue();
    if (e instanceof COSFloat) return Math.floor(e.getValue());
    return NaN;
  });
  if (nums.some((n) => isNaN(n))) return null;
  return nums as [number, number, number, number];
}

function extractStringValue(
  dict: COSDictionary,
  key: string
): string | null {
  const entry = dict.getItem(key);
  if (entry instanceof COSString) return entry.getString();
  return null;
}

/**
 * Compute the total byte length of a BER/DER TLV (tag-length-value) element.
 * Handles both definite and indefinite (BER) length encoding.
 * Returns 0 if the data cannot be parsed.
 */
function berTlvLength(data: Uint8Array, offset: number): number {
  try {
    return berTlvLengthInternal(data, offset);
  } catch {
    return 0;
  }
}

function berTlvLengthInternal(data: Uint8Array, offset: number): number {
  if (offset + 1 >= data.length) return 0;

  const start = offset;
  const tag = data[offset++];

  // Multi-byte tag
  if ((tag & 0x1f) === 0x1f) {
    while (offset < data.length && data[offset] & 0x80) offset++;
    offset++; // last tag byte
  }

  if (offset >= data.length) return 0;
  const lengthByte = data[offset++];

  if (lengthByte === 0x80) {
    // Indefinite length — scan children until EOC (00 00)
    const constructed = !!(tag & 0x20);
    if (constructed) {
      while (offset + 1 < data.length) {
        if (data[offset] === 0x00 && data[offset + 1] === 0x00) {
          offset += 2; // consume EOC
          return offset - start;
        }
        const childLen = berTlvLengthInternal(data, offset);
        if (childLen === 0) return 0;
        offset += childLen;
      }
    }
    return 0;
  } else if (lengthByte & 0x80) {
    // Definite long form
    const numBytes = lengthByte & 0x7f;
    if (offset + numBytes > data.length) return 0;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length * 256) + data[offset++];
    }
    return offset - start + length;
  } else {
    // Definite short form
    return offset - start + lengthByte;
  }
}

function extractCertCn(cert: forge.pki.Certificate): string | null {
  const cn = cert.subject.getField('CN');
  return cn ? (cn.value as string) : null;
}

function parseAsn1Time(node: forge.asn1.Asn1): Date | null {
  try {
    const value = node.value as string;
    if (node.type === forge.asn1.Type.UTCTIME) {
      return forge.asn1.utcTimeToDate(value);
    }
    if (node.type === forge.asn1.Type.GENERALIZEDTIME) {
      return forge.asn1.generalizedTimeToDate(value);
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Parse a PDF date string (D:YYYYMMDDHHmmSSOHH'mm')
 */
function parsePdfDate(value: string | null): Date | null {
  if (!value) return null;
  try {
    let s = value;
    if (s.startsWith('D:')) s = s.slice(2);
    const year = parseInt(s.slice(0, 4), 10);
    const month = parseInt(s.slice(4, 6) || '01', 10) - 1;
    const day = parseInt(s.slice(6, 8) || '01', 10);
    const hour = parseInt(s.slice(8, 10) || '00', 10);
    const minute = parseInt(s.slice(10, 12) || '00', 10);
    const second = parseInt(s.slice(12, 14) || '00', 10);

    // Timezone offset
    const tzStr = s.slice(14);
    let tzOffsetMinutes = 0;
    if (tzStr.startsWith('Z')) {
      tzOffsetMinutes = 0;
    } else if (tzStr.startsWith('+') || tzStr.startsWith('-')) {
      const sign = tzStr[0] === '+' ? 1 : -1;
      const tzHour = parseInt(tzStr.slice(1, 3) || '0', 10);
      const tzMinute = parseInt(tzStr.slice(4, 6) || '0', 10);
      tzOffsetMinutes = sign * (tzHour * 60 + tzMinute);
    }

    const date = new Date(
      Date.UTC(year, month, day, hour, minute, second) -
        tzOffsetMinutes * 60000
    );
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function sha256Digest(data: Uint8Array): Uint8Array {
  const md = forge.md.sha256.create();
  md.update(uint8ArrayToBinaryString(data), 'raw');
  return byteStringToUint8Array(md.digest().getBytes());
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

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
