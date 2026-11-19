import express from 'express';
import {
  submitApplication,
  downloadApplicationResume,
  getMyApplications,
  getRecruiterApplications,
  updateApplicationStatus,
  scheduleApplicationInterview,
} from '../controllers/applicationController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { uploadResume } from '../middleware/resumeUpload.js';

const router = express.Router();

// All application routes require authentication
router.use(protect);

/* ── Candidate-only ─────────────────────────────────────── */
router.get(
  '/my-applications',
  authorizeRoles('candidate'),
  getMyApplications
);

router.get(
  '/:id/resume',
  authorizeRoles('candidate', 'recruiter'),
  downloadApplicationResume
);

router.post(
  '/:jobId',
  authorizeRoles('candidate'),
  uploadResume,
  submitApplication
);

/* ── Recruiter-only ─────────────────────────────────────── */
router.get(
  '/recruiter',
  authorizeRoles('recruiter'),
  getRecruiterApplications
);

router.patch(
  '/:id/status',
  authorizeRoles('recruiter'),
  updateApplicationStatus
);

router.patch(
  '/:id/interview',
  authorizeRoles('recruiter'),
  scheduleApplicationInterview
);

export default router;
