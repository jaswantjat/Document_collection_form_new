import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { normalizeFormData } from '@/hooks/useFormState';
import { RepresentationSection } from '@/sections/RepresentationSection';

describe('RepresentationSection', () => {
  it('renders the defer action as a boxed secondary CTA with helper copy', () => {
    const formData = normalizeFormData({
      location: 'cataluna',
      representation: {
        location: 'cataluna',
        holderTypeConfirmed: true,
      },
    } as Parameters<typeof normalizeFormData>[0]);

    const html = renderToStaticMarkup(
      createElement(RepresentationSection, {
        formData,
        location: 'cataluna',
        onChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      })
    );

    expect(html).toContain('data-testid="representation-defer-btn"');
    expect(html).toContain('Firmar más tarde');
    expect(html).toContain(
      'Podrás volver a este enlace para firmar cuando te venga bien.'
    );
    expect(html).toContain('rounded-2xl border border-slate-200 bg-white');
  });
});
