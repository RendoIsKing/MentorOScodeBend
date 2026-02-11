if (process.env.NODE_ENV !== 'production') {
  try {
    // Load local env only in non-production; prod platforms inject env vars
    require('dotenv').config();
  } catch {}
}
try { console.log('[BOOT:index] DEV_LOGIN_ENABLED =', process.env.DEV_LOGIN_ENABLED); } catch {}
import { Server } from "./server";
import { connectDatabase } from "./utils/dbConnection";

(async () => {
  try {
    await connectDatabase();
  } catch (err) {
    console.error('Database connection error: ', err);
    process.exit(1);
  }
  const server = new Server((process.env.PORT || '3006') as String);
  server.start();

  const shutdown = async (signal: string) => {
    try { console.log(`[SHUTDOWN] Received ${signal}`); } catch {}
    try { await import('mongoose').then(m=>m.connection.close()); } catch {}
    try { process.exit(0); } catch {}
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
console.log("Force redeploy: Hybrid RAG fix active");