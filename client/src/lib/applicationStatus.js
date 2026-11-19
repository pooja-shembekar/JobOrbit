/* Mirrors the status transition rules enforced by
   server/src/controllers/applicationController.js (updateApplicationStatus).
   The backend rejects any move that is not listed here, and it never accepts
   "Interview" as a direct status write — that status is only reached through
   the interview-scheduling endpoint. */
export const STATUS_TRANSITIONS = {
  Applied: ['Under Review', 'Shortlisted', 'Rejected'],
  'Under Review': ['Shortlisted', 'Rejected', 'Hired'],
  Shortlisted: ['Rejected', 'Hired'],
  Interview: ['Rejected', 'Hired'],
  Rejected: ['Under Review', 'Shortlisted'],
  Hired: [],
};

// The backend normalizes the legacy "Submitted" status to "Applied" before validating.
export const normalizeStatus = (status) => (status === 'Submitted' ? 'Applied' : status);

// Statuses a recruiter may pick for an application that is currently in `status`.
// The stored status stays listed so the card keeps showing the confirmed value.
export const statusOptionsFor = (status) => {
  const current = status || 'Applied';
  const allowed = STATUS_TRANSITIONS[normalizeStatus(current)] || [];
  return [...new Set([current, ...allowed])];
};
