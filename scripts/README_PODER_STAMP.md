# Poder de Representació - Text Stamping Script

This Python script stamps text onto the "Poder de Representació" document using precise coordinate mappings.

## Installation

```bash
pip install Pillow
```

## Usage

### Command Line

**For individual (person física):**
```bash
python stamp_poder_representacio.py \
  --input app/public/poder-representacio.png \
  --output output.png \
  --nom "García López, Juan" \
  --nif "12345678A" \
  --adreca "Carrer Major, 123" \
  --cp "08001" \
  --municipi "Barcelona" \
  --lloc "Barcelona"
```

**For company (persona jurídica):**
```bash
python stamp_poder_representacio.py \
  --input app/public/poder-representacio.png \
  --output output_company.png \
  --is-company \
  --nom "Energia Solar S.L." \
  --nif "B12345678" \
  --adreca "Passeig de Gràcia, 78" \
  --cp "08008" \
  --municipi "Barcelona"
```

**With signature:**
```bash
python stamp_poder_representacio.py \
  --input app/public/poder-representacio.png \
  --output output.png \
  --nom "García López, Juan" \
  --nif "12345678A" \
  --adreca "Carrer Major, 123" \
  --cp "08001" \
  --municipi "Barcelona" \
  --signature /path/to/signature.png
```

### Python API

```python
from stamp_poder_representacio import stamp_text

stamp_text(
    image_path='app/public/poder-representacio.png',
    output_path='output.png',
    data={
        'person_interestada': {
            'nom_i_cognoms': 'García López, Juan',
            'nif': '12345678A',
            'adreca': 'Carrer Major, 123',
            'codi_postal': '08001',
            'municipi': 'Barcelona'
        },
        'footer': {
            'lloc': 'Barcelona'
        }
    },
    signature_path='path/to/signature.png'  # Optional
)
```

## Coordinate Mapping

Coordinates are expressed as percentages from top-left (0%, 0%) to bottom-right (100%, 100%):

### Dades de la persona interessada
| Field | Left | Top |
|-------|------|-----|
| Nom i cognoms | 30.3% | 14.5% |
| NIF | 68.6% | 14.5% |
| Adreça | 14.4% | 16.6% |
| Codi Postal | 77.8% | 16.6% |
| Municipi | 15.3% | 18.7% |

### Dades del representant legal
| Field | Left | Top |
|-------|------|-----|
| Nom i cognoms | 30.3% | 25.3% |
| NIF | 68.6% | 25.3% |
| Adreça | 14.4% | 27.4% |
| Codi Postal | 77.8% | 27.4% |
| Municipi | 15.3% | 29.5% |

### Footer
| Field | Left | Top |
|-------|------|-----|
| Lloc | 9.6% | 83.8% |
| Signatura | 6.0% | 87.1% |

## Output

The script generates a PNG image with all text stamped in the correct positions using blue color (#1e40af) matching the document style.
