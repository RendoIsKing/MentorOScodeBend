import express, { Application } from "express";
import { Request, Response } from "express";
import helmet from "helmet";
import compression from "compression";
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
import { requireEntitlement } from './app/Middlewares/requireEntitlement';
import { FileEnum } from "./types/FileEnum";
import PostRoutes from "./routes/post.routes";
import InteractionRoutes from "./routes/interaction.routes";
import preonboardingRoutes from "./routes/preonboarding";
import legalRoutes from './routes/legal.routes';
import accountRoutes from './routes/account.routes';
import devLoginRouter from "./routes/dev/loginAs";
import devBootstrap from "./routes/dev.bootstrap";
import studentSnapshotRouter from "./routes/student/snapshot";
import { handlePaymentStatusWebhookStripe } from "./app/Controllers/CardDetails/Actions/handlePaymentStatusStripeWebhook";
import downloadRouter from "./routes/download.router";
import chatRoutes from './routes/chat';
import conversationsRoutes from './routes/conversations';
import chatStream from './routes/chat.stream';
import devSeed from './routes/dev.seed';
import { expireDataSetCronJob } from "./utils/scheduledJobs/expireDataSets";
import session from 'express-session';
import { startSnapshotReconciler } from "./jobs/snapshot.reconciler";
import { initSentry } from './observability/sentry';
import { withRequestId, httpLogger } from './observability/logging';
import healthRouter from './routes/health';
import rateLimit from 'express-rate-limit';
import { ensureIndexes } from './utils/ensureIndexes';

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
  // Note: http server handle removed (unused)

  constructor(port: String) {
    this.app = express();
    this.port = port;

    // Ensure database connection established early
    try { void connectDatabase(); } catch {}

    // Log dev login flag at boot for clarity
    try { console.log('[BOOT] DEV_LOGIN_ENABLED =', process.env.DEV_LOGIN_ENABLED); } catch {}

    this.registerPreRoutes();

    this.registerMiddlewares();
    this.initializePassportAndStrategies();
    this.regsiterRoutes();
    // Ensure indexes in background (non-blocking)
    ensureIndexes().catch(()=>{});
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
    // Allow assets to be embedded across subdomains (www.mentorio.no → api.mentorio.no)
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginEmbedderPolicy: false,
    }));
    this.app.use(compression());
    initSentry(this.app as unknown as import('express').Application);
    this.app.use(withRequestId as any, httpLogger as any);

    // Prefer CORS_ALLOW_ORIGINS; fall back to FRONTEND_ORIGIN for backward compatibility
    const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || process.env.FRONTEND_ORIGIN || 'http://localhost:3002,http://192.168.1.244:3002')
      .split(',')
      .map(s=>s.trim())
      .filter(Boolean);
    console.log('[CORS] Allowed origins:', allowedOrigins);
    const devOpenCors = process.env.DEV_LOGIN_ENABLED === 'true' && process.env.NODE_ENV !== 'production';
    if (devOpenCors) {
      // In dev, accept any origin and send credentials for convenience
      this.app.use(cors({ origin: true, credentials: true }));
    } else {
      this.app.use(cors({ origin: (origin, cb)=>{
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('CORS'));
      }, credentials: true }));
    }
    const isProd = process.env.NODE_ENV === 'production';
    const trustProxy = (process.env.TRUST_PROXY || (isProd ? '1' : '0')).trim();
    if (trustProxy === '1' || trustProxy.toLowerCase() === 'true') {
      // Trust proxy for secure cookies on Railway/managed platforms
      this.app.set('trust proxy', 1);
    }
    const sameSiteEnv = String(process.env.SESSION_SAMESITE || '').toLowerCase();
    const cookieSameSite = sameSiteEnv === 'none' ? 'none' : 'lax';
    const secureEnv = String(process.env.SESSION_SECURE || (isProd ? 'true' : 'false')).toLowerCase();
    const cookieSecure = secureEnv === 'true' || secureEnv === '1';
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'dev_session_secret_change_me',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: cookieSameSite as any, secure: cookieSecure, maxAge: 1000*60*60*24*30 }
    }));
    if (isProd && process.env.DEV_LOGIN_ENABLED === 'true') {
      console.warn('[WARN] DEV_LOGIN_ENABLED=true in production – dev routes should be disabled');
    }
    this.app.use('/api/backend/', rateLimit({ windowMs: 60_000, max: 120 }));
  }

  regsiterRoutes() {
    // Lightweight healthcheck for platforms
    this.app.get('/healthz', (_req: Request, res: Response) => res.status(200).json({ ok: true }));
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
    this.app.use('/', legalRoutes);
    this.app.use('/api/backend/v1', accountRoutes);
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
    const devOn = (String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase() === 'true') || (process.env.NODE_ENV !== 'production');
    if (devOn) {
      try { console.log('[DEV] Enabling /api/backend/v1/dev/* routes'); } catch {}
      this.app.use("/api/backend/v1", devLoginRouter);
      this.app.use("/api/backend/v1", devBootstrap);
    } else {
      try { console.log('[DEV] Dev routes disabled'); } catch {}
    }
    this.app.use("/api/backend/v1/plans", Auth, SubscriptionPlanRoutes);
    this.app.use("/api/backend/v1/user-connections", Auth, ConnectionRoutes);
    this.app.use("/api/backend/v1/payment", Auth, PaymentRoutes);
    this.app.use("/api/backend/v1/stats", StatsRoutes);
    // Student routes must be accessible with cookie-based auth inside the route (no bearer required)
    this.app.use("/api/backend/v1/student", StudentRoutes);
    this.app.use("/api/backend/v1/student", studentSnapshotRouter);
    this.app.use("/api/backend/v1/feature", Auth, requireEntitlement as any, FeatureRoutes);
    this.app.use("/api/backend/v1/card-details", CardDetailsRoutes);
    this.app.use("/api/backend/v1/subscriptions", Auth, SubscriptionRoutes);
    this.app.use("/api/backend/v1/support", Auth, SupportRoutes);
    this.app.use("/api/backend/v1/transactions", Auth, TransactionRoutes);
    this.app.use("/api/backend/v1/notifications", Auth, NotificationRoutes);
    this.app.use("/api/backend/v1/more-actions", Auth, requireEntitlement as any, moreActionRoutes);
    this.app.use("/api/backend/v1/process-data", Auth, userDataRoutes);
    this.app.use("/api/backend/v1/preonboarding", preonboardingRoutes);
    this.app.use('/api/backend/v1/chat', chatRoutes);
    this.app.use('/api/backend/v1/chat', conversationsRoutes);
    this.app.use('/api/backend/v1', chatStream);
    this.app.use('/api/backend/v1', devSeed);
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
