#!/bin/bash
# Generate side-by-side visual gallery: Reference | Rendered | Absolute Diff
#
# Handles both PPTX comparison output and PDF comparison output.
# Run after visual-compare.mjs (PPTX) or visual-compare-pdf.mjs (PDF).
#
# The diff panel is a per-pixel absolute difference: |ref - rendered| per channel.
# Dark = identical, bright = large difference. Amplified 4x so subtle differences
# are visible but still proportional to actual error magnitude.
#
# Output:
#   visual-diffs/       PPTX composites (one per slide, sorted by RMSE)
#   visual-diffs-pdf/   PDF composites (one per page, sorted by RMSE)

set -euo pipefail

PROJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Amplification factor — how much to boost the difference.
# 1 = raw abs diff (very dark, hard to see). 4 = good balance.
# 8 = very aggressive, small diffs visible but large diffs clip to white.
AMP=4

# ---------------------------------------------------------------------------
# Helper: generate composites for one comparison directory
# ---------------------------------------------------------------------------

generate_gallery() {
  local COMP_DIR="$1"
  local OUT_DIR="$2"
  local LABEL_REF="$3"
  local LABEL_TEST="$4"
  local REPORT_TYPE="$5"  # "pptx" or "pdf"

  local RENDERED="$COMP_DIR/rendered"
  local REFERENCE="$COMP_DIR/reference"
  local REPORT="$COMP_DIR/rmse-report.json"

  if [[ ! -f "$REPORT" ]]; then
    echo "  No report found at $REPORT — skipping."
    return
  fi
  if [[ ! -d "$RENDERED" || ! -d "$REFERENCE" ]]; then
    echo "  Missing rendered/ or reference/ in $COMP_DIR — skipping."
    return
  fi

  rm -rf "$OUT_DIR"
  mkdir -p "$OUT_DIR"

  # Parse RMSE from JSON report and sort by RMSE descending
  local SORTED
  if [[ "$REPORT_TYPE" == "pptx" ]]; then
    # PPTX report format: { results: [{ slide, rmse }] }
    SORTED=$(python3 -c "
import json
with open('$REPORT') as f:
    data = json.load(f)
pairs = [(str(r['slide']).zfill(2), r['rmse'] or 0) for r in data['results']]
pairs.sort(key=lambda x: -x[1])
for s, r in pairs:
    print(f'slide-{s}.png {r:.4f}')
")
  else
    # PDF report format: { files: [{ id, pages: [{ pageNum, rmse }] }] }
    SORTED=$(python3 -c "
import json
with open('$REPORT') as f:
    data = json.load(f)
pairs = []
for f in data.get('files', []):
    fid = f['id']
    for p in f.get('pages', []):
        num = str(p['pageNum']).zfill(2)
        rmse = p.get('rmse') or 0
        pairs.append((f'{fid}-page{num}.png', rmse))
pairs.sort(key=lambda x: -x[1])
for name, r in pairs:
    print(f'{name} {r:.4f}')
")
  fi

  local RANK=1
  local TOTAL
  TOTAL=$(echo "$SORTED" | grep -c '.' || echo 0)

  echo "Generating $TOTAL side-by-side composites (worst RMSE first)..."
  echo "Output: $OUT_DIR"
  echo "Diff mode: per-pixel absolute difference, ${AMP}x amplified"
  echo ""

  local TMPID=$$

  while IFS=' ' read -r FILENAME RMSE; do
    [[ -z "$FILENAME" ]] && continue

    local PADRANK
    PADRANK=$(printf '%02d' "$RANK")
    local STEM="${FILENAME%.png}"

    local REF_FILE="$REFERENCE/$FILENAME"
    local REN_FILE="$RENDERED/$FILENAME"
    local OUT_FILE="$OUT_DIR/${PADRANK}-${STEM}-rmse${RMSE}.png"
    local ABSDIFF_TMP="/tmp/absdiff-${TMPID}-${RANK}.png"

    if [[ ! -f "$REF_FILE" || ! -f "$REN_FILE" ]]; then
      echo "  SKIP $FILENAME (missing ref or rendered file)"
      RANK=$((RANK + 1))
      continue
    fi

    # Get rendered size for consistent resize
    local SIZE
    SIZE=$(magick identify -format '%wx%h' "$REN_FILE")

    # Compute absolute per-pixel difference:
    #   1. Resize reference to match rendered dimensions
    #   2. Compose with "difference" = |A - B| per channel per pixel
    #   3. Amplify by ${AMP}x so subtle diffs are visible (clamps at white)
    magick \
      \( "$REF_FILE" -resize "${SIZE}!" \) \
      "$REN_FILE" \
      -compose Difference -composite \
      -evaluate Multiply "$AMP" \
      "$ABSDIFF_TMP"

    # Assemble 3-panel composite with labels
    magick \
      \( "$REF_FILE" -resize "${SIZE}!" \
         -gravity North -background '#222' -splice 0x30 \
         -font Helvetica -pointsize 18 -fill white \
         -gravity North -annotate +0+6 "$LABEL_REF" \) \
      \( "$REN_FILE" \
         -gravity North -background '#222' -splice 0x30 \
         -font Helvetica -pointsize 18 -fill white \
         -gravity North -annotate +0+6 "$LABEL_TEST" \) \
      \( "$ABSDIFF_TMP" \
         -gravity North -background '#222' -splice 0x30 \
         -font Helvetica -pointsize 18 -fill white \
         -gravity North -annotate +0+6 "Abs Diff ${AMP}x (RMSE: ${RMSE})" \) \
      +append \
      -gravity South -background '#333' -splice 0x28 \
      -font Helvetica -pointsize 16 -fill '#ccc' \
      -gravity South -annotate +0+6 "${STEM} — RMSE: ${RMSE} — Rank ${RANK}/${TOTAL}" \
      "$OUT_FILE"

    rm -f "$ABSDIFF_TMP"

    printf "  [%2d/%d] %s  RMSE=%s\r" "$RANK" "$TOTAL" "$STEM" "$RMSE"
    RANK=$((RANK + 1))
  done <<< "$SORTED"

  echo ""
  echo ""
  echo "Done! $((RANK - 1)) composites in: $OUT_DIR"
  echo "Files sorted by RMSE (worst first): 01-... = worst"
  echo ""
  echo "Diff legend: black = pixel-perfect, dim = subtle, bright = large mismatch"
  echo ""
}

# ---------------------------------------------------------------------------
# PPTX comparison gallery
# ---------------------------------------------------------------------------

PPTX_COMP_DIR="$PROJ_ROOT/../pptx-pdf-comparisons/comparison-output"
PPTX_OUT_DIR="$PROJ_ROOT/visual-diffs"

if [[ -f "$PPTX_COMP_DIR/rmse-report.json" ]]; then
  echo "=== PPTX Visual Gallery ==="
  generate_gallery \
    "$PPTX_COMP_DIR" \
    "$PPTX_OUT_DIR" \
    "Reference (PDF)" \
    "Rendered (OpenDocKit PPTX)" \
    "pptx"
  if [[ -d "$PPTX_OUT_DIR" ]]; then
    echo "Quick look:"
    ls -1 "$PPTX_OUT_DIR" | head -5
    echo "..."
    ls -1 "$PPTX_OUT_DIR" | tail -3
    echo ""
  fi
else
  echo "=== PPTX Visual Gallery ==="
  echo "  No PPTX comparison output found. Run: node scripts/visual-compare.mjs"
  echo ""
fi

# ---------------------------------------------------------------------------
# PDF comparison gallery
# ---------------------------------------------------------------------------

PDF_COMP_DIR="$PROJ_ROOT/../pptx-pdf-comparisons/pdf-comparison-output"
PDF_OUT_DIR="$PROJ_ROOT/visual-diffs-pdf"

if [[ -f "$PDF_COMP_DIR/rmse-report.json" ]]; then
  echo "=== PDF Visual Gallery ==="
  generate_gallery \
    "$PDF_COMP_DIR" \
    "$PDF_OUT_DIR" \
    "Reference (PDF.js)" \
    "Rendered (NativeRenderer)" \
    "pdf"
  if [[ -d "$PDF_OUT_DIR" ]]; then
    echo "Quick look:"
    ls -1 "$PDF_OUT_DIR" | head -5
    echo "..."
    ls -1 "$PDF_OUT_DIR" | tail -3
    echo ""
  fi
else
  echo "=== PDF Visual Gallery ==="
  echo "  No PDF comparison output found. Run: node scripts/visual-compare-pdf.mjs"
  echo ""
fi
