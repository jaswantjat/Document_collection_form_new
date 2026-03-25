#!/usr/bin/env python3
"""
Example usage of the Poder de Representació stamping script.
"""

from stamp_poder_representacio import stamp_text

# Example 1: Person física (individual)
print("Example 1: Stamp individual person data...")
stamp_text(
    image_path='app/public/poder-representacio.png',
    output_path='output_individual.png',
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
    signature_path=None  # Add path to signature image if available
)

# Example 2: Persona jurídica (company)
print("\nExample 2: Stamp company data...")
stamp_text(
    image_path='app/public/poder-representacio.png',
    output_path='output_company.png',
    data={
        'person_interestada': {
            'nom_i_cognoms': 'Martínez, María',
            'nif': '87654321B',
            'adreca': 'Avinguda Diagonal, 456',
            'codi_postal': '08002',
            'municipi': 'Barcelona'
        },
        'representant_legal': {
            'nom_i_cognoms': 'Energia Solar S.L.',
            'nif': 'B12345678',
            'adreca': 'Passeig de Gràcia, 78',
            'codi_postal': '08008',
            'municipi': 'Barcelona'
        },
        'footer': {
            'lloc': 'Barcelona'
        }
    },
    signature_path=None
)

print("\n✅ Examples complete! Check output_individual.png and output_company.png")
