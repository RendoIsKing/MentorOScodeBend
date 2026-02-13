import { Router } from "express";
import { Auth, validateZod } from "../app/Middlewares";
import { StatsController } from "../app/Controllers/Stats";
import { z } from "zod";

const StatsRoutes: Router = Router();
const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

StatsRoutes.get("/followers/:id", Auth, StatsController.getFollowers);
StatsRoutes.get("/following/:id", Auth, StatsController.getFollowing);
StatsRoutes.get("/posts-likes/:id", Auth, StatsController.getPostLikes);
StatsRoutes.post("/user-earning", Auth, validateZod({ body: dateRangeSchema }), StatsController.getEarning);
StatsRoutes.post("/user-chart", Auth, validateZod({ body: dateRangeSchema }), StatsController.getEarningChart);

StatsRoutes.get("/subscribers/:id", StatsController.getSubscribers);
StatsRoutes.get("/coach-clients", Auth, StatsController.getCoachClients);
StatsRoutes.get("/coach-clients/:clientId", Auth, StatsController.getCoachClientDetail);
StatsRoutes.post("/creator", Auth, validateZod({ body: dateRangeSchema }), StatsController.creatorStats);

export default StatsRoutes;
