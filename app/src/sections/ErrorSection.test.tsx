import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ErrorSection } from '@/sections/ErrorSection';

describe('ErrorSection', () => {
  it('shows a dashboard CTA instead of a useless retry loop when the project code is missing', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorSection, { error: 'INVALID_CODE' })
    );

    expect(html).toContain('Enlace incompleto');
    expect(html).toContain('Abrir dashboard');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('Reintentar');
  });

  it('keeps the retry action for recoverable network errors', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorSection, { error: 'NETWORK_ERROR' })
    );

    expect(html).toContain('Sin conexión');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('Abrir dashboard');
  });
});
