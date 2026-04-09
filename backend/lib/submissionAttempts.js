function getSubmitAttempts(project) {
  if (!project.submitAttempts || typeof project.submitAttempts !== 'object') {
    project.submitAttempts = {};
  }
  return project.submitAttempts;
}

function findSubmissionByAttemptId(project, attemptId) {
  if (!Array.isArray(project.submissions)) return null;
  return project.submissions.find((submission) => submission.attemptId === attemptId) || null;
}

function beginSubmissionAttempt(project, attemptId, source) {
  const attempts = getSubmitAttempts(project);
  const existingSubmission = findSubmissionByAttemptId(project, attemptId);
  if (existingSubmission) {
    attempts[attemptId] = {
      status: 'completed',
      submissionId: existingSubmission.id,
      source: existingSubmission.source,
      updatedAt: existingSubmission.timestamp,
    };
    return { status: 'completed', submission: existingSubmission };
  }

  const existingAttempt = attempts[attemptId];
  if (existingAttempt?.status === 'completed' && existingAttempt.submissionId) {
    return { status: 'completed', submissionId: existingAttempt.submissionId };
  }
  if (existingAttempt?.status === 'processing') {
    return { status: 'processing' };
  }

  attempts[attemptId] = {
    status: 'processing',
    source,
    updatedAt: new Date().toISOString(),
  };
  return { status: 'started' };
}

function completeSubmissionAttempt(project, attemptId, submission) {
  const attempts = getSubmitAttempts(project);
  attempts[attemptId] = {
    status: 'completed',
    submissionId: submission.id,
    source: submission.source,
    updatedAt: submission.timestamp,
  };
}

function failSubmissionAttempt(project, attemptId) {
  const attempts = getSubmitAttempts(project);
  delete attempts[attemptId];
}

module.exports = {
  beginSubmissionAttempt,
  completeSubmissionAttempt,
  failSubmissionAttempt,
  findSubmissionByAttemptId,
};
