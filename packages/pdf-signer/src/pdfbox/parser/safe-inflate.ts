/**
 * Robust inflate wrapper.
 *
 * pako.inflate() has edge-case failures on certain zlib streams that
 * Node.js's zlib handles correctly. This wrapper tries pako first,
 * then falls back to node:zlib if available (Node.js only; in browsers,
 * pako is the only option).
 *
 * The node:zlib fallback uses dynamic require() to avoid breaking
 * browser bundlers (Vite/Rollup/webpack). It's lazy-loaded on first
 * pako failure, so there's zero overhead in the happy path.
 */

import { inflate as pakoInflate } from 'pako';

// Lazy-loaded node:zlib — only attempted after pako fails, only in Node.js
let nodeZlib: { inflateSync: (buf: Uint8Array) => Uint8Array } | undefined;
let nodeZlibLoaded = false;

function tryLoadNodeZlib(): typeof nodeZlib {
  if (nodeZlibLoaded) return nodeZlib;
  nodeZlibLoaded = true;
  try {
    // Dynamic require — only works in Node.js, silently fails in browsers
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodeZlib = typeof require === 'function' ? require('zlib') : undefined;
  } catch {
    // Not in Node.js or require not available
  }
  return nodeZlib;
}

export function safeInflate(data: Uint8Array): Uint8Array {
  try {
    const result = pakoInflate(data);
    if (result) return result;
  } catch {
    // Fall through to node:zlib fallback
  }

  // Node.js fallback — not available in browsers
  const zlib = tryLoadNodeZlib();
  if (zlib) {
    try {
      const buf = zlib.inflateSync(data);
      return new Uint8Array(buf);
    } catch {
      // zlib also failed
    }
  }

  throw new Error('Failed to inflate data: both pako and node:zlib failed');
}
