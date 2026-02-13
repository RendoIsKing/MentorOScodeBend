import stripeInstance from "../../../../utils/stripe";
import { findMany, updateById, Tables } from "../../../../lib/db";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";

export interface CancelSubscriptionParams {
  userId: string;
}

export const cancelSubscriptions = async (
  params: CancelSubscriptionParams
): Promise<void> => {
  const { userId } = params;

  try {
    const activeSubscriptions = await findMany(Tables.SUBSCRIPTIONS, {
      user_id: userId,
      status: SubscriptionStatusEnum.ACTIVE,
    });

    if (activeSubscriptions.length > 0) {
      const cancelPromises = activeSubscriptions.map(
        async (activeSubscription: any) => {
          const stripeSubscription = await stripeInstance.subscriptions.cancel(
            activeSubscription.stripe_subscription_id
          );

          await updateById(Tables.SUBSCRIPTIONS, activeSubscription.id, {
            status: SubscriptionStatusEnum.CANCEL,
          });

          return stripeSubscription;
        }
      );

      await Promise.all(cancelPromises);
    }
  } catch (error) {
    console.error("Error cancelling subscriptions:", error);
    throw new Error(error.message);
  }
};
