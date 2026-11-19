import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const SESSION_COOKIE = 'joborbit_session';

// Helper to generate signed JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const userResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  skills: user.skills,
  createdAt: user.createdAt,
});

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
});

const setSession = (res, user, token = generateToken(user)) => res.cookie(SESSION_COOKIE, token, cookieOptions());
const clearSession = (res) => res.clearCookie(SESSION_COOKIE, cookieOptions());

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Candidate or Recruiter)
 * @access  Public
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'candidate' } = req.body || {};

    // Validate presence of required fields
    if ([name, email, password].some((value) => typeof value !== 'string' || !value.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, email address, and password.',
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedName.length < 2 || normalizedName.length > 60) {
      return res.status(400).json({ success: false, message: 'Name must be between 2 and 60 characters.' });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address (e.g. user@example.com).',
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    if (!['candidate', 'recruiter'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Account role must be either candidate or recruiter.',
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        success: false,
        message: 'Registration is temporarily unavailable because session signing is not configured.',
      });
    }

    // Hash the password securely with bcrypt salt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // The unique email index resolves concurrent registration attempts.
    const user = new User({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role,
    });
    const token = generateToken(user);
    await user.save();
    setSession(res, user, token);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: userResponse(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Sign in or verify the pending account.',
      });
    }
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map((entry) => entry.message).join(' ');
      return res.status(400).json({ success: false, message });
    }
    next(error);
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user credentials & issue JWT
 * @access  Public
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email address and password.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Verify password hash
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    setSession(res, user);
    return res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      user: userResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

export const logout = (req, res) => {
  clearSession(res);
  return res.status(200).json({ success: true, message: 'Signed out.' });
};

/**
 * @route   GET /api/auth/me
 * @desc    Get currently authenticated user profile
 * @access  Private (Requires valid JWT)
 */
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      skills: req.user.skills,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    },
  });
};

export const updateMySkills = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.skills) || req.body.skills.length > 50
      || req.body.skills.some((skill) => typeof skill !== 'string' || skill.trim().length > 50)) {
      return res.status(400).json({
        success: false,
        message: 'Skills must be an array of at most 50 strings, each no longer than 50 characters.',
      });
    }

    req.user.skills = [...new Set(req.body.skills.map((skill) => skill.trim()).filter(Boolean))];
    await req.user.save();
    return res.status(200).json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        skills: req.user.skills,
      },
    });
  } catch (error) {
    next(error);
  }
};
