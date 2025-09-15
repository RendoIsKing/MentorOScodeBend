require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
try { console.log('[BOOT:index] .env path =', require('path').resolve(__dirname, '..', '.env'), 'DEV_LOGIN_ENABLED =', process.env.DEV_LOGIN_ENABLED); } catch {}
import { Server } from "./server";
import { connectDatabase } from "./utils/dbConnection";

(async () => {
  try {
    await connectDatabase();
  } catch (err) {
    console.error('Database connection error: ', err);
    process.exit(1);
  }
  const server = new Server(process.env.PORT as String);
  server.start();
})();
