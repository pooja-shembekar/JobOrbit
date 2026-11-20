import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import assistantRoutes from './routes/assistantRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const app = express();
const configuredClientUrls = process.env.CLIENT_URL || 'https://job-orbit-fawn.vercel.app';
const configuredClientOrigins = configuredClientUrls.split(',').map((value) => {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('CLIENT_URL must contain valid HTTP(S) frontend origins.');
  }

  if (!['http:', 'https:'].includes(url.protocol)
    || !url.hostname
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash) {
    throw new Error('CLIENT_URL must contain valid HTTP(S) frontend origins.');
  }

  return url.origin;
});
const allowedOrigins = new Set([
  ...configuredClientOrigins,
  'https://job-orbit-fawn.vercel.app',
  'http://localhost:5173',
]);
const corsOptions = {
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const getDbStatusString = (state) => {
  switch (state) {
    case 1: return 'connected';
    case 2: return 'connecting';
    case 3: return 'disconnecting';
    default: return 'disconnected';
  }
};

app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isDbConnected = dbState === 1;

  res.status(isDbConnected ? 200 : 503).json({
    success: isDbConnected,
    message: isDbConnected
      ? 'JobOrbit API and Database are operational'
      : 'JobOrbit API is running, but Database is disconnected',
    status: isDbConnected ? 'healthy' : 'degraded',
    database: {
      status: getDbStatusString(dbState),
      host: isDbConnected ? mongoose.connection.host : null,
      name: isDbConnected ? mongoose.connection.name : null,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/assistant', assistantRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;