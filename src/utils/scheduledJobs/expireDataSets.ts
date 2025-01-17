import { UserData } from "../../app/Models/UserData";
import * as cron from "node-cron";

export const expireDataSetCronJob = () => {
  cron.schedule("0 0 * * *", async () => {
    //runs midnight
    try {
      console.log("Running cron job to update expired datasets...");

      const now = new Date();
      const result = await UserData.updateMany(
        { downloadBefore: { $lt: now } },
        { $set: { isExpired: true } }
      );

      console.log(
        `Cron job completed. Updated ${result.modifiedCount} datasets.`
      );
    } catch (error) {
      console.error("Error running cron job:", error);
    }
  });
};
