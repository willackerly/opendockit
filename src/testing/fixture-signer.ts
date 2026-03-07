import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';

import type { BrowserKeypairSigner, CertificateChain } from '../types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function loadFile(relativePath: string): Buffer {
  const absolute = path.resolve(repoRoot, relativePath);
  return fs.readFileSync(absolute);
}

function derToUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export class FixtureSigner implements BrowserKeypairSigner {
  private readonly certChain: CertificateChain;
  private readonly privateKey: forge.pki.rsa.PrivateKey;
  private readonly email: string;

  constructor() {
    const certDer = loadFile('fixtures/keys/pdfbox-ts-cert.der');
    const keyPem = loadFile('fixtures/keys/pdfbox-ts-key.pem').toString('utf8');

    const certAsn1 = forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary')));
    const cert = forge.pki.certificateFromAsn1(certAsn1);

    this.privateKey = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
    (globalThis as any).__forgePrivateKey = this.privateKey;
    this.certChain = {
      cert: derToUint8Array(certDer),
      chain: [],
    };
    this.email = cert.subject.getField('CN')?.value || 'fixture@pdfbox-ts.dev';
  }

  async getCertificate(): Promise<CertificateChain> {
    return this.certChain;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const md = forge.md.sha256.create();
    md.update(Buffer.from(data).toString('binary'));
    const signature = this.privateKey.sign(md);
    return Uint8Array.from(signature, (char: string) => char.charCodeAt(0));
  }

  getEmail(): string {
    return this.email;
  }

  getAlgorithm() {
    return {
      hash: 'sha256',
      signature: 'rsa',
      keySize: 2048,
    };
  }
}

let cachedSigner: FixtureSigner | null = null;

export function getFixtureSigner(): FixtureSigner {
  if (!cachedSigner) {
    cachedSigner = new FixtureSigner();
  }
  return cachedSigner;
}
