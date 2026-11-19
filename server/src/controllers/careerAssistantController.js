import Application from '../models/Application.js';
import Job from '../models/Job.js';
import { generateCareerResponse } from '../services/careerAssistant.js';

const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 12;
const requestsByUser = new Map();

export const chatWithCareerAssistant = async (req, res, next) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 1200) {
      return res.status(400).json({ success: false, message: 'Enter a message of 1 to 1200 characters.' });
    }

    const userId = req.user._id.toString();
    const now = Date.now();
    for (const [key, entry] of requestsByUser) {
      if (now - entry.startedAt >= RATE_WINDOW_MS) requestsByUser.delete(key);
    }
    const existing = requestsByUser.get(userId);
    if (existing && now - existing.startedAt < RATE_WINDOW_MS && existing.count >= RATE_LIMIT) {
      return res.status(429).json({ success: false, message: 'You have reached the assistant message limit. Please try again in a minute.' });
    }
    requestsByUser.set(userId, existing && now - existing.startedAt < RATE_WINDOW_MS
      ? { ...existing, count: existing.count + 1 }
      : { startedAt: now, count: 1 });

    const [applications, openJobs] = await Promise.all([
      Application.find({ candidate: req.user._id })
        .select('status job')
        .populate('job', 'title company skills')
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean(),
      Job.find({ status: 'open' })
        .select('title company skills')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const result = await generateCareerResponse({
      message,
      candidateSkills: req.user.skills || [],
      applications,
      openJobs,
    });
    if (result.mode === 'error') {
      return res.status(503).json({ success: false, message: result.reply });
    }
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
