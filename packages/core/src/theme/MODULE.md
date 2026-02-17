# Module: Theme Engine (`@opendockit/core/theme`)

**Purpose:** Parse theme1.xml into ThemeIR and resolve theme-dependent values (colors, fonts, format styles). Used by every renderer.

**Tier:** Fan-out 1 (depends on XML Parser + IR Types)

**Inputs:** XML from `ppt/theme/theme1.xml` (or `word/theme/`, `xl/theme/` — same schema)

**Outputs:**

- `theme-parser.ts` — `parseTheme(xml: XmlElement): ThemeIR`
- `color-resolver.ts` — `resolveColor(colorElement: XmlElement, theme: ThemeIR, context?: ColorContext): ResolvedColor`
  - Handles all 5 OOXML color types: `a:srgbClr`, `a:schemeClr`, `a:sysClr`, `a:hslClr`, `a:prstClr`
  - Applies child transforms: `lumMod`, `lumOff`, `tint`, `shade`, `alpha`, `satMod`, `satOff`, `hueMod`, `hueOff`
  - All `val` attributes are in 1/1000 of a percent (100000 = 100%)
  - `phClr` (placeholder color) resolved from `ColorContext`
- `font-resolver.ts` — `resolveThemeFont(ref: string, theme: ThemeIR): string`
  - Resolves `+mj-lt` → theme major Latin font, `+mn-lt` → minor Latin, etc.
- `format-resolver.ts` — `resolveFormatStyle(idx: number, theme: ThemeIR): { fill?, line?, effect? }`
  - Resolves style matrix references (e.g., `fillRef idx="1"` → first fill style from theme)
- `index.ts` — barrel export

**Dependencies:**

- `../xml/` — `XmlElement` for parsing
- `../ir/` — `ThemeIR`, `ResolvedColor`, `RgbaColor`, `FillIR`, `LineIR`, `EffectIR`

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Parts 3.3–3.4 (color resolver with full code, theme parser with ThemeIR interface)

**Color scheme key mapping:**

- `dk1` → Dark 1, `lt1` → Light 1, `dk2` → Dark 2, `lt2` → Light 2
- `accent1`–`accent6`, `hlink`, `folHlink`
- `tx1` = `dk1`, `tx2` = `dk2`, `bg1` = `lt1`, `bg2` = `lt2` (aliases)

**Testing:** Parse themes from real PPTX files. Test every color type and transform combination. Test font scheme resolution. Compare resolved colors against known PowerPoint outputs.
