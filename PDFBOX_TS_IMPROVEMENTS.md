# pdfbox-ts Improvement Opportunities

Observations from building OpenDocKit's font metrics system that could improve pdfbox-ts.

## 1. Ship Precomputed Font Metrics Bundle

pdfbox-ts currently parses fonts at runtime. It could ship a precomputed metrics bundle (like OpenDocKit's `metrics-bundle.ts`) for the PDF Base 14 fonts + common substitutes. This would enable:

- Instant font width lookup without parsing font files
- Accurate text layout for fonts not embedded in the PDF
- Smaller runtime footprint (skip font parsing for known fonts)

The extraction script at `opendockit/scripts/extract-font-metrics.mjs` could be adapted for pdfbox-ts's needs.

## 2. pdf.js lineHeight/lineGap Pattern

pdf.js extracts `lineHeight` and `lineGap` as separate values per font face:

```
CalibriRegularMetrics = { lineHeight: 1.2207, lineGap: 0.2207 }
```

They compute `firstLineHeight = (lineHeight - lineGap) * fontSize` so the first line sits at exactly 1em below the top of the text box, while subsequent lines use the full `lineHeight`. This is more reliable than raw OS/2 `sTypoAscender + |sTypoDescender|` which varies inconsistently between font vendors.

pdfbox-ts could adopt this pattern for its TextLayout module — computing `lineHeight` from `hhea.ascender + |hhea.descender| + hhea.lineGap` normalized to the em, rather than relying solely on OS/2 values.

## 3. Factor-Based Width Tables (pdf.js Approach)

pdf.js stores per-glyph scale factors: `calibri_width[GID] / liberation_sans_width[GID]`. This lets them approximate any font's widths without shipping the actual width table (which could be seen as derived data from proprietary fonts).

pdfbox-ts could offer a `generateWidthFactors(baseFontPath, targetFontPath)` utility that computes these factors. Users with licensed fonts could generate factors files locally, then ship them with their app — getting accurate width tables without distributing font data.

Key caveat: GID alignment must be done via Unicode codepoint (not raw GID position). pdf.js had a bug where they assumed GID N in LiberationSans = GID N in Calibri. The fix: look up each GID's Unicode codepoint via the cmap, then find the corresponding width in the target font by codepoint.

## 4. CFF Parser: Strip cffData for Metrics-Only Use

The CFF parser currently always extracts the raw CFF table as `cffData: Uint8Array` for FontFile3 embedding. For metrics-only use cases (like OpenDocKit's extraction), this wastes memory on large CFF tables.

Consider adding a `metricsOnly?: boolean` option to `parseCFFFont()` that skips the `cffData` extraction. OpenDocKit's vendored version already strips this field entirely.

## 5. Variable Font Support

The TrueType parser rejects variable fonts (TrueType Collection, `fvar`/`gvar` tables). For metrics extraction, it would be useful to:

- Parse the `fvar` table to enumerate named instances (Regular, Bold, etc.)
- Parse `gvar`/`HVAR` tables to compute width deltas per instance
- Return metrics for a specific named instance

This would enable extracting metrics from Google Fonts' variable font files (e.g., Gelasio, Inter, Roboto) without needing static TTF variants.

## 6. Broader cmap Format Support

Both parsers only handle cmap format 4 (BMP Unicode). Many modern fonts also use:

- **Format 12** (full Unicode) — needed for emoji and supplementary plane characters
- **Format 14** (Unicode Variation Sequences) — needed for CJK variant selectors

Adding format 12 support would enable metrics extraction for fonts with characters beyond U+FFFF.
