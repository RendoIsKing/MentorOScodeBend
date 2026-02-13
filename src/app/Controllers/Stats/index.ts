import { Request, Response } from "express";
import { getFollowers } from "./Actions/getFollowersAction";
import { getFollowing } from "./Actions/getFollowingAction";
import { getPostLikes } from "./Actions/getPostLikesAction";
import { getSubscribers } from "./Actions/getSubscribersAction";
import { creatorStats } from "./Actions/creatorStats";
import { getUserEarningChart } from "./Actions/getUserEarningChartAction";
import { getUserEarningStats } from "./Actions/getUserEarningStats.action";
import { getCoachClients } from "./Actions/getCoachClientsAction";

export class StatsController {
  static getFollowers = (req: Request, res: Response) => {
    getFollowers(req, res);
  };

  static getFollowing = (req: Request, res: Response) => {
    getFollowing(req, res);
  };

  static getPostLikes = (req: Request, res: Response) => {
    getPostLikes(req, res);
  };

  static getSubscribers = (req: Request, res: Response) => {
    getSubscribers(req, res);
  };

  static creatorStats = (req: Request, res: Response) => {
    creatorStats(req, res);
  };

  static getEarning = (req: Request, res: Response) => {
    getUserEarningStats(req, res);
  };

  static getEarningChart = (req: Request, res: Response) => {
    getUserEarningChart(req, res);
  };

  static getCoachClients = (req: Request, res: Response) => {
    getCoachClients(req, res);
  };
}
