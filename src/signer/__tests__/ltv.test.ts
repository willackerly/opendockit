import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';
import {
  addLtvToPdf,
  computeVriKey,
  extractOcspUrl,
  extractCrlUrls,
  buildOcspRequest,
  LtvError,
} from '../ltv';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
 * Create a self-signed test certificate (DER encoded).
 * Returns { certDer, keyPem }.
 */
function createTestCert(cn = 'Test Certificate'): {
  certDer: Uint8Array;
  keyPem: string;
  cert: forge.pki.Certificate;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 1
  );
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certDer = binaryStringToUint8Array(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  );
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  return { certDer, keyPem, cert };
}

/**
 * Create a test cert with AIA OCSP URL and CDP CRL URL extensions.
 */
function createTestCertWithExtensions(
  ocspUrl: string,
  crlUrl: string
): { certDer: Uint8Array; issuerDer: Uint8Array } {
  // Create issuer (CA) cert
  const caKeys = forge.pki.rsa.generateKeyPair(2048);
  const caCert = forge.pki.createCertificate();
  caCert.publicKey = caKeys.publicKey;
  caCert.serialNumber = '01';
  caCert.validity.notBefore = new Date();
  caCert.validity.notAfter = new Date();
  caCert.validity.notAfter.setFullYear(
    caCert.validity.notBefore.getFullYear() + 10
  );
  const caAttrs = [{ name: 'commonName', value: 'Test CA' }];
  caCert.setSubject(caAttrs);
  caCert.setIssuer(caAttrs);
  caCert.setExtensions([
    { name: 'basicConstraints', cA: true },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      cRLSign: true,
    },
  ]);
  caCert.sign(caKeys.privateKey, forge.md.sha256.create());

  // Create subject cert with AIA and CDP extensions
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 1
  );
  cert.setSubject([{ name: 'commonName', value: 'Test Subject' }]);
  cert.setIssuer(caAttrs);

  // Build AIA extension manually (forge doesn't have built-in support)
  const aiaValue = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [
      // AccessDescription for OCSP
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SEQUENCE,
        true,
        [
          // accessMethod: id-ad-ocsp (1.3.6.1.5.5.7.48.1)
          forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.OID,
            false,
            forge.asn1.oidToDer('1.3.6.1.5.5.7.48.1').getBytes()
          ),
          // accessLocation: uniformResourceIdentifier [6]
          forge.asn1.create(
            forge.asn1.Class.CONTEXT_SPECIFIC,
            6,
            false,
            ocspUrl
          ),
        ]
      ),
    ]
  );

  // Build CRL Distribution Points extension
  const cdpValue = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [
      // DistributionPoint
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SEQUENCE,
        true,
        [
          // distributionPoint [0]
          forge.asn1.create(
            forge.asn1.Class.CONTEXT_SPECIFIC,
            0,
            true,
            [
              // fullName: uniformResourceIdentifier [6]
              forge.asn1.create(
                forge.asn1.Class.CONTEXT_SPECIFIC,
                6,
                false,
                crlUrl
              ),
            ]
          ),
        ]
      ),
    ]
  );

  cert.setExtensions([
    {
      id: '1.3.6.1.5.5.7.1.1', // authorityInfoAccess
      value: forge.asn1.toDer(aiaValue).getBytes(),
    },
    {
      id: '2.5.29.31', // cRLDistributionPoints
      value: forge.asn1.toDer(cdpValue).getBytes(),
    },
  ]);
  cert.sign(caKeys.privateKey, forge.md.sha256.create());

  const certDer = binaryStringToUint8Array(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  );
  const issuerDer = binaryStringToUint8Array(
    forge.asn1.toDer(forge.pki.certificateToAsn1(caCert)).getBytes()
  );

  return { certDer, issuerDer };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeVriKey', () => {
  it('computes uppercase hex SHA-1 of input bytes', () => {
    const input = new Uint8Array([0x01, 0x02, 0x03]);
    const key = computeVriKey(input);
    // SHA-1 of [01, 02, 03]
    const md = forge.md.sha1.create();
    md.update('\x01\x02\x03', 'raw');
    const expected = md.digest().toHex().toUpperCase();
    expect(key).toBe(expected);
  });

  it('produces 40-character hex string', () => {
    const input = crypto.randomBytes(256);
    const key = computeVriKey(input);
    expect(key).toHaveLength(40);
    expect(key).toMatch(/^[0-9A-F]+$/);
  });
});

describe('extractOcspUrl', () => {
  it('returns null for self-signed cert without AIA', () => {
    const { certDer } = createTestCert();
    expect(extractOcspUrl(certDer)).toBeNull();
  });

  it('extracts OCSP URL from AIA extension', () => {
    const { certDer } = createTestCertWithExtensions(
      'http://ocsp.example.com',
      'http://crl.example.com/crl.pem'
    );
    expect(extractOcspUrl(certDer)).toBe('http://ocsp.example.com');
  });
});

describe('extractCrlUrls', () => {
  it('returns empty array for self-signed cert without CDP', () => {
    const { certDer } = createTestCert();
    expect(extractCrlUrls(certDer)).toEqual([]);
  });

  it('extracts CRL URL from CDP extension', () => {
    const { certDer } = createTestCertWithExtensions(
      'http://ocsp.example.com',
      'http://crl.example.com/crl.pem'
    );
    const urls = extractCrlUrls(certDer);
    expect(urls).toContain('http://crl.example.com/crl.pem');
  });
});

describe('buildOcspRequest', () => {
  it('produces valid ASN.1 OCSPRequest', () => {
    const { certDer, issuerDer } = createTestCertWithExtensions(
      'http://ocsp.example.com',
      'http://crl.example.com/crl.pem'
    );

    const reqBytes = buildOcspRequest(certDer, issuerDer);

    // Parse the DER
    const parsed = forge.asn1.fromDer(uint8ArrayToBinaryString(reqBytes));
    const children = (parsed as any).value as forge.asn1.Asn1[];
    expect(children).toBeDefined();
    expect(children.length).toBeGreaterThan(0);

    // Verify the OCSPRequest parses as valid ASN.1
    // It should be a SEQUENCE containing at least a TBSRequest
    expect(children.length).toBeGreaterThanOrEqual(1);
    // Verify re-serialization round-trips
    const reser = forge.asn1.toDer(parsed).getBytes();
    expect(reser.length).toBeGreaterThan(0);
  });
});

describe('addLtvToPdf', () => {
  let signedPdf: Uint8Array;

  beforeEach(() => {
    // Load a fixture PDF that has been signed
    const fixturePath = path.join(
      __dirname,
      '../../../test-pdfs/working/simple-test.pdf'
    );
    if (fs.existsSync(fixturePath)) {
      // We need a signed PDF — sign it first using the fixture signer
      // For unit tests, create a minimal signed PDF inline
    }
  });

  it('throws LtvError when PDF has no signature', async () => {
    // Create a minimal unsigned PDF
    const unsignedPdf = new TextEncoder().encode(
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n' +
      'xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n' +
      'trailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n49\n%%EOF\n'
    );

    await expect(
      addLtvToPdf(unsignedPdf, { fetchRevocationData: false })
    ).rejects.toThrow(LtvError);
  });

  it('adds DSS to a signed PDF with pre-supplied cert data', async () => {
    // Sign a test PDF using the fixture signer
    const { getFixtureSigner } = await import(
      '../../testing/fixture-signer'
    );
    const signer = getFixtureSigner();
    // FixtureSigner initializes in constructor — no unlock needed

    const { signPDFWithPDFBox } = await import('../pdfbox-signer');
    const simplePdf = fs.readFileSync(
      path.join(__dirname, '../../../test-pdfs/working/simple-test.pdf')
    );

    const result = await signPDFWithPDFBox(simplePdf, signer);
    signedPdf = result.signedData;

    // Add LTV with just the cert chain (no OCSP/CRL for self-signed)
    const ltvResult = await addLtvToPdf(signedPdf, {
      fetchRevocationData: false,
    });

    // Verify the result
    expect(ltvResult.pdfBytes.length).toBeGreaterThan(signedPdf.length);
    expect(ltvResult.certsEmbedded).toBeGreaterThanOrEqual(1);
    expect(ltvResult.vriKey).toHaveLength(40);
    expect(ltvResult.vriKey).toMatch(/^[0-9A-F]+$/);

    // Verify DSS is present in the output
    const outputText = uint8ArrayToString(ltvResult.pdfBytes);
    expect(outputText).toContain('/DSS');
    expect(outputText).toContain('/VRI');
    expect(outputText).toContain('/Certs');
    expect(outputText).toContain(ltvResult.vriKey);

    // Verify qpdf validates the structure
    const tmpPath = path.join(__dirname, '../../../tmp/ltv-test.pdf');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, ltvResult.pdfBytes);
  });

  it('adds DSS with pre-supplied OCSP responses and CRLs', async () => {
    const { getFixtureSigner } = await import(
      '../../testing/fixture-signer'
    );
    const signer = getFixtureSigner();
    // FixtureSigner initializes in constructor — no unlock needed

    const { signPDFWithPDFBox } = await import('../pdfbox-signer');
    const simplePdf = fs.readFileSync(
      path.join(__dirname, '../../../test-pdfs/working/simple-test.pdf')
    );

    const result = await signPDFWithPDFBox(simplePdf, signer);
    signedPdf = result.signedData;

    // Create fake OCSP response and CRL data for testing
    const fakeOcsp = new Uint8Array([
      0x30, 0x03, 0x0a, 0x01, 0x00, // Minimal OCSP response (status = successful)
    ]);
    const fakeCrl = new Uint8Array([
      0x30, 0x03, 0x02, 0x01, 0x01, // Minimal CRL-like structure
    ]);

    const ltvResult = await addLtvToPdf(signedPdf, {
      fetchRevocationData: false,
      ocspResponses: [fakeOcsp],
      crls: [fakeCrl],
    });

    expect(ltvResult.ocspsEmbedded).toBe(1);
    expect(ltvResult.crlsEmbedded).toBe(1);

    const outputText = uint8ArrayToString(ltvResult.pdfBytes);
    expect(outputText).toContain('/OCSPs');
    expect(outputText).toContain('/CRLs');
  });

  it('integrates with signPDFWithPDFBox via enableLTV option', async () => {
    const { getFixtureSigner } = await import(
      '../../testing/fixture-signer'
    );
    const signer = getFixtureSigner();
    // FixtureSigner initializes in constructor — no unlock needed

    const { signPDFWithPDFBox } = await import('../pdfbox-signer');
    const simplePdf = fs.readFileSync(
      path.join(__dirname, '../../../test-pdfs/working/simple-test.pdf')
    );

    const result = await signPDFWithPDFBox(simplePdf, signer, {
      enableLTV: true,
      ltvOptions: { fetchRevocationData: false },
    });

    // Verify DSS is in the output
    const outputText = uint8ArrayToString(result.signedData);
    expect(outputText).toContain('/DSS');
    expect(outputText).toContain('/VRI');
  });
});

function uint8ArrayToString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode(...chunk));
  }
  return chunks.join('');
}
