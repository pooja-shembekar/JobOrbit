import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Protect routes by verifying the JSON Web Token in the Authorization header.
 * Attaches the authenticated user document to req.user (excluding passwordHash).
 */
export const protect = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const bearerToken = /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1];
  const rawCookieToken = (req.headers.cookie || '').split(';').map((entry) => entry.trim())
    .find((entry) => entry.startsWith('joborbit_session='))?.slice('joborbit_session='.length);
  let cookieToken = '';
  try {
    cookieToken = rawCookieToken ? decodeURIComponent(rawCookieToken) : '';
  } catch {
    cookieToken = '';
  }
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.',
    });
  }

  try {
    if (!bearerToken && cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
        .split(',').map((origin) => origin.trim()).filter(Boolean);
      if (!allowedOrigins.includes(req.headers.origin)
        || req.headers['x-requested-with'] !== 'JobOrbit') {
        return res.status(403).json({ success: false, message: 'Request origin is not authorised.' });
      }
    }
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user and ensure user still exists in the database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (cookieToken) {
      res.clearCookie('joborbit_session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
      });
    }
    let message = 'Invalid or expired token.';
    if (error.name === 'TokenExpiredError') {
      message = 'Authentication token has expired. Please log in again.';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Invalid authentication token format.';
    }

    return res.status(401).json({
      success: false,
      message,
    });
  }
};

/**
 * Authorize specific user roles to access protected endpoints.
 * Returns 403 Forbidden if the authenticated user's role does not match.
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required prior to authorization.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: role '${req.user.role}' is not authorized to access this resource.`,
      });
    }

    next();
  };
};
