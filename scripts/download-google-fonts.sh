#!/usr/bin/env bash
# Download missing Google Fonts families (variable TTFs) and instance to static.
# All fonts are OFL-1.1 or Apache-2.0 licensed.
# Source: Google Fonts GitHub repos.
# Requires: python3 with fontTools (pip install fonttools)
set -euo pipefail

FONTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/fonts"
VAR_DIR="$FONTS_DIR/.variable"
mkdir -p "$FONTS_DIR" "$VAR_DIR"

GF_RAW="https://raw.githubusercontent.com/google/fonts/main"

download() {
  local url="$1"
  local dest="$2"
  if [ -f "$dest" ]; then
    echo "  SKIP (exists): $(basename "$dest")"
    return
  fi
  echo "  GET: $(basename "$dest")"
  curl -fsSL -o "$dest" "$url" || { echo "  FAIL: $(basename "$dest")"; return 1; }
}

# Instance a variable font to a static instance.
# Usage: instance <input.ttf> <output.ttf> <wght> [<wdth>]
instance() {
  local input="$1" output="$2" wght="$3" wdth="${4:-}"
  if [ -f "$output" ]; then
    echo "  SKIP (exists): $(basename "$output")"
    return
  fi
  if [ -n "$wdth" ]; then
    python3 -c "
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.ttLib import TTFont
font = TTFont('$input')
result = instantiateVariableFont(font, {'wght': $wght, 'wdth': $wdth})
result.save('$output')
" 2>/dev/null
  else
    python3 -c "
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.ttLib import TTFont
font = TTFont('$input')
result = instantiateVariableFont(font, {'wght': $wght})
result.save('$output')
" 2>/dev/null
  fi
  echo "  INST: $(basename "$output") (wght=$wght${wdth:+, wdth=$wdth})"
}

echo "=== Downloading variable Google Fonts ==="

# --- Single-axis [wght] fonts ---

# Fira Code (no italic)
echo "Fira Code..."
download "$GF_RAW/ofl/firacode/FiraCode%5Bwght%5D.ttf" "$VAR_DIR/FiraCode[wght].ttf"
instance "$VAR_DIR/FiraCode[wght].ttf" "$FONTS_DIR/FiraCode-Regular.ttf" 400
instance "$VAR_DIR/FiraCode[wght].ttf" "$FONTS_DIR/FiraCode-Bold.ttf" 700

# Montserrat
echo "Montserrat..."
download "$GF_RAW/ofl/montserrat/Montserrat%5Bwght%5D.ttf" "$VAR_DIR/Montserrat[wght].ttf"
download "$GF_RAW/ofl/montserrat/Montserrat-Italic%5Bwght%5D.ttf" "$VAR_DIR/Montserrat-Italic[wght].ttf"
instance "$VAR_DIR/Montserrat[wght].ttf" "$FONTS_DIR/Montserrat-Regular.ttf" 400
instance "$VAR_DIR/Montserrat[wght].ttf" "$FONTS_DIR/Montserrat-Bold.ttf" 700
instance "$VAR_DIR/Montserrat-Italic[wght].ttf" "$FONTS_DIR/Montserrat-Italic.ttf" 400
instance "$VAR_DIR/Montserrat-Italic[wght].ttf" "$FONTS_DIR/Montserrat-BoldItalic.ttf" 700

# Oswald (no italic)
echo "Oswald..."
download "$GF_RAW/ofl/oswald/Oswald%5Bwght%5D.ttf" "$VAR_DIR/Oswald[wght].ttf"
instance "$VAR_DIR/Oswald[wght].ttf" "$FONTS_DIR/Oswald-Regular.ttf" 400
instance "$VAR_DIR/Oswald[wght].ttf" "$FONTS_DIR/Oswald-Bold.ttf" 700

# Playfair Display
echo "Playfair Display..."
download "$GF_RAW/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf" "$VAR_DIR/PlayfairDisplay[wght].ttf"
download "$GF_RAW/ofl/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf" "$VAR_DIR/PlayfairDisplay-Italic[wght].ttf"
instance "$VAR_DIR/PlayfairDisplay[wght].ttf" "$FONTS_DIR/PlayfairDisplay-Regular.ttf" 400
instance "$VAR_DIR/PlayfairDisplay[wght].ttf" "$FONTS_DIR/PlayfairDisplay-Bold.ttf" 700
instance "$VAR_DIR/PlayfairDisplay-Italic[wght].ttf" "$FONTS_DIR/PlayfairDisplay-Italic.ttf" 400
instance "$VAR_DIR/PlayfairDisplay-Italic[wght].ttf" "$FONTS_DIR/PlayfairDisplay-BoldItalic.ttf" 700

# Raleway
echo "Raleway..."
download "$GF_RAW/ofl/raleway/Raleway%5Bwght%5D.ttf" "$VAR_DIR/Raleway[wght].ttf"
download "$GF_RAW/ofl/raleway/Raleway-Italic%5Bwght%5D.ttf" "$VAR_DIR/Raleway-Italic[wght].ttf"
instance "$VAR_DIR/Raleway[wght].ttf" "$FONTS_DIR/Raleway-Regular.ttf" 400
instance "$VAR_DIR/Raleway[wght].ttf" "$FONTS_DIR/Raleway-Bold.ttf" 700
instance "$VAR_DIR/Raleway-Italic[wght].ttf" "$FONTS_DIR/Raleway-Italic.ttf" 400
instance "$VAR_DIR/Raleway-Italic[wght].ttf" "$FONTS_DIR/Raleway-BoldItalic.ttf" 700

# Roboto Mono
echo "Roboto Mono..."
download "$GF_RAW/ofl/robotomono/RobotoMono%5Bwght%5D.ttf" "$VAR_DIR/RobotoMono[wght].ttf"
download "$GF_RAW/ofl/robotomono/RobotoMono-Italic%5Bwght%5D.ttf" "$VAR_DIR/RobotoMono-Italic[wght].ttf"
instance "$VAR_DIR/RobotoMono[wght].ttf" "$FONTS_DIR/RobotoMono-Regular.ttf" 400
instance "$VAR_DIR/RobotoMono[wght].ttf" "$FONTS_DIR/RobotoMono-Bold.ttf" 700
instance "$VAR_DIR/RobotoMono-Italic[wght].ttf" "$FONTS_DIR/RobotoMono-Italic.ttf" 400
instance "$VAR_DIR/RobotoMono-Italic[wght].ttf" "$FONTS_DIR/RobotoMono-BoldItalic.ttf" 700

# Source Code Pro
echo "Source Code Pro..."
download "$GF_RAW/ofl/sourcecodepro/SourceCodePro%5Bwght%5D.ttf" "$VAR_DIR/SourceCodePro[wght].ttf"
download "$GF_RAW/ofl/sourcecodepro/SourceCodePro-Italic%5Bwght%5D.ttf" "$VAR_DIR/SourceCodePro-Italic[wght].ttf"
instance "$VAR_DIR/SourceCodePro[wght].ttf" "$FONTS_DIR/SourceCodePro-Regular.ttf" 400
instance "$VAR_DIR/SourceCodePro[wght].ttf" "$FONTS_DIR/SourceCodePro-Bold.ttf" 700
instance "$VAR_DIR/SourceCodePro-Italic[wght].ttf" "$FONTS_DIR/SourceCodePro-Italic.ttf" 400
instance "$VAR_DIR/SourceCodePro-Italic[wght].ttf" "$FONTS_DIR/SourceCodePro-BoldItalic.ttf" 700

# Source Sans 3 (registered as "Source Sans Pro" for backward compat)
echo "Source Sans 3..."
download "$GF_RAW/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf" "$VAR_DIR/SourceSans3[wght].ttf"
download "$GF_RAW/ofl/sourcesans3/SourceSans3-Italic%5Bwght%5D.ttf" "$VAR_DIR/SourceSans3-Italic[wght].ttf"
instance "$VAR_DIR/SourceSans3[wght].ttf" "$FONTS_DIR/SourceSans3-Regular.ttf" 400
instance "$VAR_DIR/SourceSans3[wght].ttf" "$FONTS_DIR/SourceSans3-Bold.ttf" 700
instance "$VAR_DIR/SourceSans3-Italic[wght].ttf" "$FONTS_DIR/SourceSans3-Italic.ttf" 400
instance "$VAR_DIR/SourceSans3-Italic[wght].ttf" "$FONTS_DIR/SourceSans3-BoldItalic.ttf" 700

# --- Two-axis [wdth,wght] fonts ---

# Noto Sans
echo "Noto Sans..."
download "$GF_RAW/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf" "$VAR_DIR/NotoSans[wdth,wght].ttf"
download "$GF_RAW/ofl/notosans/NotoSans-Italic%5Bwdth%2Cwght%5D.ttf" "$VAR_DIR/NotoSans-Italic[wdth,wght].ttf"
instance "$VAR_DIR/NotoSans[wdth,wght].ttf" "$FONTS_DIR/NotoSans-Regular.ttf" 400 100
instance "$VAR_DIR/NotoSans[wdth,wght].ttf" "$FONTS_DIR/NotoSans-Bold.ttf" 700 100
instance "$VAR_DIR/NotoSans-Italic[wdth,wght].ttf" "$FONTS_DIR/NotoSans-Italic.ttf" 400 100
instance "$VAR_DIR/NotoSans-Italic[wdth,wght].ttf" "$FONTS_DIR/NotoSans-BoldItalic.ttf" 700 100

# Noto Serif
echo "Noto Serif..."
download "$GF_RAW/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf" "$VAR_DIR/NotoSerif[wdth,wght].ttf"
download "$GF_RAW/ofl/notoserif/NotoSerif-Italic%5Bwdth%2Cwght%5D.ttf" "$VAR_DIR/NotoSerif-Italic[wdth,wght].ttf"
instance "$VAR_DIR/NotoSerif[wdth,wght].ttf" "$FONTS_DIR/NotoSerif-Regular.ttf" 400 100
instance "$VAR_DIR/NotoSerif[wdth,wght].ttf" "$FONTS_DIR/NotoSerif-Bold.ttf" 700 100
instance "$VAR_DIR/NotoSerif-Italic[wdth,wght].ttf" "$FONTS_DIR/NotoSerif-Italic.ttf" 400 100
instance "$VAR_DIR/NotoSerif-Italic[wdth,wght].ttf" "$FONTS_DIR/NotoSerif-BoldItalic.ttf" 700 100

# Roboto
echo "Roboto..."
download "$GF_RAW/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf" "$VAR_DIR/Roboto[wdth,wght].ttf"
download "$GF_RAW/ofl/roboto/Roboto-Italic%5Bwdth%2Cwght%5D.ttf" "$VAR_DIR/Roboto-Italic[wdth,wght].ttf"
instance "$VAR_DIR/Roboto[wdth,wght].ttf" "$FONTS_DIR/Roboto-Regular.ttf" 400 100
instance "$VAR_DIR/Roboto[wdth,wght].ttf" "$FONTS_DIR/Roboto-Bold.ttf" 700 100
instance "$VAR_DIR/Roboto-Italic[wdth,wght].ttf" "$FONTS_DIR/Roboto-Italic.ttf" 400 100
instance "$VAR_DIR/Roboto-Italic[wdth,wght].ttf" "$FONTS_DIR/Roboto-BoldItalic.ttf" 700 100

echo ""
echo "=== Download and instancing complete ==="
echo "Fonts directory: $FONTS_DIR"
ls -1 "$FONTS_DIR"/*.ttf 2>/dev/null | wc -l | xargs -I{} echo "Total TTF files: {}"
