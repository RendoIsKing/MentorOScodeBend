import axios from "axios";
import { User } from "../../app/Models/User";
import { Types } from "mongoose";

const POST = "post";
const qs = require("qs");

if(!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_CUSTOMER_CREATE_URL){
    throw new Error("STRIPE_SECRET_KEY or STRIPE_CUSTOMER_CREATE_URL is Missing");
}

export const createCustomerOnStripe = (params: {
  email: string;
  firstName: string;
  userId: Types.ObjectId;
}) => {
  return new Promise((resolve, reject) => {
    const config = {
      method: POST,
      url: process.env.STRIPE_CUSTOMER_CREATE_URL,
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },

      data: qs.stringify({
        name: params.firstName,
        email: params?.email,
      }),
    };
    axios(config)
      .then(async (response) => {
        if (response.data.id) {
          await User.findByIdAndUpdate(params.userId, {
            isStripeCustomer: true,
            stripeClientId: response.data.id,
          });
        }
       console.log("Response From Customer creation on stripe", response);
        resolve(response);
      })
      .catch(async (err) => {   
        console.log("Error in customer creation on stripe", err.response?.data);  
        reject(err.response?.data);
      });
  });
};
