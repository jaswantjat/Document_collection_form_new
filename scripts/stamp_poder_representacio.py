#!/usr/bin/env python3
"""
Stamp text onto Poder de Representació document.
Usage: python stamp_poder_representacio.py --input poder-representacio.png --output output.png
"""

import argparse
from PIL import Image, ImageDraw, ImageFont
import os

# Coordinates from RepresentationSection.tsx (as percentages)
# Format: (left%, top%, right% for width limiting)
COORDINATES = {
    'person_interestada': {
        'nom_i_cognoms': (30.3, 14.5, 32.0),    # left=30.3%, top=14.5%, right=32%
        'nif': (68.6, 14.5, 2.0),              # left=68.6%, top=14.5%, right=2%
        'adreca': (14.4, 16.6, 32.0),          # left=14.4%, top=16.6%, right=32%
        'codi_postal': (77.8, 16.6, 2.0),      # left=77.8%, top=16.6%, right=2%
        'municipi': (15.3, 18.7, 32.0),        # left=15.3%, top=18.7%, right=32%
    },
    'representant_legal': {
        'nom_i_cognoms': (30.3, 25.3, 32.0),   # left=30.3%, top=25.3%, right=32%
        'nif': (68.6, 25.3, 2.0),              # left=68.6%, top=25.3%, right=2%
        'adreca': (14.4, 27.4, 32.0),          # left=14.4%, top=27.4%, right=32%
        'codi_postal': (77.8, 27.4, 2.0),      # left=77.8%, top=27.4%, right=2%
        'municipi': (15.3, 29.5, 32.0),        # left=15.3%, top=29.5%, right=32%
    },
    'footer': {
        'lloc': (9.6, 83.8, 55.0),             # left=9.6%, top=83.8%, right=55%
        'signature': (6.0, 87.1, 51.7, 4.9),   # left=6%, top=87.1%, width=51.7%, height=4.9% (for image)
    }
}

# Text styling
FONT_COLOR = (30, 64, 175)  # blue-800 equivalent (#1e40af)
FONT_SIZE_BASE = 24  # Base font size, will be scaled relative to image width


def load_font(image_width, font_size=FONT_SIZE_BASE):
    """Load a font, scaling size based on image width."""
    scale_factor = image_width / 1000  # Normalize to 1000px width
    scaled_size = int(font_size * scale_factor)

    # Try to load a nice font, fallback to default
    font_paths = [
        '/System/Library/Fonts/Helvetica.ttc',  # macOS
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  # Linux
        'C:\\Windows\\Fonts\\arialbd.ttf',  # Windows
    ]

    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, scaled_size)
            except:
                pass

    # Fallback to default
    return ImageFont.load_default()


def stamp_text(image_path, output_path, data, signature_path=None):
    """
    Stamp text onto the Poder de Representació document.

    Args:
        image_path: Path to input image
        output_path: Path to save output image
        data: Dictionary with person_interestada and/or representant_legal data
        signature_path: Optional path to signature image
    """
    # Load image
    img = Image.open(image_path).convert('RGB')
    draw = ImageDraw.Draw(img)
    width, height = img.size

    # Load font
    font = load_font(width)

    # Stamp person interessada data
    if 'person_interestada' in data:
        person_data = data['person_interestada']
        coords = COORDINATES['person_interestada']

        if 'nom_i_cognoms' in person_data:
            x = int(coords['nom_i_cognoms'][0] * width / 100)
            y = int(coords['nom_i_cognoms'][1] * height / 100)
            draw.text((x, y), person_data['nom_i_cognoms'], fill=FONT_COLOR, font=font)

        if 'nif' in person_data:
            x = int(coords['nif'][0] * width / 100)
            y = int(coords['nif'][1] * height / 100)
            draw.text((x, y), person_data['nif'], fill=FONT_COLOR, font=font)

        if 'adreca' in person_data:
            x = int(coords['adreca'][0] * width / 100)
            y = int(coords['adreca'][1] * height / 100)
            draw.text((x, y), person_data['adreca'], fill=FONT_COLOR, font=font)

        if 'codi_postal' in person_data:
            x = int(coords['codi_postal'][0] * width / 100)
            y = int(coords['codi_postal'][1] * height / 100)
            draw.text((x, y), person_data['codi_postal'], fill=FONT_COLOR, font=font)

        if 'municipi' in person_data:
            x = int(coords['municipi'][0] * width / 100)
            y = int(coords['municipi'][1] * height / 100)
            draw.text((x, y), person_data['municipi'], fill=FONT_COLOR, font=font)

    # Stamp representant legal data
    if 'representant_legal' in data:
        rep_data = data['representant_legal']
        coords = COORDINATES['representant_legal']

        if 'nom_i_cognoms' in rep_data:
            x = int(coords['nom_i_cognoms'][0] * width / 100)
            y = int(coords['nom_i_cognoms'][1] * height / 100)
            draw.text((x, y), rep_data['nom_i_cognoms'], fill=FONT_COLOR, font=font)

        if 'nif' in rep_data:
            x = int(coords['nif'][0] * width / 100)
            y = int(coords['nif'][1] * height / 100)
            draw.text((x, y), rep_data['nif'], fill=FONT_COLOR, font=font)

        if 'adreca' in rep_data:
            x = int(coords['adreca'][0] * width / 100)
            y = int(coords['adreca'][1] * height / 100)
            draw.text((x, y), rep_data['adreca'], fill=FONT_COLOR, font=font)

        if 'codi_postal' in rep_data:
            x = int(coords['codi_postal'][0] * width / 100)
            y = int(coords['codi_postal'][1] * height / 100)
            draw.text((x, y), rep_data['codi_postal'], fill=FONT_COLOR, font=font)

        if 'municipi' in rep_data:
            x = int(coords['municipi'][0] * width / 100)
            y = int(coords['municipi'][1] * height / 100)
            draw.text((x, y), rep_data['municipi'], fill=FONT_COLOR, font=font)

    # Stamp footer data
    if 'footer' in data:
        footer_data = data['footer']

        if 'lloc' in footer_data:
            coords = COORDINATES['footer']['lloc']
            x = int(coords[0] * width / 100)
            y = int(coords[1] * height / 100)
            draw.text((x, y), footer_data['lloc'], fill=FONT_COLOR, font=font)

    # Stamp signature image if provided
    if signature_path and os.path.exists(signature_path):
        sig_img = Image.open(signature_path).convert('RGBA')
        coords = COORDINATES['footer']['signature']
        sig_x = int(coords[0] * width / 100)
        sig_y = int(coords[1] * height / 100)
        sig_w = int(coords[2] * width / 100)
        sig_h = int(coords[3] * height / 100)

        # Resize signature to fit
        sig_img = sig_img.resize((sig_w, sig_h), Image.Resampling.LANCZOS)

        # Paste signature (with transparency)
        sig_rgba = sig_img
        img.paste(sig_rgba, (sig_x, sig_y), sig_rgba)

    # Save result
    img.save(output_path, 'PNG')
    print(f"✅ Saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Stamp text onto Poder de Representació document')
    parser.add_argument('--input', required=True, help='Input image path')
    parser.add_argument('--output', required=True, help='Output image path')
    parser.add_argument('--nom', help='Nom i cognoms')
    parser.add_argument('--nif', help='NIF')
    parser.add_argument('--adreca', help='Adreça')
    parser.add_argument('--cp', help='Codi Postal')
    parser.add_argument('--municipi', help='Municipi')
    parser.add_argument('--lloc', help='Lloc (for footer)')
    parser.add_argument('--signature', help='Path to signature image')
    parser.add_argument('--is-company', action='store_true', help='Fill representant legal section instead')

    args = parser.parse_args()

    # Build data dictionary
    data = {}

    if args.is_company:
        data['representant_legal'] = {}
        target = data['representant_legal']
    else:
        data['person_interestada'] = {}
        target = data['person_interestada']

    if args.nom:
        target['nom_i_cognoms'] = args.nom
    if args.nif:
        target['nif'] = args.nif
    if args.adreca:
        target['adreca'] = args.adreca
    if args.cp:
        target['codi_postal'] = args.cp
    if args.municipi:
        target['municipi'] = args.municipi

    if args.lloc:
        data['footer'] = {'lloc': args.lloc}

    # Stamp the document
    stamp_text(args.input, args.output, data, args.signature)


if __name__ == '__main__':
    main()
