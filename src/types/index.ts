/**
 * pdfbox-ts Types
 *
 * Types for PDF signing with byte-for-byte PDFBox parity.
 */

export interface CertificateChain {
  cert: Uint8Array;
  chain: Uint8Array[];
}

export interface BrowserKeypairSigner {
  getCertificate(): Promise<CertificateChain>;
  sign(data: Uint8Array): Promise<Uint8Array>;
  getEmail(): string;
  getAlgorithm(): { hash: string; signature: string; keySize: number };
}

export interface SignatureOptions {
  reason?: string;
  location?: string;
  contactInfo?: string;
  signatureAppearance?: SignatureAppearance;
  includeTimestamp?: boolean;
  timestampURL?: string;
  forceFullSave?: boolean;
  /** Flatten all form fields before signing. Bakes widget appearances into
   *  page content streams, making form fields non-editable after signing.
   *  Default: false (forms remain fillable). */
  flattenForms?: boolean;
  /** Enable LTV (Long-Term Validation). Embeds certificates, OCSP responses,
   *  and CRLs in a DSS dictionary appended as a second incremental save.
   *  Requires network access to fetch OCSP/CRL data for non-self-signed certs. */
  enableLTV?: boolean;
  /** Options for LTV embedding. Only used when enableLTV is true. */
  ltvOptions?: {
    /** Extra certificates (DER) to embed beyond those in the CMS signature. */
    extraCerts?: Uint8Array[];
    /** Pre-fetched OCSP responses (DER) to embed. */
    ocspResponses?: Uint8Array[];
    /** Pre-fetched CRLs (DER) to embed. */
    crls?: Uint8Array[];
    /** Attempt to fetch OCSP/CRL data from cert extensions. Default: true. */
    fetchRevocationData?: boolean;
    /** Timeout (ms) for OCSP/CRL HTTP requests. Default: 15000. */
    timeoutMs?: number;
  };
}

/** Controls visual signature layout when `signatureAppearance` is provided. */
export type AppearanceMode = 'hybrid' | 'image-only' | 'text-only';

export interface SignatureAppearance {
  imageData?: Uint8Array; // PNG image data
  text?: string;
  fieldName?: string;
  /** Brand text displayed at top of info box (default: "Dapple SafeSign"). */
  brandText?: string;
  /** Controls appearance layout.
   *  - 'hybrid' (default when imageData is set): PNG left + info box right
   *  - 'image-only': full-bleed PNG, no text
   *  - 'text-only' (default when no imageData): branded info box only */
  appearanceMode?: AppearanceMode;
  /** Show metadata footer at the bottom of the signature box.
   *  Default: true. Set to false to hide. */
  showFooter?: boolean;
  position: {
    page: number; // 0-indexed
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SignatureObjectNumbers {
  signature?: number;
  widget?: number;
  acroForm?: number;
  catalog?: number;
  page?: number;
}

export interface SignedPDFResult {
  signedData: Uint8Array;
  signatureInfo: {
    signedAt: Date;
    signedBy: string;
    byteRange: [number, number, number, number];
    signatureSize: number;
    xrefStart?: number;
    objects?: SignatureObjectNumbers;
  };
}
