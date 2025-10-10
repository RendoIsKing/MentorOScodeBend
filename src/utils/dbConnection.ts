import { connect, connection } from "mongoose";

export const connectDatabase = async (): Promise<void> => {
    if (connection.readyState !== 0) {
        return;
    }
    const uri = (process.env.DB_URL || process.env.MONGO_URI) as string | undefined;
    if (!uri) {
        throw new Error("DB_URL (or MONGO_URI) is not set. Add it to backend/.env or Railway Variables");
    }
    await connect(uri);
    console.log(`Database connected Successfully`);
};
