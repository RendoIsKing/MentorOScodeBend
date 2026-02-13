import express, { Application } from "express";
import { Request, Response } from "express";
import helmet from "helmet";
import compression from "compression";
import passport from "passport";
import cors from "cors";
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
  MentorRoutes,
  CoachNotesRoutes,
  CoachPlansRoutes,
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
import AdminRoutes from "./routes/admin.routes";
import { expireDataSetCronJob } from "./utils/scheduledJobs/expireDataSets";
import session from 'express-session';
import { startSnapshotReconciler } from "./jobs/snapshot.reconciler";
import { initSentry } from './observability/sentry';
import { withRequestId, httpLogger } from './observability/logging';
import healthRouter from './routes/health';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';

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
    console.info(`'public' directory created at: ${publicDir}`);
  } else {
    console.info(`'public' directory already exists.`);
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

    // Log dev login flag at boot for clarity
    try { console.info('[BOOT] DEV_LOGIN_ENABLED =', process.env.DEV_LOGIN_ENABLED); } catch {}

    this.registerPreRoutes();

    this.registerMiddlewares();
    this.initializePassportAndStrategies();
    this.regsiterRoutes();
    if (process.env.NODE_ENV !== 'test') startSnapshotReconciler();
    expireDataSetCronJob();
    // this.start()
    console.info(port);
    console.info(`HTTP Application server ready to be started at ${this.port}`);
  }

  registerPreRoutes() {
    this.app.post(
      "/api/v1/handlePaymentStripe",
      express.raw({ type: "*/*", limit: "50mb" }),
      handlePaymentStatusWebhookStripe
    );
  }

  registerMiddlewares() {
    // Serve static uploads; prefer UPLOAD_ROOT when provided (e.g., Railway volume for persistence)
    const uploadRoot = process.env.UPLOAD_ROOT
      ? path.isAbsolute(process.env.UPLOAD_ROOT)
        ? process.env.UPLOAD_ROOT
        : path.join(process.cwd(), process.env.UPLOAD_ROOT)
      : `${process.cwd()}${FileEnum.PUBLICDIR}`;

    // Handle legacy path-based media URLs by redirecting/serving dynamically
    // e.g. /api/backend/profile-image/<fileName>
    try {
      // Lazy require AWS SDK to avoid hard dependency in local dev
      const Aws = (() => {
        try {
          return {
            S3Client: require("@aws-sdk/client-s3").S3Client,
            GetObjectCommand: require("@aws-sdk/client-s3").GetObjectCommand,
            getSignedUrl: require("@aws-sdk/s3-request-presigner").getSignedUrl,
          };
        } catch {
          return null;
        }
      })();
      this.app.get("/api/backend/profile-image/:name", async (req: any, res: any) => {
        const fileName = String(req.params?.name || "");
        const key = `profile-image/${fileName}`;
        const useS3 = String(process.env.MEDIA_STORAGE || "").toLowerCase() === "s3";
        if (useS3 && Aws) {
          try {
            const region = process.env.S3_REGION || process.env.AWS_REGION || "eu-north-1";
            const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
            const secretAccessKey = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
            const bucket = process.env.S3_BUCKET as string;
            if (bucket && accessKeyId && secretAccessKey) {
              const s3 = new Aws.S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
              const cmd = new Aws.GetObjectCommand({ Bucket: bucket, Key: key });
              const signed = await Aws.getSignedUrl(s3, cmd, { expiresIn: 60 * 10 });
              return res.redirect(302, signed);
            }
          } catch {}
        }
        // Local/persistent disk fallback
        const tryFiles: string[] = [];
        if (uploadRoot) tryFiles.push(path.join(uploadRoot, key));
        tryFiles.push(path.join(process.cwd(), 'public', key));
        tryFiles.push(path.join(__dirname, '../public', key));
        for (const fp of tryFiles) {
          try {
            if (fs.existsSync(fp)) {
              return res.sendFile(fp);
            }
          } catch {}
        }
        // Final fallback: send placeholder to avoid broken UI
        try {
          return res.redirect(302, '/assets/images/Home/small-profile-img.svg');
        } catch {
          return res.status(404).end();
        }
      });
    } catch {}

    if (uploadRoot) {
      try { console.info('[STATIC] uploadRoot =', uploadRoot); } catch {}
      this.app.use("/api/backend", express.static(uploadRoot));
    }
    // Also serve from both CWD/public and dist-relative public to survive different runtimes
    this.app.use(
      "/api/backend",
      express.static(`${process.cwd()}${FileEnum.PUBLICDIR}`)
    );
    this.app.use(
      "/api/backend",
      express.static(path.join(__dirname, "../public"))
    );
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ limit: "50mb", extended: true }));
    // SECURITY: HTTP security headers via Helmet with Content Security Policy
    this.app.use(helmet({
      // Allow assets from api.mentorio.no to be embedded on www.mentorio.no
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          connectSrc: ["'self'", "https:", "wss:"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
    }));
    this.app.use(compression());
    // SECURITY: Prevent HTTP Parameter Pollution attacks
    this.app.use(hpp());
    initSentry(this.app as unknown as import('express').Application);
    this.app.use(withRequestId as any, httpLogger as any);

    // Prefer CORS_ALLOW_ORIGINS; fall back to FRONTEND_ORIGIN for backward compatibility
    const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || process.env.FRONTEND_ORIGIN || 'http://localhost:3002,http://192.168.1.244:3002')
      .split(',')
      .map(s=>s.trim())
      .filter(Boolean);
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
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error('SESSION_SECRET is missing');
    }
    this.app.use(session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: cookieSameSite as any, secure: cookieSecure, maxAge: 1000*60*60*24*30 }
    }));
    if (isProd && process.env.DEV_LOGIN_ENABLED === 'true') {
      console.warn('[WARN] DEV_LOGIN_ENABLED=true in production – dev routes should be disabled');
    }
    // Rate limiting
    // General limiter for backend routes, but skip auth endpoints and streaming
    const generalLimiter = rateLimit({
      windowMs: 60_000,
      max: Number(process.env.RL_GENERAL_MAX || 600),
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        const p = req.path || '';
        // Skip auth endpoints; they have their own dedicated limiter
        if (p.startsWith('/v1/auth')) return true;
        // Skip event streams (long-lived)
        if (p.includes('/events/stream')) return true;
        return false;
      },
    });
    this.app.use('/api/backend', generalLimiter);
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
    // Dedicated limiter for auth POST endpoints only (do NOT count /auth/me or other GETs)
    const authPostLimiter = rateLimit({
      windowMs: 60_000,
      max: Number(process.env.RL_AUTH_LOGIN_MAX || 30),
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method !== 'POST',
    });
    // Apply only to login endpoints; mount limiter before the auth router
    this.app.use("/api/backend/v1/auth/user-login", authPostLimiter);
    this.app.use("/api/backend/v1/auth/google", authPostLimiter);
    // Mount remaining auth routes without limiter so /auth/me isn't rate-limited
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
    this.app.use("/api/backend/v1/mentor", MentorRoutes);
    const devOn = (String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase() === 'true') || (process.env.NODE_ENV !== 'production');
    if (devOn) {
      try { console.info('[DEV] Enabling /api/backend/v1/dev/* routes'); } catch {}
      this.app.use("/api/backend/v1", devLoginRouter);
      this.app.use("/api/backend/v1", devBootstrap);
    } else {
      try { console.info('[DEV] Dev routes disabled'); } catch {}
    }
    // No global Auth here — each route in SubscriptionPlanRoutes handles its own auth.
    // The /plans/public/:mentorId endpoint must be accessible without auth.
    this.app.use("/api/backend/v1/plans", SubscriptionPlanRoutes);
    this.app.use("/api/backend/v1/user-connections", Auth, ConnectionRoutes);
    this.app.use("/api/backend/v1/payment", Auth, PaymentRoutes);
    this.app.use("/api/backend/v1/stats", StatsRoutes);
    // Student routes must be accessible with cookie-based auth inside the route (no bearer required)
    this.app.use("/api/backend/v1/coach-notes", CoachNotesRoutes);
    this.app.use("/api/backend/v1/coach-plans", CoachPlansRoutes);
    this.app.use("/api/backend/v1/student", StudentRoutes);
    this.app.use("/api/backend/v1/student", studentSnapshotRouter);
    // Public features list to allow subscription UI to load without auth
    this.app.use("/api/backend/v1/feature", FeatureRoutes);
    this.app.use("/api/backend/v1/card-details", CardDetailsRoutes);
    this.app.use("/api/backend/v1/subscriptions", Auth, SubscriptionRoutes);
    this.app.use("/api/backend/v1/support", Auth, SupportRoutes);
    this.app.use("/api/backend/v1/transactions", Auth, TransactionRoutes);
    this.app.use("/api/backend/v1/notifications", Auth, NotificationRoutes);
    this.app.use("/api/backend/v1/more-actions", Auth, requireEntitlement as any, moreActionRoutes);
    this.app.use("/api/backend/v1/process-data", Auth, userDataRoutes);
    this.app.use("/api/backend/v1/preonboarding", preonboardingRoutes);
    this.app.use("/api/backend/v1/admin", AdminRoutes);
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
      console.info(`:rocket: HTTP Server started at port ${this.port}`);
    });

    // http.listen(3001, () => {
    // });
  }
}
