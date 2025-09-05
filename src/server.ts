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
  StudentRoutes,
} from "./routes";

import { local, jwt } from "./utils/strategies";
import { OnlyAdmins, Auth } from "./app/Middlewares";
import { FileEnum } from "./types/FileEnum";
import PostRoutes from "./routes/post.routes";
import InteractionRoutes from "./routes/interaction.routes";
import preonboardingRoutes from "./routes/preonboarding";
import devLoginRouter from "./routes/dev/loginAs";
import studentSnapshotRouter from "./routes/student/snapshot";
import { handlePaymentStatusWebhookStripe } from "./app/Controllers/CardDetails/Actions/handlePaymentStatusStripeWebhook";
import downloadRouter from "./routes/download.router";
import { expireDataSetCronJob } from "./utils/scheduledJobs/expireDataSets";
import session from 'express-session';
import { startSnapshotReconciler } from "./jobs/snapshot.reconciler";
import { initSentry } from './observability/sentry';
import { withRequestId, httpLogger } from './observability/logging';
import healthRouter from './routes/health';
import rateLimit from 'express-rate-limit';

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

    // Ensure database connection established early
    try { void connectDatabase(); } catch {}

    this.registerPreRoutes();

    this.registerMiddlewares();
    this.initializePassportAndStrategies();
    this.regsiterRoutes();
    if (process.env.NODE_ENV !== 'test') startSnapshotReconciler();
    expireDataSetCronJob();
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
    this.app.use(
      "/api/backend",
      express.static(`${process.cwd()}${FileEnum.PUBLICDIR}`)
    );
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ limit: "50mb", extended: true }));
    this.app.use(helmet());
    initSentry(this.app as unknown as import('express').Application);
    this.app.use(withRequestId as any, httpLogger as any);

    const ALLOW = (process.env.FRONTEND_ORIGIN || 'http://localhost:3002,http://192.168.1.244:3002').split(',').map(s=>s.trim()).filter(Boolean);
    this.app.use(cors({ origin: (origin, cb)=>(!origin || ALLOW.includes(origin)) ? cb(null,true) : cb(new Error('CORS')), credentials: true }));
    const isProd = process.env.NODE_ENV === 'production';
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'dev_session_secret_change_me',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000*60*60*24*30 }
    }));
    this.app.use('/api/backend/', rateLimit({ windowMs: 60_000, max: 120 }));
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
    this.app.use('/api/backend', healthRouter);
    this.app.use("/api/backend/v1/auth", AuthRoutes);
    this.app.use("/api/backend/v1/profile", Auth, ProfileRoutes);
    this.app.use("/api/backend/v1/user", UserRoutes);
    this.app.use("/api/backend/v1/module", OnlyAdmins, ModuleRoutes);
    this.app.use("/api/backend/v1/category", Auth, CategoryRoutes);
    this.app.use("/api/backend/v1/post", PostRoutes);
    this.app.use("/api/backend/v1/documents", Auth, DocumentRoutes);
    this.app.use("/api/backend/v1/interests", Auth, InterestRoutes);
    // Public for now: Coach Engh chatbot and knowledge endpoints
    this.app.use("/api/backend/v1/interaction", InteractionRoutes);
    this.app.use("/api/backend/v1", devLoginRouter);
    this.app.use("/api/backend/v1/plans", Auth, SubscriptionPlanRoutes);
    this.app.use("/api/backend/v1/user-connections", Auth, ConnectionRoutes);
    this.app.use("/api/backend/v1/payment", Auth, PaymentRoutes);
    this.app.use("/api/backend/v1/stats", StatsRoutes);
    // Student routes must be accessible with cookie-based auth inside the route (no bearer required)
    this.app.use("/api/backend/v1/student", StudentRoutes);
    this.app.use("/api/backend/v1/student", studentSnapshotRouter);
    this.app.use("/api/backend/v1/feature", Auth, FeatureRoutes);
    this.app.use("/api/backend/v1/card-details", CardDetailsRoutes);
    this.app.use("/api/backend/v1/subscriptions", Auth, SubscriptionRoutes);
    this.app.use("/api/backend/v1/support", Auth, SupportRoutes);
    this.app.use("/api/backend/v1/transactions", Auth, TransactionRoutes);
    this.app.use("/api/backend/v1/notifications", Auth, NotificationRoutes);
    this.app.use("/api/backend/v1/more-actions", Auth, moreActionRoutes);
    this.app.use("/api/backend/v1/process-data", Auth, userDataRoutes);
    this.app.use("/api/backend/v1/preonboarding", preonboardingRoutes);
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
