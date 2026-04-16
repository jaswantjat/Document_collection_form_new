import approvedAssessorsRaw from '@/shared/approvedAssessors.json?raw';

const approvedAssessors = JSON.parse(approvedAssessorsRaw) as string[];

export { approvedAssessors };

export function isApprovedAssessor(value: string | null | undefined): boolean {
  if (!value) return false;
  return approvedAssessors.includes(value);
}
