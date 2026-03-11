#!/usr/bin/env bash
# Download all font sources needed by generate-font-package.py.
# Fonts are OFL-1.1, Apache-2.0, MIT, Ubuntu-Font-License, or GUST-Font-License.
# Sources: Google Fonts GitHub, Liberation Fonts GitHub, CTAN, Selawik GitHub.
# Requires: python3 with fontTools (pip install fonttools brotli)
#           For Selawik: python3 with ufo2ft + defcon (pip install ufo2ft defcon)
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
  if [ ! -f "$input" ]; then
    echo "  SKIP (no source): $(basename "$input")"
    return
  fi
  local script_file
  script_file=$(mktemp /tmp/font-instance-XXXXXX.py)
  if [ -n "$wdth" ]; then
    cat > "$script_file" << PYEOF
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.ttLib import TTFont
font = TTFont('$input')
result = instantiateVariableFont(font, {'wght': $wght, 'wdth': $wdth})
result.save('$output')
PYEOF
  else
    cat > "$script_file" << PYEOF
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.ttLib import TTFont
font = TTFont('$input')
result = instantiateVariableFont(font, {'wght': $wght})
result.save('$output')
PYEOF
  fi
  python3 "$script_file" 2>/dev/null
  rm -f "$script_file"
  echo "  INST: $(basename "$output") (wght=$wght${wdth:+, wdth=$wdth})"
}

echo "=== Downloading Google Fonts (variable → static instancing) ==="

# ─── Single-axis [wght] variable fonts ────────────────────────────────

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

# Comfortaa (no italic)
echo "Comfortaa..."
download "$GF_RAW/ofl/comfortaa/Comfortaa%5Bwght%5D.ttf" "$VAR_DIR/Comfortaa[wght].ttf"
instance "$VAR_DIR/Comfortaa[wght].ttf" "$FONTS_DIR/Comfortaa-Regular.ttf" 400
instance "$VAR_DIR/Comfortaa[wght].ttf" "$FONTS_DIR/Comfortaa-Bold.ttf" 700
instance "$VAR_DIR/Comfortaa[wght].ttf" "$FONTS_DIR/Comfortaa-Light.ttf" 300

# Gelasio (Georgia substitute)
echo "Gelasio..."
download "$GF_RAW/ofl/gelasio/Gelasio%5Bwght%5D.ttf" "$VAR_DIR/Gelasio[wght].ttf"
download "$GF_RAW/ofl/gelasio/Gelasio-Italic%5Bwght%5D.ttf" "$VAR_DIR/Gelasio-Italic[wght].ttf"
instance "$VAR_DIR/Gelasio[wght].ttf" "$FONTS_DIR/Gelasio-Regular.ttf" 400
instance "$VAR_DIR/Gelasio[wght].ttf" "$FONTS_DIR/Gelasio-Bold.ttf" 700
instance "$VAR_DIR/Gelasio-Italic[wght].ttf" "$FONTS_DIR/Gelasio-Italic.ttf" 400
instance "$VAR_DIR/Gelasio-Italic[wght].ttf" "$FONTS_DIR/Gelasio-BoldItalic.ttf" 700

# Arimo (Arial substitute, under apache/)
echo "Arimo..."
download "$GF_RAW/apache/arimo/Arimo%5Bwght%5D.ttf" "$VAR_DIR/Arimo[wght].ttf"
download "$GF_RAW/apache/arimo/Arimo-Italic%5Bwght%5D.ttf" "$VAR_DIR/Arimo-Italic[wght].ttf"
instance "$VAR_DIR/Arimo[wght].ttf" "$FONTS_DIR/Arimo-Regular.ttf" 400
instance "$VAR_DIR/Arimo[wght].ttf" "$FONTS_DIR/Arimo-Bold.ttf" 700
instance "$VAR_DIR/Arimo-Italic[wght].ttf" "$FONTS_DIR/Arimo-Italic.ttf" 400
instance "$VAR_DIR/Arimo-Italic[wght].ttf" "$FONTS_DIR/Arimo-BoldItalic.ttf" 700

# Noto Sans Symbols (no italic)
echo "Noto Sans Symbols..."
download "$GF_RAW/ofl/notosanssymbols/NotoSansSymbols%5Bwght%5D.ttf" "$VAR_DIR/NotoSansSymbols[wght].ttf"
instance "$VAR_DIR/NotoSansSymbols[wght].ttf" "$FONTS_DIR/NotoSansSymbols-Regular.ttf" 400
instance "$VAR_DIR/NotoSansSymbols[wght].ttf" "$FONTS_DIR/NotoSansSymbols-Bold.ttf" 700

# Roboto Slab (under apache/, no italic)
echo "Roboto Slab..."
download "$GF_RAW/apache/robotoslab/RobotoSlab%5Bwght%5D.ttf" "$VAR_DIR/RobotoSlab[wght].ttf"
instance "$VAR_DIR/RobotoSlab[wght].ttf" "$FONTS_DIR/RobotoSlab-Regular.ttf" 400
instance "$VAR_DIR/RobotoSlab[wght].ttf" "$FONTS_DIR/RobotoSlab-Bold.ttf" 700
instance "$VAR_DIR/RobotoSlab[wght].ttf" "$FONTS_DIR/RobotoSlab-Light.ttf" 300
instance "$VAR_DIR/RobotoSlab[wght].ttf" "$FONTS_DIR/RobotoSlab-Medium.ttf" 500
instance "$VAR_DIR/RobotoSlab[wght].ttf" "$FONTS_DIR/RobotoSlab-SemiBold.ttf" 600

# ─── Two-axis [wdth,wght] variable fonts ──────────────────────────────

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

# Open Sans (two-axis)
echo "Open Sans..."
download "$GF_RAW/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf" "$VAR_DIR/OpenSans[wdth,wght].ttf"
instance "$VAR_DIR/OpenSans[wdth,wght].ttf" "$FONTS_DIR/OpenSans-Regular.ttf" 400 100
instance "$VAR_DIR/OpenSans[wdth,wght].ttf" "$FONTS_DIR/OpenSans-Bold.ttf" 700 100
instance "$VAR_DIR/OpenSans[wdth,wght].ttf" "$FONTS_DIR/OpenSans-ExtraBold.ttf" 800 100

# ─── Static weight downloads (not variable on Google Fonts) ───────────

echo "Barlow (static)..."
download "$GF_RAW/ofl/barlow/Barlow-Regular.ttf" "$FONTS_DIR/Barlow-Regular.ttf"
download "$GF_RAW/ofl/barlow/Barlow-Bold.ttf" "$FONTS_DIR/Barlow-Bold.ttf"
download "$GF_RAW/ofl/barlow/Barlow-Italic.ttf" "$FONTS_DIR/Barlow-Italic.ttf"
download "$GF_RAW/ofl/barlow/Barlow-BoldItalic.ttf" "$FONTS_DIR/Barlow-BoldItalic.ttf"
download "$GF_RAW/ofl/barlow/Barlow-Light.ttf" "$FONTS_DIR/Barlow-Light.ttf"
download "$GF_RAW/ofl/barlow/Barlow-LightItalic.ttf" "$FONTS_DIR/Barlow-LightItalic.ttf"
download "$GF_RAW/ofl/barlow/Barlow-Medium.ttf" "$FONTS_DIR/Barlow-Medium.ttf"

echo "Carlito (Calibri substitute)..."
download "$GF_RAW/ofl/carlito/Carlito-Regular.ttf" "$FONTS_DIR/Carlito-Regular.ttf"
download "$GF_RAW/ofl/carlito/Carlito-Bold.ttf" "$FONTS_DIR/Carlito-Bold.ttf"
download "$GF_RAW/ofl/carlito/Carlito-Italic.ttf" "$FONTS_DIR/Carlito-Italic.ttf"
download "$GF_RAW/ofl/carlito/Carlito-BoldItalic.ttf" "$FONTS_DIR/Carlito-BoldItalic.ttf"

echo "Caladea (Cambria substitute)..."
download "$GF_RAW/ofl/caladea/Caladea-Regular.ttf" "$FONTS_DIR/Caladea-Regular.ttf"
download "$GF_RAW/ofl/caladea/Caladea-Bold.ttf" "$FONTS_DIR/Caladea-Bold.ttf"
download "$GF_RAW/ofl/caladea/Caladea-Italic.ttf" "$FONTS_DIR/Caladea-Italic.ttf"
download "$GF_RAW/ofl/caladea/Caladea-BoldItalic.ttf" "$FONTS_DIR/Caladea-BoldItalic.ttf"

echo "Tinos (Times New Roman substitute)..."
download "$GF_RAW/apache/tinos/Tinos-Regular.ttf" "$FONTS_DIR/Tinos-Regular.ttf"
download "$GF_RAW/apache/tinos/Tinos-Bold.ttf" "$FONTS_DIR/Tinos-Bold.ttf"
download "$GF_RAW/apache/tinos/Tinos-Italic.ttf" "$FONTS_DIR/Tinos-Italic.ttf"
download "$GF_RAW/apache/tinos/Tinos-BoldItalic.ttf" "$FONTS_DIR/Tinos-BoldItalic.ttf"

echo "Courier Prime..."
download "$GF_RAW/ofl/courierprime/CourierPrime-Regular.ttf" "$FONTS_DIR/CourierPrime-Regular.ttf"
download "$GF_RAW/ofl/courierprime/CourierPrime-Bold.ttf" "$FONTS_DIR/CourierPrime-Bold.ttf"
download "$GF_RAW/ofl/courierprime/CourierPrime-Italic.ttf" "$FONTS_DIR/CourierPrime-Italic.ttf"
download "$GF_RAW/ofl/courierprime/CourierPrime-BoldItalic.ttf" "$FONTS_DIR/CourierPrime-BoldItalic.ttf"

echo "Lato..."
download "$GF_RAW/ofl/lato/Lato-Regular.ttf" "$FONTS_DIR/Lato-Regular.ttf"
download "$GF_RAW/ofl/lato/Lato-Bold.ttf" "$FONTS_DIR/Lato-Bold.ttf"
download "$GF_RAW/ofl/lato/Lato-Italic.ttf" "$FONTS_DIR/Lato-Italic.ttf"
download "$GF_RAW/ofl/lato/Lato-BoldItalic.ttf" "$FONTS_DIR/Lato-BoldItalic.ttf"
download "$GF_RAW/ofl/lato/Lato-Light.ttf" "$FONTS_DIR/Lato-Light.ttf"
download "$GF_RAW/ofl/lato/Lato-LightItalic.ttf" "$FONTS_DIR/Lato-LightItalic.ttf"

echo "Poppins..."
download "$GF_RAW/ofl/poppins/Poppins-Regular.ttf" "$FONTS_DIR/Poppins-Regular.ttf"
download "$GF_RAW/ofl/poppins/Poppins-Bold.ttf" "$FONTS_DIR/Poppins-Bold.ttf"
download "$GF_RAW/ofl/poppins/Poppins-Italic.ttf" "$FONTS_DIR/Poppins-Italic.ttf"
download "$GF_RAW/ofl/poppins/Poppins-BoldItalic.ttf" "$FONTS_DIR/Poppins-BoldItalic.ttf"

echo "Play..."
download "$GF_RAW/ofl/play/Play-Regular.ttf" "$FONTS_DIR/Play-Regular.ttf"
download "$GF_RAW/ofl/play/Play-Bold.ttf" "$FONTS_DIR/Play-Bold.ttf"

echo "Ubuntu..."
download "$GF_RAW/ufl/ubuntu/Ubuntu-Regular.ttf" "$FONTS_DIR/Ubuntu-Regular.ttf"
download "$GF_RAW/ufl/ubuntu/Ubuntu-Bold.ttf" "$FONTS_DIR/Ubuntu-Bold.ttf"
download "$GF_RAW/ufl/ubuntu/Ubuntu-Italic.ttf" "$FONTS_DIR/Ubuntu-Italic.ttf"
download "$GF_RAW/ufl/ubuntu/Ubuntu-BoldItalic.ttf" "$FONTS_DIR/Ubuntu-BoldItalic.ttf"

# ─── Liberation Fonts (from GitHub tarball) ────────────────────────────

echo "Liberation Fonts..."
if [ ! -f "$FONTS_DIR/LiberationSans-Regular.ttf" ]; then
  LIBERATION_VER="2.1.5"
  TMPTAR=$(mktemp /tmp/liberation-XXXXXX.tar.gz)
  echo "  GET: liberation-fonts-ttf-$LIBERATION_VER.tar.gz"
  curl -fsSL -o "$TMPTAR" "https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-$LIBERATION_VER.tar.gz"
  TMPDIR_EXTRACT=$(mktemp -d /tmp/liberation-XXXXXX)
  tar xzf "$TMPTAR" -C "$TMPDIR_EXTRACT"
  LIBDIR=$(find "$TMPDIR_EXTRACT" -type d -name "liberation-fonts-ttf-*" | head -1)
  for ttf in "$LIBDIR"/*.ttf; do
    cp "$ttf" "$FONTS_DIR/"
    echo "  COPY: $(basename "$ttf")"
  done
  rm -rf "$TMPTAR" "$TMPDIR_EXTRACT"
else
  echo "  SKIP (exists): LiberationSans-Regular.ttf"
fi

# ─── Selawik (Segoe UI substitute — built from UFO sources) ───────────

echo "Selawik..."
if [ ! -f "$FONTS_DIR/Selawik-Regular.ttf" ]; then
  TMPDIR_SEL=$(mktemp -d /tmp/selawik-XXXXXX)
  echo "  Cloning Selawik repo..."
  git clone --depth 1 https://github.com/AaronBell/Selawik.git "$TMPDIR_SEL/repo" 2>/dev/null

  for style in Regular Bold Light; do
    UFO_DIR="$TMPDIR_SEL/repo/Source files/UFO/Selawik-${style}.ufo"
    if [ -d "$UFO_DIR" ]; then
      SCRIPT=$(mktemp /tmp/build-selawik-XXXXXX.py)
      cat > "$SCRIPT" << 'PYEOF'
import sys, os
style = sys.argv[1]
ufo_path = sys.argv[2]
out_path = sys.argv[3]
try:
    import ufo2ft
    from defcon import Font
    font = Font(ufo_path)
    ttf = ufo2ft.compileTTF(font)
    ttf.save(out_path)
    print(f"  Built: Selawik-{style}.ttf")
except ImportError:
    print(f"  SKIP: Selawik-{style}.ttf (need: pip3 install ufo2ft defcon)")
PYEOF
      python3 "$SCRIPT" "$style" "$UFO_DIR" "$FONTS_DIR/Selawik-${style}.ttf" 2>&1
      rm -f "$SCRIPT"
    fi
  done

  # Create approximate Semibold/Semilight from available weights
  [ -f "$FONTS_DIR/Selawik-Bold.ttf" ] && [ ! -f "$FONTS_DIR/Selawik-Semibold.ttf" ] && \
    cp "$FONTS_DIR/Selawik-Bold.ttf" "$FONTS_DIR/Selawik-Semibold.ttf" && echo "  APPROX: Selawik-Semibold.ttf (from Bold)"
  [ -f "$FONTS_DIR/Selawik-Light.ttf" ] && [ ! -f "$FONTS_DIR/Selawik-Semilight.ttf" ] && \
    cp "$FONTS_DIR/Selawik-Light.ttf" "$FONTS_DIR/Selawik-Semilight.ttf" && echo "  APPROX: Selawik-Semilight.ttf (from Light)"

  rm -rf "$TMPDIR_SEL"
else
  echo "  SKIP (exists): Selawik-Regular.ttf"
fi

# ─── TeX Gyre fonts (from CTAN mirrors) ───────────────────────────────

echo "TeX Gyre fonts..."
CTAN="https://mirrors.ctan.org/fonts/tex-gyre/opentype"

for style in regular bold italic bolditalic; do
  download "$CTAN/texgyrepagella-${style}.otf" "$FONTS_DIR/texgyrepagella-${style}.otf"
  download "$CTAN/texgyrebonum-${style}.otf" "$FONTS_DIR/texgyrebonum-${style}.otf"
  download "$CTAN/texgyreschola-${style}.otf" "$FONTS_DIR/texgyreschola-${style}.otf"
done

echo ""
echo "=== Download and instancing complete ==="
echo "Fonts directory: $FONTS_DIR"
find "$FONTS_DIR" -maxdepth 1 \( -name "*.ttf" -o -name "*.otf" \) | wc -l | xargs -I{} echo "Total font files: {}"
