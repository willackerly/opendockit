/**
 * RFC 3161 TSA (Time-Stamp Authority) Client
 *
 * Provides timestamp token fetching for PDF signatures with long-term
 * validation (LTV). Without timestamps, signature validity depends on
 * the signing certificate's expiry date.
 *
 * Matches Java PDFBox TSAClient behavior:
 * - SHA-256 message imprint
 * - version 1, certReq=true, no nonce
 */

import forge from 'node-forge';

/**
 * Error thrown when a TSA request fails.
 */
export class TSAError extends Error {
  url?: string;
  httpStatus?: number;
  tsaStatus?: number;

  constructor(
    message: string,
    options?: { url?: string; httpStatus?: number; tsaStatus?: number }
  ) {
    super(message);
    this.name = 'TSAError';
    this.url = options?.url;
    this.httpStatus = options?.httpStatus;
    this.tsaStatus = options?.tsaStatus;
  }
}

/**
 * Build an RFC 3161 TimeStampReq for the given signature value.
 *
 * Computes SHA-256 digest of the signature bytes and creates a
 * TimeStampReq with version=1, certReq=true, no nonce.
 * Matches Java PDFBox TSAClient behavior.
 */
export function buildTimeStampReq(signatureValue: Uint8Array): Uint8Array {
  const md = forge.md.sha256.create();
  md.update(uint8ArrayToBinaryString(signatureValue), 'raw');
  const hashBinaryString = md.digest().getBytes();

  const asn1 = forge.asn1;
  const sha256Oid = forge.pki.oids.sha256;

  const messageImprint = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    // AlgorithmIdentifier { algorithm, parameters }
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.OID,
        false,
        forge.asn1.oidToDer(sha256Oid).getBytes()
      ),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
    ]),
    // hashedMessage OCTET STRING
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, hashBinaryString),
  ]);

  const tsReq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    // version INTEGER v1(1)
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.INTEGER,
      false,
      forge.asn1.integerToDer(1).getBytes()
    ),
    messageImprint,
    // certReq BOOLEAN TRUE
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, '\xff'),
  ]);

  return binaryStringToUint8Array(forge.asn1.toDer(tsReq).getBytes());
}

/**
 * Parse an RFC 3161 TimeStampResp and extract the TimeStampToken.
 *
 * Validates the PKIStatusInfo status field:
 * - 0 (granted) and 1 (grantedWithMods) are accepted
 * - All other values throw TSAError
 *
 * Returns the raw DER bytes of the TimeStampToken (ContentInfo).
 */
export function parseTimeStampResp(responseBytes: Uint8Array): Uint8Array {
  const derString = uint8ArrayToBinaryString(responseBytes);
  const resp = forge.asn1.fromDer(derString);

  // TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken OPTIONAL }
  const children = resp.value as forge.asn1.Asn1[];
  if (!children || children.length === 0) {
    throw new TSAError('Invalid TimeStampResp: empty SEQUENCE');
  }

  // PKIStatusInfo ::= SEQUENCE { status PKIStatus INTEGER, ... }
  const statusInfo = children[0];
  const statusChildren = statusInfo.value as forge.asn1.Asn1[];
  const statusNode = statusChildren[0];

  // Parse the INTEGER value from the status node
  const statusValueStr = statusNode.value as string;
  let statusValue = 0;
  for (let i = 0; i < statusValueStr.length; i++) {
    statusValue = (statusValue << 8) | statusValueStr.charCodeAt(i);
  }

  if (statusValue !== 0 && statusValue !== 1) {
    throw new TSAError(
      `TSA returned status ${statusValue} (expected 0=granted or 1=grantedWithMods)`,
      { tsaStatus: statusValue }
    );
  }

  // TimeStampToken is the second element
  if (children.length < 2) {
    throw new TSAError('TimeStampResp missing TimeStampToken');
  }

  const timestampToken = children[1];
  // Re-serialize to DER (canonical, so round-trip is safe)
  return binaryStringToUint8Array(forge.asn1.toDer(timestampToken).getBytes());
}

/**
 * Fetch a timestamp token from an RFC 3161 TSA server.
 *
 * Builds a TimeStampReq, POSTs to the TSA URL, parses the response,
 * and returns the raw DER bytes of the TimeStampToken.
 *
 * Uses native fetch() (Node >= 18) with AbortSignal.timeout.
 */
export async function fetchTimestampToken(
  url: string,
  signatureValue: Uint8Array,
  timeoutMs?: number
): Promise<Uint8Array> {
  const reqBody = buildTimeStampReq(signatureValue);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',
      },
      body: reqBody as unknown as BodyInit,
      signal: AbortSignal.timeout(timeoutMs ?? 30_000),
    });
  } catch (error) {
    throw new TSAError(
      `TSA request failed: ${(error as Error).message}`,
      { url }
    );
  }

  if (!response.ok) {
    throw new TSAError(
      `TSA HTTP error: ${response.status} ${response.statusText}`,
      { url, httpStatus: response.status }
    );
  }

  const contentType = response.headers.get('Content-Type');
  if (contentType && !contentType.includes('application/timestamp-reply')) {
    throw new TSAError(
      `Unexpected Content-Type from TSA: ${contentType}`,
      { url }
    );
  }

  const responseBytes = new Uint8Array(await response.arrayBuffer());

  try {
    return parseTimeStampResp(responseBytes);
  } catch (e) {
    if (e instanceof TSAError) {
      e.url = url;
      throw e;
    }
    throw new TSAError(
      `Failed to parse TSA response: ${(e as Error).message}`,
      { url }
    );
  }
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
