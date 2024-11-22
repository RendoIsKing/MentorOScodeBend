import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const client = twilio(process.env.TWILLIO_ACCOUNT_SID, process.env.TWILLIO_AUTH_TOKEN);

export const sendMessage = async (to: string, message: string): Promise<boolean> => {
  try {
   await client.messages.create({
      body: message,
      to: `+${to}`,
      from: "+1 510 694 2651",
    });

    // console.log(result);
    return true;
  } catch (error) {
    console.error("Error sending message:", error);
    return false;
  }
};
