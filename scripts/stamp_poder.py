#!/usr/bin/env python3
"""
Stamp text onto Poder de Representación document.
Usage: python stamp_poder.py <input_image> <output_image> <json_data>
"""

import sys
import json
from PIL import Image, ImageDraw, ImageFont

# Coordinates as percentages (from top-left)
COORDS = {
    # Dades de la persona interessada (Top Box)
    "nom_interessat": {"x": 0.32, "y": 0.14},
    "nif_interessat": {"x": 0.73, "y": 0.14},
    "adreca_interessat": {"x": 0.16, "y": 0.17},
    "cp_interessat": {"x": 0.78, "y": 0.17},
    "municipi_interessat": {"x": 0.17, "y": 0.195},

    # Dades del representant legal (Second Box)
    "nom_representant": {"x": 0.32, "y": 0.26},
    "nif_representant": {"x": 0.73, "y": 0.26},
    "adreca_representant": {"x": 0.16, "y": 0.28},
    "cp_representant": {"x": 0.78, "y": 0.28},
    "municipi_representant": {"x": 0.17, "y": 0.305},

    # Footer
    "lloc": {"x": 0.12, "y": 0.84},
    "signatura": {"x": 0.20, "y": 0.92},
}

# Field mapping from API data to coords
FIELD_MAP = {
    "nom_interessat": ["persona_interessada", "nom"],
    "nif_interessat": ["persona_interessada", "nif"],
    "adreca_interessat": ["persona_interessada", "adreca"],
    "cp_interessat": ["persona_interessada", "codi_postal"],
    "municipi_interessat": ["persona_interessada", "municipi"],

    "nom_representant": ["representant_legal", "nom"],
    "nif_representant": ["representant_legal", "nif"],
    "adreca_representant": ["representant_legal", "adreca"],
    "cp_representant": ["representant_legal", "codi_postal"],
    "municipi_representant": ["representant_legal", "municipi"],

    "lloc": ["lloc"],
}


def get_nested_value(data, path):
    """Get value from nested dict using path list."""
    for key in path:
        if isinstance(data, dict) and key in data:
            data = data[key]
        else:
            return None
    return data


def stamp_text(input_path, output_path, data):
    """Stamp text onto the document image."""
    img = Image.open(input_path)
    draw = ImageDraw.Draw(img)
    width, height = img.size

    # Try to use a nice font, fallback to default
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
    except:
        font = ImageFont.load_default()
        font_small = font

    for field_key, coord in COORDS.items():
        value = None
        if field_key in FIELD_MAP:
            value = get_nested_value(data, FIELD_MAP[field_key])

        if not value:
            continue

        x = int(coord["x"] * width)
        y = int(coord["y"] * height)

        # Adjust y slightly for text baseline
        y_offset = -5 if field_key != "signatura" else 0

        # Use smaller font for address fields
        current_font = font_small if "adreca" in field_key else font

        draw.text((x, y + y_offset), str(value), fill="black", font=current_font)

    img.save(output_path)
    print(f"Saved to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python stamp_poder.py <input_image> <output_image> [json_data]")
        print("Or pipe JSON data via stdin")
        sys.exit(1)

    input_img = sys.argv[1]
    output_img = sys.argv[2]

    # Read JSON from file, argv, or stdin
    if len(sys.argv) >= 4:
        data = json.loads(sys.argv[3])
    else:
        data = json.loads(sys.stdin.read())

    stamp_text(input_img, output_img, data)
