/**
 * Shared Vite alias definitions for OpenDocKit workspace packages.
 *
 * All dev tools (viewer, element-debug, etc.) need the same set of
 * aliases to resolve `@opendockit/*` imports to source files for HMR.
 *
 * Usage:
 * ```ts
 * import { buildAliases } from '../shared/vite-aliases.js';
 *
 * export default defineConfig({
 *   resolve: { alias: buildAliases(__dirname) },
 * });
 * ```
 */
import { resolve } from 'node:path';
import type { Alias } from 'vite';

export interface AliasOptions {
  /** Include @opendockit/elements package alias. */
  elements?: boolean;
  /** Include @opendockit/render package alias. */
  render?: boolean;
  /** Include @opendockit/pdf-signer aliases. */
  pdfSigner?: boolean;
}

/**
 * Build the standard alias array for OpenDocKit workspace packages.
 *
 * @param toolDir - The `__dirname` of the tool's vite.config.ts
 * @param options - Which optional packages to include
 */
export function buildAliases(toolDir: string, options?: AliasOptions): Alias[] {
  const coreBase = resolve(toolDir, '../../packages/core/src');
  const pptxBase = resolve(toolDir, '../../packages/pptx/src');

  const aliases: Alias[] = [
    // @opendockit/core subpath exports (more specific first)
    { find: '@opendockit/core/drawingml/renderer', replacement: resolve(coreBase, 'drawingml/renderer') },
    { find: '@opendockit/core/drawingml', replacement: resolve(coreBase, 'drawingml') },
    { find: '@opendockit/core/diagnostics', replacement: resolve(coreBase, 'diagnostics') },
    { find: '@opendockit/core/opc', replacement: resolve(coreBase, 'opc') },
    { find: '@opendockit/core/theme', replacement: resolve(coreBase, 'theme') },
    { find: '@opendockit/core/ir', replacement: resolve(coreBase, 'ir') },
    { find: '@opendockit/core/units', replacement: resolve(coreBase, 'units') },
    { find: '@opendockit/core/capability', replacement: resolve(coreBase, 'capability') },
    { find: '@opendockit/core/font', replacement: resolve(coreBase, 'font') },
    { find: '@opendockit/core/media', replacement: resolve(coreBase, 'media') },
    { find: '@opendockit/core/edit', replacement: resolve(coreBase, 'edit') },
    { find: '@opendockit/core/wasm', replacement: resolve(coreBase, 'wasm') },

    // Base package aliases (must come after subpath aliases)
    { find: '@opendockit/core', replacement: coreBase },
    { find: '@opendockit/pptx', replacement: pptxBase },
  ];

  // Optional packages
  if (options?.elements) {
    const elementsBase = resolve(toolDir, '../../packages/elements/src');
    aliases.push({ find: '@opendockit/elements', replacement: resolve(elementsBase, 'index.ts') });
  }

  if (options?.render) {
    const renderBase = resolve(toolDir, '../../packages/render/src');
    aliases.push({ find: '@opendockit/render', replacement: resolve(renderBase, 'index.ts') });
  }

  if (options?.pdfSigner) {
    const pdfSignerBase = resolve(toolDir, '../../packages/pdf-signer/src');
    // Subpath exports first
    aliases.push(
      { find: '@opendockit/pdf-signer/render', replacement: resolve(pdfSignerBase, 'render/index.ts') },
      { find: '@opendockit/pdf-signer/elements', replacement: resolve(pdfSignerBase, 'elements/index.ts') },
      // Base alias
      { find: '@opendockit/pdf-signer', replacement: resolve(pdfSignerBase, 'index.ts') },
    );
  }

  return aliases;
}
