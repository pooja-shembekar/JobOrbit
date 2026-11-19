/**
 * Centralized error handling middleware for JobOrbit backend
 */

// 404 Not Found Handler for unhandled endpoints
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global Error Handler for catching runtime and operational errors
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ success: false, message: err.message });
  }
  if (err.code === 'INVALID_RESUME_TYPE') {
    return res.status(400).json({ success: false, message: err.message });
  }

  // If status code is still 200, default to 500 (Internal Server Error)
  const requestedStatus = err.status || (err.name === 'ValidationError' ? 400 : res.statusCode);
  const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : 500;
  if (statusCode >= 500) {
    console.error('[API] Unexpected request failure.', {
      method: req.method,
      route: req.originalUrl.split('?')[0],
      status: statusCode,
      errorName: err.name || 'Error',
    });
  }

  const message = statusCode < 500
    ? (err.message || 'The request could not be completed.')
    : 'An unexpected server error occurred.';
  return res.status(statusCode).json({
    success: false,
    message,
  });
};
