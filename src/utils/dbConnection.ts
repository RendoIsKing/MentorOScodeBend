import { connect, connection } from "mongoose";

export const connectDatabase = async (): Promise<void> => {
    if (connection.readyState !== 0) {
        return;
    }
    if (!process.env.DB_URL) {
        throw new Error("DB_URL is not set. Add it to backend/.env");
    }
    await connect(process.env.DB_URL as string);
    console.log(`Database connected Successfully`);
};
