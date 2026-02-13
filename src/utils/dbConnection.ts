/**
 * Legacy database connection module.
 *
 * The application now uses Supabase (PostgreSQL) via `src/lib/supabase.ts`.
 * This file is kept as a no-op for any code that still imports it during
 * the transition period.
 *
 * To connect to MongoDB for the data migration script, use:
 *   import { connect } from "mongoose";
 *   await connect(process.env.MONGO_URI);
 */

export const connectDatabase = async (): Promise<void> => {
  console.log("[DB] Using Supabase (PostgreSQL). Mongoose connection skipped.");
};
