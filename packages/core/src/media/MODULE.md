# Module: Media Handling (`@opendockit/core/media`)

**Purpose:** Lazy image extraction from OPC packages, LRU caching, and image transforms (crop, recolor).

**Tier:** Fan-out 2 (depends on OPC layer for extraction)

**Inputs:** Part URIs from OPC package, image transform parameters from IR

**Outputs:**

- `image-loader.ts` — `loadImage(pkg: OpcPackage, partUri: string): Promise<ImageBitmap | HTMLImageElement>`
- `media-cache.ts` — `MediaCache` class with LRU eviction and configurable size limit
- `image-transforms.ts` — crop rect application, brightness/contrast (future)
- `index.ts` — barrel export

**Dependencies:**

- `../opc/` — `OpcPackage` for part extraction
- `../ir/` — image transform IR types

**Testing:** Load images from test PPTX, verify caching behavior, LRU eviction.
