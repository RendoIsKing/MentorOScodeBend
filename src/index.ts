import "dotenv/config";
import { Server } from "./server";

const server = new Server(process.env.PORT as String);

server.start();
