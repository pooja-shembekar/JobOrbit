import mongoose from 'mongoose';
import dns from 'node:dns';

// Ensure reliable DNS resolution for MongoDB Atlas SRV records
// Prevents querySrv ECONNREFUSED caused by local router DNS limitations
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (dnsError) {
  // Gracefully fallback to default resolver if custom servers cannot be set
  console.warn('[Database] Note: Using default DNS resolver.');
}

/**
 * Connect to MongoDB database
 * Ensures the database connection is established before the server accepts traffic.
 */
export const connectDB = async () => {
  let uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error(
      'MONGO_URI is missing from server/.env. Please configure your MongoDB Atlas connection string before starting the server.'
    );
  }

  // Defensively strip template angle brackets <...> around password if accidentally preserved
  try {
    const parsed = new URL(uri);
    let pass = decodeURIComponent(parsed.password);
    if (pass.startsWith('<') && pass.endsWith('>')) {
      pass = pass.slice(1, -1);
      parsed.password = encodeURIComponent(pass);
      uri = parsed.toString();
    }
  } catch (parseError) {
    // Proceed with original URI if not standard URL
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`[Database] MongoDB connected successfully: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    const message = String(error?.message || 'Unknown error')
      .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[MongoDB URI redacted]')
      .replace(/\b(username|user|password|passwd|pwd|token|secret|api[_-]?key)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1$2[REDACTED]');
    console.error(`[Database] MongoDB connection failed (${error?.name || 'Error'}): ${message}`);
    throw error;
  }
};
