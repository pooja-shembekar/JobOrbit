import app from './app.js';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
const PORT = process.env.PORT || 5000;

// Connect to MongoDB before starting HTTP listener
const startServer = async () => {
  try {
    console.log("[Server] Establishing MongoDB connection...");
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`[Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} is already in use. This backend instance did not start.`);
      } else {
        console.error(`[Server] HTTP listener failed (${error.code || 'unknown error'}).`);
      }
      mongoose.disconnect()
        .catch(() => {})
        .finally(() => { process.exitCode = 1; });
    });
  } catch (error) {
    console.error('[Server] Startup failed. Check the configured database and required environment variables.');
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  }
};

startServer().catch(() => {
  console.error('[Server] Unexpected startup error.');
});
