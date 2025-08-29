import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const sendMessage = async (to: string, message: string): Promise<boolean> => {
  try {
    await client.messages.create({
      body: message,
      to: `+${to}`,
      from: process.env.TWILIO_FROM_NUMBER as string,
    });

    return true;
  } catch (error) {
    console.error("Error sending message:", error);
    return false;
  }
};
