import { describe, expect, it } from 'vitest';
import { approvedAssessors, isApprovedAssessor } from '@/lib/approvedAssessors';

describe('approvedAssessors', () => {
  it('matches the exact allowlist approved for dashboard staff project management', () => {
    expect(approvedAssessors).toEqual([
      'Sergi Guillen Cavero',
      'Juán Felipe Murillo Tamayo',
      'Diego Perujo Díaz',
      'Javier Paterna Merino',
      'José Luís Sevilla',
      'Antonio Miguel Sorroche Martínez',
      'Laura Martín Manzano',
      'Adolfo José Perdiguero Molina',
      'Albert Llacha',
      'Koen Hoogteijling',
    ]);
  });

  it('accepts only exact assessor names from the allowlist', () => {
    expect(isApprovedAssessor('Laura Martín Manzano')).toBe(true);
    expect(isApprovedAssessor('laura martín manzano')).toBe(false);
    expect(isApprovedAssessor('QA Bot')).toBe(false);
  });
});
