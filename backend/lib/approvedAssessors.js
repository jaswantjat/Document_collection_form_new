const approvedAssessors = require('../../app/src/shared/approvedAssessors.json');

const approvedAssessorSet = new Set(approvedAssessors);

function isApprovedAssessor(value) {
  if (typeof value !== 'string') return false;
  return approvedAssessorSet.has(value);
}

module.exports = {
  approvedAssessors,
  isApprovedAssessor,
};
