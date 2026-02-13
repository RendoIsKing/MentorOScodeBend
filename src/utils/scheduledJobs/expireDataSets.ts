import { db, Tables } from "../../lib/db";
import * as cron from "node-cron";

export const expireDataSetCronJob = () => {
  cron.schedule("0 0 * * *", async () => {
    //runs midnight
    try {
      console.log("Running cron job to update expired datasets...");

      const now = new Date().toISOString();
      const { count } = await db
        .from(Tables.USER_DATA)
        .update({ is_expired: true })
        .lt("download_before", now);

      console.log(
        `Cron job completed. Updated ${count ?? 0} datasets.`
      );
    } catch (error) {
      console.error("Error running cron job:", error);
    }
  });
};
