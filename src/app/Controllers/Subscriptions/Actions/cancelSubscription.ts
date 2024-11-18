import stripeInstance from "../../../../utils/stripe";
import { Subscription } from "../../../Models/Subscription";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";

export interface CancelSubscriptionParams {
  userId: string;
}

export const cancelSubscriptions = async (
  params: CancelSubscriptionParams
): Promise<void> => {
  const { userId } = params;

  try {
    const activeSubscriptions = await Subscription.find({
      userId,
      status: SubscriptionStatusEnum.ACTIVE,
    });

    if (activeSubscriptions.length > 0) {
      const cancelPromises = activeSubscriptions.map(
        async (activeSubscription) => {
          const stripeSubscription = await stripeInstance.subscriptions.cancel(
            activeSubscription.StripeSubscriptionId
          );

          activeSubscription.status = SubscriptionStatusEnum.CANCEL;
          await activeSubscription.save();

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
