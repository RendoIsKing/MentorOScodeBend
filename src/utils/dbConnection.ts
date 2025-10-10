import { connect, connection } from "mongoose";

export const connectDatabase = async (): Promise<void> => {
    if (connection.readyState !== 0) {
        return;
    }
    const raw = (process.env.DB_URL || process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL) as string | undefined;
    const uri = (raw || '').trim();
    const source = process.env.DB_URL ? 'DB_URL' : (process.env.MONGO_URI ? 'MONGO_URI' : (process.env.MONGODB_URI ? 'MONGODB_URI' : (process.env.DATABASE_URL ? 'DATABASE_URL' : 'none')));
    if (!uri) {
        throw new Error("DB_URL (or MONGO_URI/MONGODB_URI/DATABASE_URL) is not set. Add it to backend/.env or Railway Variables");
    }
    console.log(`[DB] Connecting using ${source}`);
    await connect(uri);
    console.log(`Database connected Successfully`);
};
