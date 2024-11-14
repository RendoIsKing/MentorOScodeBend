import { Router } from "express";
import { Auth } from "../app/Middlewares";
import { StatsController } from "../app/Controllers/Stats";

const StatsRoutes: Router = Router();

StatsRoutes.get("/followers/:id", Auth, StatsController.getFollowers);
StatsRoutes.get("/following/:id", Auth, StatsController.getFollowing);
StatsRoutes.get("/posts-likes/:id", Auth, StatsController.getPostLikes);
StatsRoutes.post("/user-earning", Auth, StatsController.getEarning);
StatsRoutes.post("/user-chart", Auth, StatsController.getEarningChart);

StatsRoutes.get("/subscribers/:id", StatsController.getSubscribers);
StatsRoutes.post("/creator", Auth, StatsController.creatorStats);

export default StatsRoutes;
