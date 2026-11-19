import express from 'express';
import {
  getPublicJobs,
  getPublicJobById,
  matchCandidateToJob,
  getSavedJobs,
  saveJob,
  removeSavedJob,
  createJob,
  getMyJobs,
  updateJob,
  closeJob,
  deleteJob,
} from '../controllers/jobController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

/* ── Public endpoints (no auth) ─────────────────────────── */
// IMPORTANT: /public and /public/:id must be defined BEFORE the
// router.use(protect) block so they are not caught by the auth guard.
router.get('/public',     getPublicJobs);
router.get('/public/:id', getPublicJobById);

/* ── Recruiter-only endpoints ───────────────────────────── */
router.use(protect);
router.post('/:id/match', authorizeRoles('candidate'), matchCandidateToJob);
router.get('/saved', authorizeRoles('candidate'), getSavedJobs);
router.post('/:id/save', authorizeRoles('candidate'), saveJob);
router.delete('/:id/save', authorizeRoles('candidate'), removeSavedJob);
router.use(authorizeRoles('recruiter'));

router.get('/my-jobs', getMyJobs);
router.post('/',        createJob);
router.put('/:id',      updateJob);
router.patch('/:id/close', closeJob);
router.delete('/:id',   deleteJob);

export default router;
