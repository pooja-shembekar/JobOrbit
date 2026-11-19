import express from 'express';
import { chatWithCareerAssistant } from '../controllers/careerAssistantController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect, authorizeRoles('candidate'));
router.post('/chat', chatWithCareerAssistant);

export default router;
