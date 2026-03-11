#!/usr/bin/env python3
"""
Generate raw font files for @opendockit/fonts companion package.

Reads TTF sources from fonts/ directory, produces:
- packages/fonts/woff2/{family}/latin-{weight}-{style}.woff2
- packages/fonts/ttf/{family}-{variant}.ttf
- packages/fonts/manifest.json

Usage: python3 scripts/generate-font-package.py
"""

import json
import os
import shutil
import sys
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "fonts"
OUTPUT_DIR = ROOT / "packages" / "fonts"
WOFF2_DIR = OUTPUT_DIR / "woff2"
TTF_DIR = OUTPUT_DIR / "ttf"

# Unicode ranges to keep for WOFF2 subsetting: Latin + symbols
# (same ranges as bundle-woff2-fonts.py)
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

CODEPOINTS = set()
for start, end in UNICODE_RANGES:
    for cp in range(start, end + 1):
        CODEPOINTS.add(cp)

# Variant name → (weight, style) mapping
VARIANT_MAP = {
    "regular": (400, "normal"),
    "bold": (700, "normal"),
    "italic": (400, "italic"),
    "boldItalic": (700, "italic"),
}

# Font family definitions — mirrors bundle-woff2-fonts.py exactly
FONT_FAMILIES = {
    # Office core font substitutes
    "carlito": {
        "register_as": "Carlito",
        "substitute_for": "Calibri",
        "license": "OFL-1.1",
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
        "license": "OFL-1.1",
        "variants": {
            "regular": "Carlito-Regular.ttf",
        },
    },
    "caladea": {
        "register_as": "Caladea",
        "substitute_for": "Cambria",
        "license": "OFL-1.1",
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
        "license": "OFL-1.1",
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
        "license": "OFL-1.1",
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
        "license": "OFL-1.1",
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
        "license": "MIT",
        "variants": {
            "regular": "Selawik-Regular.ttf",
            "bold": "Selawik-Bold.ttf",
        },
    },
    "selawik-light": {
        "register_as": "Selawik Light",
        "substitute_for": "Segoe UI Light",
        "license": "MIT",
        "variants": {
            "regular": "Selawik-Light.ttf",
        },
    },
    "selawik-semibold": {
        "register_as": "Selawik Semibold",
        "substitute_for": "Segoe UI Semibold",
        "license": "MIT",
        "variants": {
            "regular": "Selawik-Semibold.ttf",
        },
    },
    "selawik-semilight": {
        "register_as": "Selawik Semilight",
        "substitute_for": "Segoe UI Semilight",
        "license": "MIT",
        "variants": {
            "regular": "Selawik-Semilight.ttf",
        },
    },
    "gelasio": {
        "register_as": "Gelasio",
        "substitute_for": "Georgia",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Gelasio-Regular.ttf",
            "bold": "Gelasio-Bold.ttf",
            "italic": "Gelasio-Italic.ttf",
            "boldItalic": "Gelasio-BoldItalic.ttf",
        },
    },
    "liberation-sans-narrow": {
        "register_as": "Liberation Sans Narrow",
        "substitute_for": "Arial Narrow",
        "license": "OFL-1.1",
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
        "license": "GUST-Font-License",
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
        "license": "GUST-Font-License",
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
        "license": "GUST-Font-License",
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
        "license": "Apache-2.0",
        "variants": {
            "regular": "Arimo-Regular.ttf",
            "bold": "Arimo-Bold.ttf",
            "italic": "Arimo-Italic.ttf",
            "boldItalic": "Arimo-BoldItalic.ttf",
        },
    },
    "barlow": {
        "register_as": "Barlow",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Barlow-Regular.ttf",
            "bold": "Barlow-Bold.ttf",
            "italic": "Barlow-Italic.ttf",
            "boldItalic": "Barlow-BoldItalic.ttf",
        },
    },
    "barlow-light": {
        "register_as": "Barlow Light",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Barlow-Light.ttf",
            "italic": "Barlow-LightItalic.ttf",
        },
    },
    "barlow-medium": {
        "register_as": "Barlow Medium",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Barlow-Medium.ttf",
        },
    },
    "comfortaa": {
        "register_as": "Comfortaa",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Comfortaa-Regular.ttf",
            "bold": "Comfortaa-Bold.ttf",
        },
    },
    "comfortaa-light": {
        "register_as": "Comfortaa Light",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Comfortaa-Light.ttf",
        },
    },
    "courier-prime": {
        "register_as": "Courier Prime",
        "license": "OFL-1.1",
        "variants": {
            "regular": "CourierPrime-Regular.ttf",
            "bold": "CourierPrime-Bold.ttf",
            "italic": "CourierPrime-Italic.ttf",
            "boldItalic": "CourierPrime-BoldItalic.ttf",
        },
    },
    "fira-code": {
        "register_as": "Fira Code",
        "license": "OFL-1.1",
        "variants": {
            "regular": "FiraCode-Regular.ttf",
            "bold": "FiraCode-Bold.ttf",
        },
    },
    "lato": {
        "register_as": "Lato",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Lato-Regular.ttf",
            "bold": "Lato-Bold.ttf",
            "italic": "Lato-Italic.ttf",
            "boldItalic": "Lato-BoldItalic.ttf",
        },
    },
    "lato-light": {
        "register_as": "Lato Light",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Lato-Light.ttf",
            "italic": "Lato-LightItalic.ttf",
        },
    },
    "montserrat": {
        "register_as": "Montserrat",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Montserrat-Regular.ttf",
            "bold": "Montserrat-Bold.ttf",
            "italic": "Montserrat-Italic.ttf",
            "boldItalic": "Montserrat-BoldItalic.ttf",
        },
    },
    "noto-sans": {
        "register_as": "Noto Sans",
        "license": "OFL-1.1",
        "variants": {
            "regular": "NotoSans-Regular.ttf",
            "bold": "NotoSans-Bold.ttf",
            "italic": "NotoSans-Italic.ttf",
            "boldItalic": "NotoSans-BoldItalic.ttf",
        },
    },
    "noto-sans-symbols": {
        "register_as": "Noto Sans Symbols",
        "license": "OFL-1.1",
        "variants": {
            "regular": "NotoSansSymbols-Regular.ttf",
            "bold": "NotoSansSymbols-Bold.ttf",
        },
    },
    "noto-serif": {
        "register_as": "Noto Serif",
        "license": "OFL-1.1",
        "variants": {
            "regular": "NotoSerif-Regular.ttf",
            "bold": "NotoSerif-Bold.ttf",
            "italic": "NotoSerif-Italic.ttf",
            "boldItalic": "NotoSerif-BoldItalic.ttf",
        },
    },
    "open-sans": {
        "register_as": "Open Sans",
        "license": "OFL-1.1",
        "variants": {
            "regular": "OpenSans-Regular.ttf",
            "bold": "OpenSans-Bold.ttf",
        },
    },
    "open-sans-extrabold": {
        "register_as": "Open Sans ExtraBold",
        "license": "OFL-1.1",
        "variants": {
            "regular": "OpenSans-ExtraBold.ttf",
        },
    },
    "oswald": {
        "register_as": "Oswald",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Oswald-Regular.ttf",
            "bold": "Oswald-Bold.ttf",
        },
    },
    "play": {
        "register_as": "Play",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Play-Regular.ttf",
            "bold": "Play-Bold.ttf",
        },
    },
    "playfair-display": {
        "register_as": "Playfair Display",
        "license": "OFL-1.1",
        "variants": {
            "regular": "PlayfairDisplay-Regular.ttf",
            "bold": "PlayfairDisplay-Bold.ttf",
            "italic": "PlayfairDisplay-Italic.ttf",
            "boldItalic": "PlayfairDisplay-BoldItalic.ttf",
        },
    },
    "poppins": {
        "register_as": "Poppins",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Poppins-Regular.ttf",
            "bold": "Poppins-Bold.ttf",
            "italic": "Poppins-Italic.ttf",
            "boldItalic": "Poppins-BoldItalic.ttf",
        },
    },
    "raleway": {
        "register_as": "Raleway",
        "license": "OFL-1.1",
        "variants": {
            "regular": "Raleway-Regular.ttf",
            "bold": "Raleway-Bold.ttf",
            "italic": "Raleway-Italic.ttf",
            "boldItalic": "Raleway-BoldItalic.ttf",
        },
    },
    "roboto": {
        "register_as": "Roboto",
        "license": "Apache-2.0",
        "variants": {
            "regular": "Roboto-Regular.ttf",
            "bold": "Roboto-Bold.ttf",
            "italic": "Roboto-Italic.ttf",
            "boldItalic": "Roboto-BoldItalic.ttf",
        },
    },
    "roboto-mono": {
        "register_as": "Roboto Mono",
        "license": "Apache-2.0",
        "variants": {
            "regular": "RobotoMono-Regular.ttf",
            "bold": "RobotoMono-Bold.ttf",
            "italic": "RobotoMono-Italic.ttf",
            "boldItalic": "RobotoMono-BoldItalic.ttf",
        },
    },
    "roboto-slab": {
        "register_as": "Roboto Slab",
        "license": "Apache-2.0",
        "variants": {
            "regular": "RobotoSlab-Regular.ttf",
            "bold": "RobotoSlab-Bold.ttf",
        },
    },
    "roboto-slab-light": {
        "register_as": "Roboto Slab Light",
        "license": "Apache-2.0",
        "variants": {
            "regular": "RobotoSlab-Light.ttf",
        },
    },
    "roboto-slab-medium": {
        "register_as": "Roboto Slab Medium",
        "license": "Apache-2.0",
        "variants": {
            "regular": "RobotoSlab-Medium.ttf",
        },
    },
    "roboto-slab-semibold": {
        "register_as": "Roboto Slab SemiBold",
        "license": "Apache-2.0",
        "variants": {
            "regular": "RobotoSlab-SemiBold.ttf",
        },
    },
    "source-code-pro": {
        "register_as": "Source Code Pro",
        "license": "OFL-1.1",
        "variants": {
            "regular": "SourceCodePro-Regular.ttf",
            "bold": "SourceCodePro-Bold.ttf",
            "italic": "SourceCodePro-Italic.ttf",
            "boldItalic": "SourceCodePro-BoldItalic.ttf",
        },
    },
    "source-sans-pro": {
        "register_as": "Source Sans Pro",
        "license": "OFL-1.1",
        "variants": {
            "regular": "SourceSans3-Regular.ttf",
            "bold": "SourceSans3-Bold.ttf",
            "italic": "SourceSans3-Italic.ttf",
            "boldItalic": "SourceSans3-BoldItalic.ttf",
        },
    },
    "tinos": {
        "register_as": "Tinos",
        "license": "Apache-2.0",
        "variants": {
            "regular": "Tinos-Regular.ttf",
            "bold": "Tinos-Bold.ttf",
            "italic": "Tinos-Italic.ttf",
            "boldItalic": "Tinos-BoldItalic.ttf",
        },
    },
    "ubuntu": {
        "register_as": "Ubuntu",
        "license": "Ubuntu-Font-License-1.0",
        "variants": {
            "regular": "Ubuntu-Regular.ttf",
            "bold": "Ubuntu-Bold.ttf",
            "italic": "Ubuntu-Italic.ttf",
            "boldItalic": "Ubuntu-BoldItalic.ttf",
        },
    },
}


def check_dependencies():
    """Verify required Python packages are available."""
    try:
        from fontTools.subset import Subsetter, Options
        from fontTools.ttLib import TTFont
    except ImportError:
        print("ERROR: fontTools not found.")
        print("Install with: pip3 install fonttools brotli")
        sys.exit(1)

    try:
        import brotli  # noqa: F401
    except ImportError:
        print("ERROR: brotli not found (required for WOFF2 compression).")
        print("Install with: pip3 install fonttools brotli")
        sys.exit(1)


def subset_to_woff2(ttf_path):
    """Subset a TTF file to Latin+symbols and convert to WOFF2 bytes."""
    from fontTools.subset import Subsetter, Options
    from fontTools.ttLib import TTFont

    font = TTFont(ttf_path)

    options = Options()
    options.flavor = "woff2"
    options.desubroutinize = True
    options.drop_tables += ["DSIG", "GPOS", "GSUB", "GDEF", "kern"]
    options.no_subset_tables += ["OS/2"]

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=CODEPOINTS)
    subsetter.subset(font)

    buf = BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return buf.getvalue()


def process_family(family_id, family_def):
    """Process one font family: generate WOFF2 + copy TTF files.

    Returns a dict with woff2 and ttf file info for the manifest,
    or None if no variants were processed.
    """
    register_as = family_def["register_as"]
    woff2_info = {}
    ttf_info = {}
    weights = set()
    styles = set()

    for variant_name, ttf_filename in family_def["variants"].items():
        ttf_path = FONTS_DIR / ttf_filename
        if not ttf_path.exists():
            print(f"  WARN: {ttf_path} not found, skipping {variant_name}")
            continue

        weight, style = VARIANT_MAP.get(variant_name, (400, "normal"))
        weights.add(weight)
        styles.add(style)

        # --- WOFF2: subset to latin, write raw binary ---
        try:
            woff2_data = subset_to_woff2(ttf_path)
            woff2_subdir = WOFF2_DIR / family_id
            woff2_subdir.mkdir(parents=True, exist_ok=True)
            woff2_filename = f"latin-{weight}-{style}.woff2"
            woff2_out = woff2_subdir / woff2_filename
            woff2_out.write_bytes(woff2_data)
            woff2_size = len(woff2_data)
            woff2_key = f"latin-{weight}-{style}"
            woff2_info[woff2_key] = {
                "file": f"woff2/{family_id}/{woff2_filename}",
                "size": woff2_size,
            }
            print(f"  WOFF2 {variant_name}: {woff2_size / 1024:.1f} KB → {woff2_out.relative_to(OUTPUT_DIR)}")
        except Exception as e:
            print(f"  WARN: WOFF2 failed for {variant_name} ({ttf_filename}): {e}")

        # --- TTF: copy full file (no subsetting) ---
        try:
            ttf_out_filename = f"{family_id}-{variant_name}.ttf"
            ttf_out = TTF_DIR / ttf_out_filename
            TTF_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ttf_path, ttf_out)
            ttf_size = ttf_out.stat().st_size
            ttf_info[variant_name] = {
                "file": f"ttf/{ttf_out_filename}",
                "size": ttf_size,
            }
            print(f"  TTF  {variant_name}: {ttf_size / 1024:.1f} KB → {ttf_out.relative_to(OUTPUT_DIR)}")
        except Exception as e:
            print(f"  WARN: TTF copy failed for {variant_name} ({ttf_filename}): {e}")

    if not woff2_info and not ttf_info:
        return None

    return {
        "displayName": register_as,
        "substituteFor": family_def.get("substitute_for"),
        "license": family_def.get("license", "Unknown"),
        "woff2": woff2_info,
        "ttf": ttf_info,
        "weights": sorted(weights),
        "styles": sorted(styles),
        "subsets": ["latin"],
    }


def main():
    if not FONTS_DIR.exists():
        print(f"ERROR: fonts/ directory not found at {FONTS_DIR}")
        print("Run 'pnpm fonts:download' first to download font sources.")
        sys.exit(1)

    check_dependencies()

    # Clean previous output
    for subdir in [WOFF2_DIR, TTF_DIR]:
        if subdir.exists():
            shutil.rmtree(subdir)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    WOFF2_DIR.mkdir(parents=True, exist_ok=True)
    TTF_DIR.mkdir(parents=True, exist_ok=True)

    manifest_families = {}
    total_woff2_bytes = 0
    total_ttf_bytes = 0
    families_processed = 0

    for family_id, family_def in sorted(FONT_FAMILIES.items()):
        register_as = family_def["register_as"]
        print(f"\n{register_as} ({family_id})")

        result = process_family(family_id, family_def)
        if result is None:
            print(f"  SKIPPED (no source files found)")
            continue

        families_processed += 1
        manifest_families[family_id] = result

        # Remove None substituteFor from manifest output
        if result["substituteFor"] is None:
            del result["substituteFor"]

        for entry in result["woff2"].values():
            total_woff2_bytes += entry["size"]
        for entry in result["ttf"].values():
            total_ttf_bytes += entry["size"]

    # Write manifest.json
    manifest = {
        "version": 1,
        "families": manifest_families,
    }

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"\n{'=' * 50}")
    print(f"Font package generation complete")
    print(f"{'=' * 50}")
    print(f"  Families: {families_processed}")
    print(f"  WOFF2 total: {total_woff2_bytes / 1024 / 1024:.1f} MB")
    print(f"  TTF total:   {total_ttf_bytes / 1024 / 1024:.1f} MB")
    print(f"  Manifest:    {manifest_path}")
    print(f"  Output:      {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
