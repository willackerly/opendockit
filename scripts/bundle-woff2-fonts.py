#!/usr/bin/env python3
"""
bundle-woff2-fonts.py — Subset TTF→WOFF2→base64→TypeScript pipeline.

For each font family, subsets to Latin + symbols codepoints, converts to WOFF2,
base64-encodes, and writes a TypeScript module to packages/core/src/font/data/woff2/.

Also generates manifest.ts mapping family names → module paths + substitute info.

Usage:
    python3 scripts/bundle-woff2-fonts.py
"""

import base64
import json
import os
import sys
from io import BytesIO
from pathlib import Path

from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "fonts"
OUTPUT_DIR = ROOT / "packages" / "core" / "src" / "font" / "data" / "woff2"

# Unicode ranges to keep: Latin + symbols (same as metrics extraction)
UNICODE_RANGES = [
    (0x0020, 0x024F),   # Basic Latin through Latin Extended-B
    (0x2000, 0x206F),   # General Punctuation
    (0x20A0, 0x20CF),   # Currency Symbols
    (0x2100, 0x214F),   # Letterlike Symbols
    (0x2190, 0x21FF),   # Arrows
    (0x2200, 0x22FF),   # Mathematical Operators
    (0x2300, 0x23FF),   # Miscellaneous Technical
    (0x25A0, 0x25FF),   # Geometric Shapes
    (0x2600, 0x26FF),   # Miscellaneous Symbols
    (0xFB00, 0xFB06),   # Alphabetic Presentation Forms (ligatures)
    (0xFEFF, 0xFEFF),   # BOM / ZWNBS
    (0xFFFC, 0xFFFD),   # Replacement characters
]

# Build the full set of codepoints
CODEPOINTS = set()
for start, end in UNICODE_RANGES:
    for cp in range(start, end + 1):
        CODEPOINTS.add(cp)


def subset_to_woff2(ttf_path: Path) -> bytes:
    """Subset a TTF file to Latin+symbols and convert to WOFF2."""
    font = TTFont(ttf_path)

    options = Options()
    options.flavor = "woff2"
    options.desubroutinize = True
    # Drop tables we don't need for rendering
    options.drop_tables += ["DSIG", "GPOS", "GSUB", "GDEF", "kern"]
    options.no_subset_tables += ["OS/2"]

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=CODEPOINTS)
    subsetter.subset(font)

    buf = BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return buf.getvalue()


# Font family definitions: module_name → { register_as, substitute_for, variants }
FONT_FAMILIES = {
    # Office core font substitutes
    "carlito": {
        "register_as": "Carlito",
        "substitute_for": "Calibri",
        "variants": {
            "regular": "Carlito-Regular.ttf",
            "bold": "Carlito-Bold.ttf",
            "italic": "Carlito-Italic.ttf",
            "boldItalic": "Carlito-BoldItalic.ttf",
        },
    },
    "calibri-light": {
        "register_as": "Calibri Light",
        "substitute_for": "Calibri Light",
        "variants": {
            "regular": "Carlito-Regular.ttf",
        },
    },
    "caladea": {
        "register_as": "Caladea",
        "substitute_for": "Cambria",
        "variants": {
            "regular": "Caladea-Regular.ttf",
            "bold": "Caladea-Bold.ttf",
            "italic": "Caladea-Italic.ttf",
            "boldItalic": "Caladea-BoldItalic.ttf",
        },
    },
    "liberation-sans": {
        "register_as": "Liberation Sans",
        "substitute_for": "Arial",
        "variants": {
            "regular": "LiberationSans-Regular.ttf",
            "bold": "LiberationSans-Bold.ttf",
            "italic": "LiberationSans-Italic.ttf",
            "boldItalic": "LiberationSans-BoldItalic.ttf",
        },
    },
    "liberation-serif": {
        "register_as": "Liberation Serif",
        "substitute_for": "Times New Roman",
        "variants": {
            "regular": "LiberationSerif-Regular.ttf",
            "bold": "LiberationSerif-Bold.ttf",
            "italic": "LiberationSerif-Italic.ttf",
            "boldItalic": "LiberationSerif-BoldItalic.ttf",
        },
    },
    "liberation-mono": {
        "register_as": "Liberation Mono",
        "substitute_for": "Courier New",
        "variants": {
            "regular": "LiberationMono-Regular.ttf",
            "bold": "LiberationMono-Bold.ttf",
            "italic": "LiberationMono-Italic.ttf",
            "boldItalic": "LiberationMono-BoldItalic.ttf",
        },
    },
    "selawik": {
        "register_as": "Selawik",
        "substitute_for": "Segoe UI",
        "variants": {
            "regular": "Selawik-Regular.ttf",
            "bold": "Selawik-Bold.ttf",
        },
    },
    "selawik-light": {
        "register_as": "Selawik Light",
        "substitute_for": "Segoe UI Light",
        "variants": {
            "regular": "Selawik-Light.ttf",
        },
    },
    "selawik-semibold": {
        "register_as": "Selawik Semibold",
        "substitute_for": "Segoe UI Semibold",
        "variants": {
            "regular": "Selawik-Semibold.ttf",
        },
    },
    "selawik-semilight": {
        "register_as": "Selawik Semilight",
        "substitute_for": "Segoe UI Semilight",
        "variants": {
            "regular": "Selawik-Semilight.ttf",
        },
    },
    "gelasio": {
        "register_as": "Gelasio",
        "substitute_for": "Georgia",
        "variants": {
            "regular": "Gelasio-Regular.ttf",
            "bold": "Gelasio-Bold.ttf",
            "italic": "Gelasio-Italic.ttf",
            "boldItalic": "Gelasio-BoldItalic.ttf",
        },
    },
    # Office serif font substitutes
    "liberation-sans-narrow": {
        "register_as": "Liberation Sans Narrow",
        "substitute_for": "Arial Narrow",
        "variants": {
            "regular": "LiberationSansNarrow-Regular.ttf",
            "bold": "LiberationSansNarrow-Bold.ttf",
            "italic": "LiberationSansNarrow-Italic.ttf",
            "boldItalic": "LiberationSansNarrow-BoldItalic.ttf",
        },
    },
    "tex-gyre-pagella": {
        "register_as": "TeX Gyre Pagella",
        "substitute_for": "Palatino Linotype",
        "variants": {
            "regular": "texgyrepagella-regular.otf",
            "bold": "texgyrepagella-bold.otf",
            "italic": "texgyrepagella-italic.otf",
            "boldItalic": "texgyrepagella-bolditalic.otf",
        },
    },
    "tex-gyre-bonum": {
        "register_as": "TeX Gyre Bonum",
        "substitute_for": "Bookman Old Style",
        "variants": {
            "regular": "texgyrebonum-regular.otf",
            "bold": "texgyrebonum-bold.otf",
            "italic": "texgyrebonum-italic.otf",
            "boldItalic": "texgyrebonum-bolditalic.otf",
        },
    },
    "tex-gyre-schola": {
        "register_as": "TeX Gyre Schola",
        "substitute_for": "Century Schoolbook",
        "variants": {
            "regular": "texgyreschola-regular.otf",
            "bold": "texgyreschola-bold.otf",
            "italic": "texgyreschola-italic.otf",
            "boldItalic": "texgyreschola-bolditalic.otf",
        },
    },
    # Google Fonts families
    "arimo": {
        "register_as": "Arimo",
        "variants": {
            "regular": "Arimo-Regular.ttf",
            "bold": "Arimo-Bold.ttf",
            "italic": "Arimo-Italic.ttf",
            "boldItalic": "Arimo-BoldItalic.ttf",
        },
    },
    "barlow": {
        "register_as": "Barlow",
        "variants": {
            "regular": "Barlow-Regular.ttf",
            "bold": "Barlow-Bold.ttf",
            "italic": "Barlow-Italic.ttf",
            "boldItalic": "Barlow-BoldItalic.ttf",
        },
    },
    "barlow-light": {
        "register_as": "Barlow Light",
        "variants": {
            "regular": "Barlow-Light.ttf",
            "italic": "Barlow-LightItalic.ttf",
        },
    },
    "comfortaa": {
        "register_as": "Comfortaa",
        "variants": {
            "regular": "Comfortaa-Regular.ttf",
            "bold": "Comfortaa-Bold.ttf",
        },
    },
    "courier-prime": {
        "register_as": "Courier Prime",
        "variants": {
            "regular": "CourierPrime-Regular.ttf",
            "bold": "CourierPrime-Bold.ttf",
            "italic": "CourierPrime-Italic.ttf",
            "boldItalic": "CourierPrime-BoldItalic.ttf",
        },
    },
    "fira-code": {
        "register_as": "Fira Code",
        "variants": {
            "regular": "FiraCode-Regular.ttf",
            "bold": "FiraCode-Bold.ttf",
        },
    },
    "lato": {
        "register_as": "Lato",
        "variants": {
            "regular": "Lato-Regular.ttf",
            "bold": "Lato-Bold.ttf",
            "italic": "Lato-Italic.ttf",
            "boldItalic": "Lato-BoldItalic.ttf",
        },
    },
    "lato-light": {
        "register_as": "Lato Light",
        "variants": {
            "regular": "Lato-Light.ttf",
            "italic": "Lato-LightItalic.ttf",
        },
    },
    "montserrat": {
        "register_as": "Montserrat",
        "variants": {
            "regular": "Montserrat-Regular.ttf",
            "bold": "Montserrat-Bold.ttf",
            "italic": "Montserrat-Italic.ttf",
            "boldItalic": "Montserrat-BoldItalic.ttf",
        },
    },
    "noto-sans": {
        "register_as": "Noto Sans",
        "variants": {
            "regular": "NotoSans-Regular.ttf",
            "bold": "NotoSans-Bold.ttf",
            "italic": "NotoSans-Italic.ttf",
            "boldItalic": "NotoSans-BoldItalic.ttf",
        },
    },
    "noto-sans-symbols": {
        "register_as": "Noto Sans Symbols",
        "variants": {
            "regular": "NotoSansSymbols-Regular.ttf",
            "bold": "NotoSansSymbols-Bold.ttf",
        },
    },
    "noto-serif": {
        "register_as": "Noto Serif",
        "variants": {
            "regular": "NotoSerif-Regular.ttf",
            "bold": "NotoSerif-Bold.ttf",
            "italic": "NotoSerif-Italic.ttf",
            "boldItalic": "NotoSerif-BoldItalic.ttf",
        },
    },
    "open-sans": {
        "register_as": "Open Sans",
        "variants": {
            "regular": "OpenSans-Regular.ttf",
            "bold": "OpenSans-Bold.ttf",
        },
    },
    "oswald": {
        "register_as": "Oswald",
        "variants": {
            "regular": "Oswald-Regular.ttf",
            "bold": "Oswald-Bold.ttf",
        },
    },
    "play": {
        "register_as": "Play",
        "variants": {
            "regular": "Play-Regular.ttf",
            "bold": "Play-Bold.ttf",
        },
    },
    "playfair-display": {
        "register_as": "Playfair Display",
        "variants": {
            "regular": "PlayfairDisplay-Regular.ttf",
            "bold": "PlayfairDisplay-Bold.ttf",
            "italic": "PlayfairDisplay-Italic.ttf",
            "boldItalic": "PlayfairDisplay-BoldItalic.ttf",
        },
    },
    "poppins": {
        "register_as": "Poppins",
        "variants": {
            "regular": "Poppins-Regular.ttf",
            "bold": "Poppins-Bold.ttf",
            "italic": "Poppins-Italic.ttf",
            "boldItalic": "Poppins-BoldItalic.ttf",
        },
    },
    "raleway": {
        "register_as": "Raleway",
        "variants": {
            "regular": "Raleway-Regular.ttf",
            "bold": "Raleway-Bold.ttf",
            "italic": "Raleway-Italic.ttf",
            "boldItalic": "Raleway-BoldItalic.ttf",
        },
    },
    "roboto": {
        "register_as": "Roboto",
        "variants": {
            "regular": "Roboto-Regular.ttf",
            "bold": "Roboto-Bold.ttf",
            "italic": "Roboto-Italic.ttf",
            "boldItalic": "Roboto-BoldItalic.ttf",
        },
    },
    "roboto-mono": {
        "register_as": "Roboto Mono",
        "variants": {
            "regular": "RobotoMono-Regular.ttf",
            "bold": "RobotoMono-Bold.ttf",
            "italic": "RobotoMono-Italic.ttf",
            "boldItalic": "RobotoMono-BoldItalic.ttf",
        },
    },
    "roboto-slab": {
        "register_as": "Roboto Slab",
        "variants": {
            "regular": "RobotoSlab-Regular.ttf",
            "bold": "RobotoSlab-Bold.ttf",
        },
    },
    "roboto-slab-light": {
        "register_as": "Roboto Slab Light",
        "variants": {
            "regular": "RobotoSlab-Light.ttf",
        },
    },
    "roboto-slab-semibold": {
        "register_as": "Roboto Slab SemiBold",
        "variants": {
            "regular": "RobotoSlab-SemiBold.ttf",
        },
    },
    "source-code-pro": {
        "register_as": "Source Code Pro",
        "variants": {
            "regular": "SourceCodePro-Regular.ttf",
            "bold": "SourceCodePro-Bold.ttf",
            "italic": "SourceCodePro-Italic.ttf",
            "boldItalic": "SourceCodePro-BoldItalic.ttf",
        },
    },
    "source-sans-pro": {
        "register_as": "Source Sans Pro",
        "variants": {
            "regular": "SourceSans3-Regular.ttf",
            "bold": "SourceSans3-Bold.ttf",
            "italic": "SourceSans3-Italic.ttf",
            "boldItalic": "SourceSans3-BoldItalic.ttf",
        },
    },
    "tinos": {
        "register_as": "Tinos",
        "variants": {
            "regular": "Tinos-Regular.ttf",
            "bold": "Tinos-Bold.ttf",
            "italic": "Tinos-Italic.ttf",
            "boldItalic": "Tinos-BoldItalic.ttf",
        },
    },
    "ubuntu": {
        "register_as": "Ubuntu",
        "variants": {
            "regular": "Ubuntu-Regular.ttf",
            "bold": "Ubuntu-Bold.ttf",
            "italic": "Ubuntu-Italic.ttf",
            "boldItalic": "Ubuntu-BoldItalic.ttf",
        },
    },
}


def generate_family_module(module_name: str, family_def: dict) -> str:
    """Generate TypeScript module content for a font family."""
    lines = [
        f"// Auto-generated by scripts/bundle-woff2-fonts.py — {family_def['register_as']}",
        "// prettier-ignore",
    ]

    for variant_name, ttf_filename in family_def["variants"].items():
        ttf_path = FONTS_DIR / ttf_filename
        if not ttf_path.exists():
            print(f"  WARN: {ttf_path} not found, skipping {variant_name}")
            continue

        woff2_data = subset_to_woff2(ttf_path)
        b64 = base64.b64encode(woff2_data).decode("ascii")
        size_kb = len(woff2_data) / 1024

        print(f"  {variant_name}: {ttf_filename} → {size_kb:.1f} KB WOFF2, {len(b64)} chars base64")
        lines.append(f"export const {variant_name} = '{b64}';")

    return "\n".join(lines) + "\n"


def generate_manifest() -> str:
    """Generate manifest.ts with family→module mapping."""
    lines = [
        "// Auto-generated by scripts/bundle-woff2-fonts.py",
        "",
        "export interface BundledFontEntry {",
        "  /** Module path relative to this directory (without extension). */",
        "  module: string;",
        "  /** Font family name to register under. */",
        "  registerAs: string;",
        "  /** If this is a substitute for an Office font, the original name. */",
        "  substituteFor?: string;",
        "  /** Available variant names (keys exported from the module). */",
        "  variants: string[];",
        "}",
        "",
        "/** All bundled font families, keyed by lowercase family name. */",
        "export const BUNDLED_FONTS: Record<string, BundledFontEntry> = {",
    ]

    for module_name, family_def in sorted(FONT_FAMILIES.items()):
        register_as = family_def["register_as"]
        key = register_as.lower()
        variants = list(family_def["variants"].keys())
        # Only include variants whose TTF actually exists
        existing_variants = [
            v for v in variants if (FONTS_DIR / family_def["variants"][v]).exists()
        ]
        if not existing_variants:
            continue

        sub_for = family_def.get("substitute_for")
        sub_str = f"'{sub_for}'" if sub_for else "undefined"
        variants_str = json.dumps(existing_variants)

        lines.append(f"  '{key}': {{")
        lines.append(f"    module: './{module_name}.js',")
        lines.append(f"    registerAs: '{register_as}',")
        if sub_for:
            lines.append(f"    substituteFor: '{sub_for}',")
        lines.append(f"    variants: {variants_str},")
        lines.append(f"  }},")

    # Add reverse lookup entries for substitute_for names
    for module_name, family_def in sorted(FONT_FAMILIES.items()):
        sub_for = family_def.get("substitute_for")
        if not sub_for:
            continue
        register_as = family_def["register_as"]
        key_sub = sub_for.lower()
        key_orig = register_as.lower()
        # Skip if substitute name matches register name (already emitted above)
        if key_sub == key_orig:
            continue
        variants = list(family_def["variants"].keys())
        existing_variants = [
            v for v in variants if (FONTS_DIR / family_def["variants"][v]).exists()
        ]
        if not existing_variants:
            continue
        variants_str = json.dumps(existing_variants)

        lines.append(f"  '{key_sub}': {{")
        lines.append(f"    module: './{module_name}.js',")
        lines.append(f"    registerAs: '{sub_for}',")
        lines.append(f"    substituteFor: '{sub_for}',")
        lines.append(f"    variants: {variants_str},")
        lines.append(f"  }},")

    lines.append("};")
    lines.append("")

    return "\n".join(lines) + "\n"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total_bytes = 0
    total_modules = 0

    for module_name, family_def in sorted(FONT_FAMILIES.items()):
        register_as = family_def["register_as"]
        print(f"\n{register_as} → {module_name}.ts")

        ts_content = generate_family_module(module_name, family_def)
        output_path = OUTPUT_DIR / f"{module_name}.ts"
        output_path.write_text(ts_content, encoding="utf-8")

        size = output_path.stat().st_size
        total_bytes += size
        total_modules += 1
        print(f"  → {output_path.name}: {size / 1024:.1f} KB")

    # Generate manifest
    manifest_content = generate_manifest()
    manifest_path = OUTPUT_DIR / "manifest.ts"
    manifest_path.write_text(manifest_content, encoding="utf-8")
    print(f"\nManifest: {manifest_path.name}")

    print(f"\n=== WOFF2 bundling complete ===")
    print(f"  Modules: {total_modules}")
    print(f"  Total size: {total_bytes / 1024 / 1024:.1f} MB")
    print(f"  Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
