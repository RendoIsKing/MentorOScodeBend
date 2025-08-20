require('dotenv').config();
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
