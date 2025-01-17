import express, { Application } from "express";
import { Request, Response } from "express";
import helmet from "helmet";
import passport from "passport";
import cors from "cors";
import { connectDatabase } from "./utils/dbConnection";
import "reflect-metadata";
//************* */
import fs from "fs";
import path from "path";
//***********8 */

import {
  AuthRoutes,
  UserRoutes,
  ProfileRoutes,
  ModuleRoutes,
  CategoryRoutes,
  DocumentRoutes,
  InterestRoutes,
  SubscriptionPlanRoutes,
  ConnectionRoutes,
  StatsRoutes,
  PaymentRoutes,
  FeatureRoutes,
  CardDetailsRoutes,
  SubscriptionRoutes,
  TransactionRoutes,
  NotificationRoutes,
  SupportRoutes,
  moreActionRoutes,
  userDataRoutes,
} from "./routes";

import { local, jwt } from "./utils/strategies";
import { OnlyAdmins, Auth } from "./app/Middlewares";
import { FileEnum } from "./types/FileEnum";
import PostRoutes from "./routes/post.routes";
import InteractionRoutes from "./routes/interaction.routes";
import { handlePaymentStatusWebhookStripe } from "./app/Controllers/CardDetails/Actions/handlePaymentStatusStripeWebhook";
import downloadRouter from "./routes/download.router";
import { expireDataSetCronJob } from "./utils/scheduledJobs/expireDataSets";

const version = "0.0.1";
//*********** */
// Define the path to the 'public' directory
const publicDir = path.join(__dirname, "../public");
//**********8 */

//*************** */
// Function to create the 'public' directory if it doesn't exist
const createPublicDirectory = () => {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true }); // Create the directory, including parent directories if necessary
    console.log(`'public' directory created at: ${publicDir}`);
  } else {
    console.log(`'public' directory already exists.`);
  }
};
//*************** */

export class Server {
  public app: Application;

  public port: String;

  constructor(port: String) {
    this.app = express();
    this.port = port;

    this.registerPreRoutes();

    this.registerMiddlewares();
    this.initializePassportAndStrategies();
    this.regsiterRoutes();
    expireDataSetCronJob();

    connectDatabase();
    // this.start()
    console.log(port);
    console.log(`HTTP Application server ready to be started at ${this.port}`);
  }

  registerPreRoutes() {
    this.app.post(
      "/api/v1/handlePaymentStripe",
      express.raw({ type: "*/*", limit: "50mb" }),
      handlePaymentStatusWebhookStripe
    );
  }

  registerMiddlewares() {
    this.app.use(express.static(`${process.cwd()}${FileEnum.PUBLICDIR}`));
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ limit: "50mb", extended: true }));
    this.app.use(helmet());
    this.app.use(cors());
  }

  regsiterRoutes() {
    this.app.get("/api", (req: Request, res: Response) => {
      res.status(200).json({ message: `App running on version ${version}` });
    });
    this.app.get("/api/backend", (req: Request, res: Response) => {
      res
        .status(200)
        .json({ message: `App running on version ${version}. api/backend` });
    });
    this.app.use(express.static("public"));
    this.app.use("/api/backend/v1/auth", AuthRoutes);
    this.app.use("/api/backend/v1/profile", Auth, ProfileRoutes);
    this.app.use("/api/backend/v1/user", UserRoutes);
    this.app.use("/api/backend/v1/module", OnlyAdmins, ModuleRoutes);
    this.app.use("/api/backend/v1/category", Auth, CategoryRoutes);
    this.app.use("/api/backend/v1/post", PostRoutes);
    this.app.use("/api/backend/v1/documents", Auth, DocumentRoutes);
    this.app.use("/api/backend/v1/interests", Auth, InterestRoutes);
    this.app.use("/api/backend/v1/interaction", Auth, InteractionRoutes);
    this.app.use("/api/backend/v1/plans", Auth, SubscriptionPlanRoutes);
    this.app.use("/api/backend/v1/user-connections", Auth, ConnectionRoutes);
    this.app.use("/api/backend/v1/payment", Auth, PaymentRoutes);
    this.app.use("/api/backend/v1/stats", StatsRoutes);
    this.app.use("/api/backend/v1/feature", Auth, FeatureRoutes);
    this.app.use("/api/backend/v1/card-details", CardDetailsRoutes);
    this.app.use("/api/backend/v1/subscriptions", Auth, SubscriptionRoutes);
    this.app.use("/api/backend/v1/support", Auth, SupportRoutes);
    this.app.use("/api/backend/v1/transactions", Auth, TransactionRoutes);
    this.app.use("/api/backend/v1/notifications", Auth, NotificationRoutes);
    this.app.use("/api/backend/v1/more-actions", Auth, moreActionRoutes);
    this.app.use("/api/backend/v1/process-data", Auth, userDataRoutes);
    this.app.use("/", downloadRouter);
  }

  initializePassportAndStrategies() {
    this.app.use(passport.initialize());
    passport.use(local);
    passport.use(jwt);
  }

  start() {
    const http = require("http").createServer(this.app);
    // *********
    createPublicDirectory();
    // *********
    http.listen(this.port, () => {
      console.log(`:rocket: HTTP Server started at port ${this.port}`);
    });

    // http.listen(3001, () => {
    //   console.log(`:rocket: HTTP Server started at port 3001`);
    // });
  }
}
