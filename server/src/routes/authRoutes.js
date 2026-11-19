import express from 'express';
import {
  register,
  login,
  logout,
  getMe,
  updateMySkills,
} from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public Authentication Endpoints
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected Authentication Endpoints
router.get('/me', protect, getMe);
router.patch('/skills', protect, authorizeRoles('candidate'), updateMySkills);

// Role-protected Verification Endpoints
router.get('/recruiter-check', protect, authorizeRoles('recruiter'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authorized: Recruiter access granted.',
    user: {
      _id: req.user._id,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

router.get('/candidate-check', protect, authorizeRoles('candidate'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authorized: Candidate access granted.',
    user: {
      _id: req.user._id,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

export default router;
