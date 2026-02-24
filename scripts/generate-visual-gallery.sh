#!/bin/bash
# Generate side-by-side visual gallery: Reference | Rendered | Absolute Diff
#
# The diff panel is a per-pixel absolute difference: |ref - rendered| per channel.
# Dark = identical, bright = large difference. Amplified 4x so subtle differences
# are visible but still proportional to actual error magnitude.
#
# Output: visual-diffs/ folder with one composite per slide, sorted by RMSE

set -euo pipefail

PROJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMP_DIR="$PROJ_ROOT/../pptx-pdf-comparisons/comparison-output"
OUT_DIR="$PROJ_ROOT/visual-diffs"

RENDERED="$COMP_DIR/rendered"
REFERENCE="$COMP_DIR/reference"
REPORT="$COMP_DIR/rmse-report.json"

# Amplification factor — how much to boost the difference.
# 1 = raw abs diff (very dark, hard to see). 4 = good balance.
# 8 = very aggressive, small diffs become visible but large diffs clip to white.
AMP=4

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Parse RMSE from JSON report and sort by RMSE descending
SORTED=$(python3 -c "
import json, sys
with open('$REPORT') as f:
    data = json.load(f)
pairs = [(r['slide'], r['rmse'] or 0) for r in data['results']]
pairs.sort(key=lambda x: -x[1])
for s, r in pairs:
    print(f'{s} {r:.4f}')
")

RANK=1
TOTAL=$(echo "$SORTED" | wc -l | tr -d ' ')

echo "Generating $TOTAL side-by-side composites (worst RMSE first)..."
echo "Diff mode: per-pixel absolute difference, ${AMP}x amplified"
echo ""

while IFS=' ' read -r SLIDE RMSE; do
  PADSLIDE=$(printf '%02d' "$SLIDE")
  PADRANK=$(printf '%02d' "$RANK")

  REF_FILE="$REFERENCE/slide-${PADSLIDE}.png"
  REN_FILE="$RENDERED/slide-${PADSLIDE}.png"

  OUT_FILE="$OUT_DIR/${PADRANK}-slide${PADSLIDE}-rmse${RMSE}.png"

  if [[ ! -f "$REF_FILE" || ! -f "$REN_FILE" ]]; then
    echo "  SKIP slide $SLIDE (missing files)"
    RANK=$((RANK + 1))
    continue
  fi

  # Get rendered size for consistent resize
  SIZE=$(magick identify -format '%wx%h' "$REN_FILE")

  # Compute absolute per-pixel difference:
  #   1. Resize reference to match rendered dimensions
  #   2. Compose with "difference" = |A - B| per channel per pixel
  #   3. Amplify by ${AMP}x so subtle diffs are visible (clamps at white)
  #   4. Result: black = identical, dim = small diff, bright = big diff
  magick \
    \( "$REF_FILE" -resize "${SIZE}!" \) \
    "$REN_FILE" \
    -compose Difference -composite \
    -evaluate Multiply "$AMP" \
    /tmp/absdiff-${PADSLIDE}.png

  # Assemble 3-panel composite with labels
  magick \
    \( "$REF_FILE" -resize "${SIZE}!" \
       -gravity North -background '#222' -splice 0x30 \
       -font Helvetica -pointsize 18 -fill white \
       -gravity North -annotate +0+6 "Reference (PDF)" \) \
    \( "$REN_FILE" \
       -gravity North -background '#222' -splice 0x30 \
       -font Helvetica -pointsize 18 -fill white \
       -gravity North -annotate +0+6 "Rendered (OpenDocKit)" \) \
    \( /tmp/absdiff-${PADSLIDE}.png \
       -gravity North -background '#222' -splice 0x30 \
       -font Helvetica -pointsize 18 -fill white \
       -gravity North -annotate +0+6 "Abs Diff ${AMP}x (RMSE: ${RMSE})" \) \
    +append \
    -gravity South -background '#333' -splice 0x28 \
    -font Helvetica -pointsize 16 -fill '#ccc' \
    -gravity South -annotate +0+6 "Slide ${SLIDE} — RMSE: ${RMSE} — Rank ${RANK}/${TOTAL}" \
    "$OUT_FILE"

  rm -f /tmp/absdiff-${PADSLIDE}.png

  printf "  [%2d/%d] Slide %2d  RMSE=%s\r" "$RANK" "$TOTAL" "$SLIDE" "$RMSE"
  RANK=$((RANK + 1))
done <<< "$SORTED"

echo ""
echo ""
echo "Done! $TOTAL composites in: $OUT_DIR"
echo "Files sorted by RMSE (worst first): 01-slideNN = worst, ${TOTAL}-slideNN = best"
echo ""
echo "Diff legend: black = pixel-perfect, dim = subtle, bright = large mismatch"
echo ""
echo "Quick look:"
ls -1 "$OUT_DIR" | head -10
echo "..."
ls -1 "$OUT_DIR" | tail -5
