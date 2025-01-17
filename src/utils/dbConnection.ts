import { connect, connection } from "mongoose";

export const connectDatabase = () => {
    if (connection.readyState == 0) {
        connect(process.env.DB_URL as string)
    .then(() => console.log(`Database connected Successfully`))
            .catch((err) => console.log(`Database connection error: `, err));
    } else {
        return;
    }
};
