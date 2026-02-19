#!/usr/bin/env bash
# Regenerate the font metrics bundle from TTF/OTF files in fonts/.
# Output: packages/core/src/font/data/metrics-bundle.ts
set -euo pipefail

cd "$(dirname "$0")/.."

node scripts/extract-font-metrics.mjs \
  --map "Calibri=fonts/Carlito-Regular.ttf:regular,fonts/Carlito-Bold.ttf:bold,fonts/Carlito-Italic.ttf:italic,fonts/Carlito-BoldItalic.ttf:boldItalic" \
  --map "Calibri Light=fonts/Carlito-Regular.ttf:regular" \
  --map "Cambria=fonts/Caladea-Regular.ttf:regular,fonts/Caladea-Bold.ttf:bold,fonts/Caladea-Italic.ttf:italic,fonts/Caladea-BoldItalic.ttf:boldItalic" \
  --map "Arial=fonts/LiberationSans-Regular.ttf:regular,fonts/LiberationSans-Bold.ttf:bold,fonts/LiberationSans-Italic.ttf:italic,fonts/LiberationSans-BoldItalic.ttf:boldItalic" \
  --map "Times New Roman=fonts/LiberationSerif-Regular.ttf:regular,fonts/LiberationSerif-Bold.ttf:bold,fonts/LiberationSerif-Italic.ttf:italic,fonts/LiberationSerif-BoldItalic.ttf:boldItalic" \
  --map "Courier New=fonts/LiberationMono-Regular.ttf:regular,fonts/LiberationMono-Bold.ttf:bold,fonts/LiberationMono-Italic.ttf:italic,fonts/LiberationMono-BoldItalic.ttf:boldItalic" \
  --map "Georgia=fonts/Gelasio-Regular.ttf:regular,fonts/Gelasio-Bold.ttf:bold,fonts/Gelasio-Italic.ttf:italic,fonts/Gelasio-BoldItalic.ttf:boldItalic" \
  --map "Segoe UI=fonts/Selawik-Regular.ttf:regular,fonts/Selawik-Bold.ttf:bold" \
  --map "Segoe UI Light=fonts/Selawik-Light.ttf:regular" \
  --map "Segoe UI Semibold=fonts/Selawik-Semibold.ttf:regular" \
  --map "Segoe UI Semilight=fonts/Selawik-Semilight.ttf:regular" \
  --map "Arial Narrow=fonts/LiberationSansNarrow-Regular.ttf:regular,fonts/LiberationSansNarrow-Bold.ttf:bold,fonts/LiberationSansNarrow-Italic.ttf:italic,fonts/LiberationSansNarrow-BoldItalic.ttf:boldItalic" \
  --map "Palatino Linotype=fonts/texgyrepagella-regular.otf:regular,fonts/texgyrepagella-bold.otf:bold,fonts/texgyrepagella-italic.otf:italic,fonts/texgyrepagella-bolditalic.otf:boldItalic" \
  --map "Bookman Old Style=fonts/texgyrebonum-regular.otf:regular,fonts/texgyrebonum-bold.otf:bold,fonts/texgyrebonum-italic.otf:italic,fonts/texgyrebonum-bolditalic.otf:boldItalic" \
  --map "Century Schoolbook=fonts/texgyreschola-regular.otf:regular,fonts/texgyreschola-bold.otf:bold,fonts/texgyreschola-italic.otf:italic,fonts/texgyreschola-bolditalic.otf:boldItalic" \
  --map "Barlow=fonts/Barlow-Regular.ttf:regular,fonts/Barlow-Bold.ttf:bold,fonts/Barlow-Italic.ttf:italic,fonts/Barlow-BoldItalic.ttf:boldItalic" \
  --map "Barlow Light=fonts/Barlow-Light.ttf:regular,fonts/Barlow-LightItalic.ttf:italic" \
  --map "Roboto Slab=fonts/RobotoSlab-Regular.ttf:regular,fonts/RobotoSlab-Bold.ttf:bold" \
  --map "Roboto Slab Light=fonts/RobotoSlab-Light.ttf:regular" \
  --map "Roboto Slab SemiBold=fonts/RobotoSlab-SemiBold.ttf:regular" \
  --map "Play=fonts/Play-Regular.ttf:regular,fonts/Play-Bold.ttf:bold" \
  --map "Lato=fonts/Lato-Regular.ttf:regular,fonts/Lato-Bold.ttf:bold,fonts/Lato-Italic.ttf:italic,fonts/Lato-BoldItalic.ttf:boldItalic" \
  --map "Lato Light=fonts/Lato-Light.ttf:regular,fonts/Lato-LightItalic.ttf:italic" \
  --map "Arimo=fonts/Arimo-Regular.ttf:regular,fonts/Arimo-Bold.ttf:bold,fonts/Arimo-Italic.ttf:italic,fonts/Arimo-BoldItalic.ttf:boldItalic" \
  --map "Comfortaa=fonts/Comfortaa-Regular.ttf:regular,fonts/Comfortaa-Bold.ttf:bold" \
  --map "Open Sans=fonts/OpenSans-Regular.ttf:regular,fonts/OpenSans-Bold.ttf:bold" \
  --map "Noto Sans Symbols=fonts/NotoSansSymbols-Regular.ttf:regular,fonts/NotoSansSymbols-Bold.ttf:bold" \
  --map "Courier Prime=fonts/CourierPrime-Regular.ttf:regular,fonts/CourierPrime-Bold.ttf:bold,fonts/CourierPrime-Italic.ttf:italic,fonts/CourierPrime-BoldItalic.ttf:boldItalic" \
  --map "Fira Code=fonts/FiraCode-Regular.ttf:regular,fonts/FiraCode-Bold.ttf:bold" \
  --map "Montserrat=fonts/Montserrat-Regular.ttf:regular,fonts/Montserrat-Bold.ttf:bold,fonts/Montserrat-Italic.ttf:italic,fonts/Montserrat-BoldItalic.ttf:boldItalic" \
  --map "Noto Sans=fonts/NotoSans-Regular.ttf:regular,fonts/NotoSans-Bold.ttf:bold,fonts/NotoSans-Italic.ttf:italic,fonts/NotoSans-BoldItalic.ttf:boldItalic" \
  --map "Noto Serif=fonts/NotoSerif-Regular.ttf:regular,fonts/NotoSerif-Bold.ttf:bold,fonts/NotoSerif-Italic.ttf:italic,fonts/NotoSerif-BoldItalic.ttf:boldItalic" \
  --map "Oswald=fonts/Oswald-Regular.ttf:regular,fonts/Oswald-Bold.ttf:bold" \
  --map "Playfair Display=fonts/PlayfairDisplay-Regular.ttf:regular,fonts/PlayfairDisplay-Bold.ttf:bold,fonts/PlayfairDisplay-Italic.ttf:italic,fonts/PlayfairDisplay-BoldItalic.ttf:boldItalic" \
  --map "Poppins=fonts/Poppins-Regular.ttf:regular,fonts/Poppins-Bold.ttf:bold,fonts/Poppins-Italic.ttf:italic,fonts/Poppins-BoldItalic.ttf:boldItalic" \
  --map "Raleway=fonts/Raleway-Regular.ttf:regular,fonts/Raleway-Bold.ttf:bold,fonts/Raleway-Italic.ttf:italic,fonts/Raleway-BoldItalic.ttf:boldItalic" \
  --map "Roboto=fonts/Roboto-Regular.ttf:regular,fonts/Roboto-Bold.ttf:bold,fonts/Roboto-Italic.ttf:italic,fonts/Roboto-BoldItalic.ttf:boldItalic" \
  --map "Roboto Mono=fonts/RobotoMono-Regular.ttf:regular,fonts/RobotoMono-Bold.ttf:bold,fonts/RobotoMono-Italic.ttf:italic,fonts/RobotoMono-BoldItalic.ttf:boldItalic" \
  --map "Source Code Pro=fonts/SourceCodePro-Regular.ttf:regular,fonts/SourceCodePro-Bold.ttf:bold,fonts/SourceCodePro-Italic.ttf:italic,fonts/SourceCodePro-BoldItalic.ttf:boldItalic" \
  --map "Source Sans Pro=fonts/SourceSans3-Regular.ttf:regular,fonts/SourceSans3-Bold.ttf:bold,fonts/SourceSans3-Italic.ttf:italic,fonts/SourceSans3-BoldItalic.ttf:boldItalic" \
  --map "Tinos=fonts/Tinos-Regular.ttf:regular,fonts/Tinos-Bold.ttf:bold,fonts/Tinos-Italic.ttf:italic,fonts/Tinos-BoldItalic.ttf:boldItalic" \
  --map "Ubuntu=fonts/Ubuntu-Regular.ttf:regular,fonts/Ubuntu-Bold.ttf:bold,fonts/Ubuntu-Italic.ttf:italic,fonts/Ubuntu-BoldItalic.ttf:boldItalic" \
  --output packages/core/src/font/data/metrics-bundle.ts
