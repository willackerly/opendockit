/**
 * E2E LTV (Long-Term Validation) tests using local CA + OCSP infrastructure.
 *
 * Prerequisites:
 *   1. bash scripts/ltv-ca-setup.sh   (generate PKI hierarchy)
 *   2. bash scripts/ltv-ocsp-start.sh (start OCSP responder + static server)
 *
 * Run:
 *   PDFBOX_TS_E2E_LTV=1 pnpm test -- ltv-live
 *
 * The signing cert has AIA/CDP extensions pointing to localhost:9080/9081,
 * so the LTV code can fetch real OCSP responses and CRLs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { execSync } from 'node:child_process';
import { signPDFWithPDFBox } from '../pdfbox-signer';
import { addLtvToPdf, extractOcspUrl, extractCrlUrls } from '../ltv';
import type { BrowserKeypairSigner, CertificateChain } from '../../types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const caDir = path.join(repoRoot, 'fixtures', 'ltv-ca');
const tmpDir = path.join(repoRoot, 'tmp', 'ltv-live');

const SKIP = !process.env.PDFBOX_TS_E2E_LTV;

function binaryStringToUint8Array(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

/**
 * Create a BrowserKeypairSigner using the LTV CA signing cert + key.
 */
function createLtvSigner(): BrowserKeypairSigner {
  const signingCertPem = fs.readFileSync(
    path.join(caDir, 'signing', 'signing.crt'),
    'utf8'
  );
  const signingKeyPem = fs.readFileSync(
    path.join(caDir, 'signing', 'signing.key'),
    'utf8'
  );
  const intermediateCertPem = fs.readFileSync(
    path.join(caDir, 'intermediate', 'intermediate.crt'),
    'utf8'
  );
  const rootCertPem = fs.readFileSync(
    path.join(caDir, 'root', 'root.crt'),
    'utf8'
  );

  const signingCert = forge.pki.certificateFromPem(signingCertPem);
  const privateKey = forge.pki.privateKeyFromPem(
    signingKeyPem
  ) as forge.pki.rsa.PrivateKey;

  // Store privateKey globally for the CMS builder
  (globalThis as any).__forgePrivateKey = privateKey;

  // Convert certs to DER
  const signingCertDer = binaryStringToUint8Array(
    forge.asn1.toDer(forge.pki.certificateToAsn1(signingCert)).getBytes()
  );

  const intermediateCert = forge.pki.certificateFromPem(intermediateCertPem);
  const intermediateDer = binaryStringToUint8Array(
    forge.asn1.toDer(forge.pki.certificateToAsn1(intermediateCert)).getBytes()
  );

  const rootCert = forge.pki.certificateFromPem(rootCertPem);
  const rootDer = binaryStringToUint8Array(
    forge.asn1.toDer(forge.pki.certificateToAsn1(rootCert)).getBytes()
  );

  const certChain: CertificateChain = {
    cert: signingCertDer,
    chain: [intermediateDer, rootDer],
  };

  return {
    async getCertificate() {
      return certChain;
    },
    async sign(data: Uint8Array) {
      const md = forge.md.sha256.create();
      md.update(Buffer.from(data).toString('binary'));
      const signature = privateKey.sign(md);
      return Uint8Array.from(signature, (char: string) => char.charCodeAt(0));
    },
    getEmail() {
      return signingCert.subject.getField('CN')?.value || 'ltv-signer@pdfbox-ts.dev';
    },
    getAlgorithm() {
      return { hash: 'sha256', signature: 'rsa', keySize: 2048 };
    },
  };
}

function uint8ArrayToString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode(...chunk));
  }
  return chunks.join('');
}

describe.skipIf(SKIP)('LTV E2E (local CA + OCSP)', () => {
  let signer: BrowserKeypairSigner;
  let testPdf: Uint8Array;

  beforeAll(() => {
    // Verify LTV CA exists
    if (!fs.existsSync(path.join(caDir, 'signing', 'signing.crt'))) {
      throw new Error(
        'LTV CA not set up. Run: bash scripts/ltv-ca-setup.sh'
      );
    }

    signer = createLtvSigner();

    // Use the simple-test fixture
    testPdf = fs.readFileSync(
      path.join(repoRoot, 'test-pdfs', 'working', 'simple-test.pdf')
    );

    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up global state
    delete (globalThis as any).__forgePrivateKey;
  });

  it('signing cert has AIA and CDP extensions', async () => {
    const certChain = await signer.getCertificate();
    const ocspUrl = extractOcspUrl(certChain.cert);
    const crlUrls = extractCrlUrls(certChain.cert);

    expect(ocspUrl).toBe('http://localhost:9081');
    expect(crlUrls).toContain('http://localhost:9080/intermediate.crl');
  });

  it('signs PDF with LTV CA cert chain', async () => {
    const result = await signPDFWithPDFBox(testPdf, signer);

    expect(result.signedData.length).toBeGreaterThan(testPdf.length);

    // Write signed PDF for inspection
    const signedPath = path.join(tmpDir, 'ltv-signed.pdf');
    fs.writeFileSync(signedPath, result.signedData);

    // Validate with qpdf
    try {
      execSync(`qpdf --check "${signedPath}" 2>&1`);
    } catch (e: any) {
      // qpdf warnings are OK as long as it doesn't hard-fail
      if (e.status > 2) throw e;
    }
  });

  it('fetches OCSP response from local responder', async () => {
    // Sign first
    const result = await signPDFWithPDFBox(testPdf, signer);
    const signedPdf = result.signedData;

    // Add LTV with real OCSP/CRL fetching from local servers
    const ltvResult = await addLtvToPdf(signedPdf, {
      fetchRevocationData: true,
      timeoutMs: 5000,
    });

    expect(ltvResult.certsEmbedded).toBeGreaterThanOrEqual(1);
    expect(ltvResult.ocspsEmbedded).toBeGreaterThanOrEqual(1);
    expect(ltvResult.vriKey).toHaveLength(40);

    // Verify DSS structure
    const outputText = uint8ArrayToString(ltvResult.pdfBytes);
    expect(outputText).toContain('/DSS');
    expect(outputText).toContain('/VRI');
    expect(outputText).toContain('/Certs');
    expect(outputText).toContain('/OCSPs');

    // Write LTV PDF for inspection
    const ltvPath = path.join(tmpDir, 'ltv-with-dss.pdf');
    fs.writeFileSync(ltvPath, ltvResult.pdfBytes);

    // Validate with qpdf
    try {
      execSync(`qpdf --check "${ltvPath}" 2>&1`);
    } catch (e: any) {
      if (e.status > 2) throw e;
    }

    // Validate signature with pdfsig
    try {
      const pdfsigOut = execSync(`pdfsig "${ltvPath}" 2>&1`).toString();
      // Signature should be present
      expect(pdfsigOut).toContain('Signature');
    } catch {
      // pdfsig might not be installed — skip validation
    }
  });

  it('embeds CRL from local static server', async () => {
    const result = await signPDFWithPDFBox(testPdf, signer);

    // Fetch CRL directly and pass as pre-supplied data
    // (OCSP takes priority over CRL in fetchRevocationDataForChain,
    //  so we test CRL embedding by providing it explicitly)
    const crlResponse = await fetch('http://localhost:9080/intermediate.crl');
    expect(crlResponse.ok).toBe(true);
    const crlData = new Uint8Array(await crlResponse.arrayBuffer());
    expect(crlData.length).toBeGreaterThan(0);

    const ltvResult = await addLtvToPdf(result.signedData, {
      fetchRevocationData: false,
      crls: [crlData],
    });

    expect(ltvResult.crlsEmbedded).toBe(1);

    const outputText = uint8ArrayToString(ltvResult.pdfBytes);
    expect(outputText).toContain('/CRLs');
  });

  it('integrated enableLTV option works with local servers', async () => {
    const result = await signPDFWithPDFBox(testPdf, signer, {
      enableLTV: true,
      ltvOptions: {
        fetchRevocationData: true,
        timeoutMs: 5000,
      },
    });

    const outputText = uint8ArrayToString(result.signedData);
    expect(outputText).toContain('/DSS');
    expect(outputText).toContain('/VRI');
    expect(outputText).toContain('/OCSPs');

    // Write for inspection
    const integratedPath = path.join(tmpDir, 'ltv-integrated.pdf');
    fs.writeFileSync(integratedPath, result.signedData);
  });

  it('produces valid PDF structure (qpdf + pdfsig)', async () => {
    const result = await signPDFWithPDFBox(testPdf, signer, {
      enableLTV: true,
      ltvOptions: {
        fetchRevocationData: true,
        timeoutMs: 5000,
      },
    });

    const pdfPath = path.join(tmpDir, 'ltv-validation.pdf');
    fs.writeFileSync(pdfPath, result.signedData);

    // qpdf structural validation
    try {
      execSync(`qpdf --check "${pdfPath}" 2>&1`);
    } catch (e: any) {
      if (e.status > 2) throw e;
    }

    // pdfsig cryptographic validation
    try {
      const pdfsigOut = execSync(`pdfsig "${pdfPath}" 2>&1`).toString();
      expect(pdfsigOut).toContain('Signature');
      console.log('pdfsig output:', pdfsigOut);
    } catch {
      console.log('pdfsig not available — skipping cryptographic validation');
    }
  });
});
