import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import forge from 'node-forge';
import { buildTimeStampReq, parseTimeStampResp, fetchTimestampToken, TSAError } from '../tsa';
import { computeRsaSignature, buildPdfBoxCmsSignature, extractCertInfo } from '../pdfbox-signer';
import type { CertInfo } from '../pdfbox-signer';

// Helper: forge binary string <-> Uint8Array
function binaryStringToUint8Array(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

/**
 * Build a minimal valid TimeStampResp for testing.
 * status=0 (granted), with a fake TimeStampToken (ContentInfo wrapping signedData OID).
 */
function buildFakeTimeStampResp(status = 0): Uint8Array {
  const asn1 = forge.asn1;

  const statusInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.INTEGER,
      false,
      forge.asn1.integerToDer(status).getBytes()
    ),
  ]);

  // Minimal fake TimeStampToken (ContentInfo with signedData OID)
  const fakeToken = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      forge.asn1.oidToDer('1.2.840.113549.1.7.2').getBytes()
    ),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(
          asn1.Class.UNIVERSAL,
          asn1.Type.INTEGER,
          false,
          forge.asn1.integerToDer(3).getBytes()
        ),
      ]),
    ]),
  ]);

  const resp = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    statusInfo,
    fakeToken,
  ]);

  const derBytes = forge.asn1.toDer(resp).getBytes();
  return binaryStringToUint8Array(derBytes);
}

/**
 * Build a TimeStampResp with only status (no token) for rejection testing.
 */
function buildRejectionResp(status: number): Uint8Array {
  const asn1 = forge.asn1;

  const statusInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.INTEGER,
      false,
      forge.asn1.integerToDer(status).getBytes()
    ),
  ]);

  const resp = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    statusInfo,
  ]);

  const derBytes = forge.asn1.toDer(resp).getBytes();
  return binaryStringToUint8Array(derBytes);
}

describe('buildTimeStampReq', () => {
  it('produces valid ASN.1 TimeStampReq', () => {
    const signatureValue = crypto.randomBytes(256);
    const reqBytes = buildTimeStampReq(signatureValue);

    // Parse back the DER
    const parsed = forge.asn1.fromDer(uint8ArrayToBinaryString(reqBytes));
    const children = parsed.value as forge.asn1.Asn1[];

    // Should be SEQUENCE with 3 children: version, messageImprint, certReq
    expect(children.length).toBe(3);

    // version = 1
    const versionNode = children[0];
    expect(versionNode.type).toBe(forge.asn1.Type.INTEGER);
    const versionStr = versionNode.value as string;
    expect(versionStr.charCodeAt(0)).toBe(1);

    // messageImprint is a SEQUENCE
    const messageImprint = children[1];
    expect(messageImprint.constructed).toBe(true);
    const imprintChildren = messageImprint.value as forge.asn1.Asn1[];
    expect(imprintChildren.length).toBe(2);

    // AlgorithmIdentifier should contain SHA-256 OID
    const algId = imprintChildren[0];
    const algChildren = algId.value as forge.asn1.Asn1[];
    const oidNode = algChildren[0];
    const oid = forge.asn1.derToOid(oidNode.value as string);
    expect(oid).toBe(forge.pki.oids.sha256);

    // hashedMessage should be 32 bytes (SHA-256)
    const hashNode = imprintChildren[1];
    expect(hashNode.type).toBe(forge.asn1.Type.OCTETSTRING);
    expect((hashNode.value as string).length).toBe(32);

    // Verify the hash matches SHA-256 of the input
    const expectedHash = crypto.createHash('sha256').update(signatureValue).digest();
    const actualHash = binaryStringToUint8Array(hashNode.value as string);
    expect(Buffer.from(actualHash)).toEqual(expectedHash);

    // certReq = true
    const certReqNode = children[2];
    expect(certReqNode.type).toBe(forge.asn1.Type.BOOLEAN);
    expect((certReqNode.value as string).charCodeAt(0)).toBe(0xff);
  });

  it('produces different hashes for different inputs', () => {
    const req1 = buildTimeStampReq(new Uint8Array([1, 2, 3]));
    const req2 = buildTimeStampReq(new Uint8Array([4, 5, 6]));
    expect(req1).not.toEqual(req2);
  });
});

describe('parseTimeStampResp', () => {
  it('extracts TimeStampToken from granted response (status=0)', () => {
    const resp = buildFakeTimeStampResp(0);
    const token = parseTimeStampResp(resp);

    // Token should be a valid ASN.1 SEQUENCE (ContentInfo)
    const parsed = forge.asn1.fromDer(uint8ArrayToBinaryString(token));
    expect(parsed.constructed).toBe(true);
    expect(parsed.type).toBe(forge.asn1.Type.SEQUENCE);

    // Should contain signedData OID
    const children = parsed.value as forge.asn1.Asn1[];
    const oid = forge.asn1.derToOid(children[0].value as string);
    expect(oid).toBe('1.2.840.113549.1.7.2');
  });

  it('accepts grantedWithMods response (status=1)', () => {
    const resp = buildFakeTimeStampResp(1);
    const token = parseTimeStampResp(resp);
    expect(token.length).toBeGreaterThan(0);
  });

  it('throws TSAError on rejection (status=2)', () => {
    const resp = buildRejectionResp(2);
    expect(() => parseTimeStampResp(resp)).toThrow(TSAError);
    try {
      parseTimeStampResp(resp);
    } catch (e) {
      expect(e).toBeInstanceOf(TSAError);
      expect((e as TSAError).tsaStatus).toBe(2);
    }
  });

  it('throws TSAError on waiting (status=3)', () => {
    const resp = buildRejectionResp(3);
    expect(() => parseTimeStampResp(resp)).toThrow(TSAError);
  });

  it('throws TSAError when TimeStampToken is missing', () => {
    const resp = buildRejectionResp(0); // status=0 but no token
    expect(() => parseTimeStampResp(resp)).toThrow('missing TimeStampToken');
  });
});

describe('fetchTimestampToken', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends correct request and parses response', async () => {
    const fakeResp = buildFakeTimeStampResp(0);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/timestamp-reply' }),
      arrayBuffer: () => Promise.resolve(fakeResp.buffer.slice(
        fakeResp.byteOffset,
        fakeResp.byteOffset + fakeResp.byteLength
      )),
    });

    const sigValue = crypto.randomBytes(256);
    const token = await fetchTimestampToken('http://tsa.example.com', sigValue);

    // Verify fetch was called with correct params
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://tsa.example.com');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/timestamp-query');
    expect(options.body).toBeInstanceOf(Uint8Array);

    // Token should be valid ASN.1
    expect(token.length).toBeGreaterThan(0);
    const parsed = forge.asn1.fromDer(uint8ArrayToBinaryString(token));
    expect(parsed.constructed).toBe(true);
  });

  it('throws TSAError on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
    });

    await expect(
      fetchTimestampToken('http://tsa.example.com', new Uint8Array([1, 2, 3]))
    ).rejects.toThrow(TSAError);

    try {
      await fetchTimestampToken('http://tsa.example.com', new Uint8Array([1, 2, 3]));
    } catch (e) {
      expect((e as TSAError).httpStatus).toBe(500);
      expect((e as TSAError).url).toBe('http://tsa.example.com');
    }
  });

  it('throws TSAError on wrong Content-Type', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
    });

    await expect(
      fetchTimestampToken('http://tsa.example.com', new Uint8Array([1, 2, 3]))
    ).rejects.toThrow('Unexpected Content-Type');
  });

  it('throws TSAError on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      fetchTimestampToken('http://tsa.example.com', new Uint8Array([1, 2, 3]))
    ).rejects.toThrow(TSAError);
  });
});

describe('CMS with timestamp unsigned attributes', () => {
  // Generate a test keypair
  let keypair: forge.pki.rsa.KeyPair;
  let certDer: Uint8Array;
  let certInfo: CertInfo;

  beforeEach(() => {
    keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    const cert = forge.pki.createCertificate();
    cert.publicKey = keypair.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
    const attrs = [{ name: 'commonName', value: 'Test' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keypair.privateKey, forge.md.sha256.create());

    const certAsn1 = forge.pki.certificateToAsn1(cert);
    const certDerStr = forge.asn1.toDer(certAsn1).getBytes();
    certDer = binaryStringToUint8Array(certDerStr);
    certInfo = extractCertInfo(certDer);
  });

  it('CMS without timestamp produces no unsigned attributes', () => {
    const contentToSign = new Uint8Array([1, 2, 3, 4]);
    const signingDate = new Date('2024-01-01T00:00:00Z');

    const cmsBytes = buildPdfBoxCmsSignature({
      contentToSign,
      certInfo,
      rawCertificateDer: certDer,
      privateKey: keypair.privateKey,
      signingDate,
      useBerIndefiniteLength: false,
    });

    // Parse CMS and find SignerInfo
    const cms = forge.asn1.fromDer(uint8ArrayToBinaryString(cmsBytes));
    const signerInfo = findSignerInfo(cms);
    expect(signerInfo).toBeDefined();

    // SignerInfo without unsigned attrs has 6 children
    const children = signerInfo!.value as forge.asn1.Asn1[];
    expect(children.length).toBe(6);
  });

  it('CMS with timestamp includes unsigned attributes', () => {
    const contentToSign = new Uint8Array([1, 2, 3, 4]);
    const signingDate = new Date('2024-01-01T00:00:00Z');
    const fakeTimestampToken = buildFakeTimeStampResp(0);
    // Extract the token from the fake response
    const token = parseTimeStampResp(fakeTimestampToken);

    const precomputedSig = computeRsaSignature({
      contentToSign,
      privateKey: keypair.privateKey,
      signingDate,
    });

    const cmsBytes = buildPdfBoxCmsSignature({
      contentToSign,
      certInfo,
      rawCertificateDer: certDer,
      privateKey: keypair.privateKey,
      signingDate,
      useBerIndefiniteLength: false,
      precomputedSignature: precomputedSig,
      timestampToken: token,
    });

    // Parse CMS and find SignerInfo
    const cms = forge.asn1.fromDer(uint8ArrayToBinaryString(cmsBytes));
    const signerInfo = findSignerInfo(cms);
    expect(signerInfo).toBeDefined();

    // SignerInfo with unsigned attrs has 7 children
    const children = signerInfo!.value as forge.asn1.Asn1[];
    expect(children.length).toBe(7);

    // Last child should be [1] IMPLICIT (unsigned attributes)
    const unsignedAttrs = children[6];
    expect(unsignedAttrs.tagClass).toBe(forge.asn1.Class.CONTEXT_SPECIFIC);
    expect(unsignedAttrs.type).toBe(1);
    expect(unsignedAttrs.constructed).toBe(true);

    // Should contain one attribute with id-aa-timeStampToken OID
    const attrList = unsignedAttrs.value as forge.asn1.Asn1[];
    expect(attrList.length).toBe(1);
    const attr = attrList[0];
    const attrChildren = attr.value as forge.asn1.Asn1[];
    const oid = forge.asn1.derToOid(attrChildren[0].value as string);
    expect(oid).toBe('1.2.840.113549.1.9.16.2.14');
  });

  it('precomputedSignature produces identical CMS to computed signature', () => {
    const contentToSign = new Uint8Array([1, 2, 3, 4]);
    const signingDate = new Date('2024-01-01T00:00:00Z');

    // Build without precomputed
    const cms1 = buildPdfBoxCmsSignature({
      contentToSign,
      certInfo,
      rawCertificateDer: certDer,
      privateKey: keypair.privateKey,
      signingDate,
      useBerIndefiniteLength: false,
    });

    // Build with precomputed
    const precomputedSig = computeRsaSignature({
      contentToSign,
      privateKey: keypair.privateKey,
      signingDate,
    });
    const cms2 = buildPdfBoxCmsSignature({
      contentToSign,
      certInfo,
      rawCertificateDer: certDer,
      privateKey: keypair.privateKey,
      signingDate,
      useBerIndefiniteLength: false,
      precomputedSignature: precomputedSig,
    });

    expect(cms1).toEqual(cms2);
  });
});

/**
 * Navigate the CMS ASN.1 tree to find the SignerInfo node.
 * ContentInfo → [0] SignedData → SignerInfos SET → first SignerInfo
 */
function findSignerInfo(contentInfo: forge.asn1.Asn1): forge.asn1.Asn1 | undefined {
  const ciChildren = contentInfo.value as forge.asn1.Asn1[];
  if (!ciChildren || ciChildren.length < 2) return undefined;

  // [0] EXPLICIT wrapping SignedData
  const wrapper = ciChildren[1];
  const wrapperChildren = wrapper.value as forge.asn1.Asn1[];
  if (!wrapperChildren || wrapperChildren.length === 0) return undefined;

  // SignedData SEQUENCE
  const signedData = wrapperChildren[0];
  const sdChildren = signedData.value as forge.asn1.Asn1[];
  if (!sdChildren) return undefined;

  // Last child of SignedData is SignerInfos SET
  const signerInfos = sdChildren[sdChildren.length - 1];
  const siChildren = signerInfos.value as forge.asn1.Asn1[];
  if (!siChildren || siChildren.length === 0) return undefined;

  return siChildren[0];
}
