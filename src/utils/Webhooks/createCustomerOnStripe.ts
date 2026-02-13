import axios from "axios";
import { updateById, Tables } from "../../lib/db";
const qs = require("qs");

const POST = "post";

export const createCustomerOnStripe = (params: {
  email: string;
  firstName: string;
  userId: string;
}) => {
  return new Promise((resolve, reject) => {
    const secret = process.env.STRIPE_SECRET_KEY;
    const url = process.env.STRIPE_CUSTOMER_CREATE_URL;

    if (!secret || !url) {
      console.error("❌ Stripe ENV missing:", {
        STRIPE_SECRET_KEY: secret,
        STRIPE_CUSTOMER_CREATE_URL: url,
      });
      return reject(new Error("STRIPE_SECRET_KEY or STRIPE_CUSTOMER_CREATE_URL is Missing"));
    }

    const config = {
      method: POST,
      url,
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      data: qs.stringify({
        name: params.firstName,
        email: params?.email,
      }),
    };

    axios(config)
      .then(async (response) => {
        if (response.data.id) {
          await updateById(Tables.USERS, String(params.userId), {
            is_stripe_customer: true,
            stripe_client_id: response.data.id,
          });
        }
        resolve(response);
      })
      .catch((err) => {
        console.log("Stripe create error:", err.response?.data);
        reject(err.response?.data);
      });
  });
};
