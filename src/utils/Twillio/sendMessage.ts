import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const client = twilio(process.env.TWILLIO_ACCOUNT_SID, process.env.TWILLIO_AUTH_TOKEN);

export const sendMessage = async (to: string, message: string): Promise<boolean> => {
  try {
    console.log("TWILLIO_ACCOUNT_SID:", process.env.TWILLIO_ACCOUNT_SID);
    console.log("TWILLIO_AUTH_TOKEN:", process.env.TWILLIO_AUTH_TOKEN);
    
   await client.messages.create({
      
      body: message,
      to: `+${to}`,
      from: "+1 231 936 2567",
    });

    return true;
  } catch (error) {
    console.error("Error sending message:", error);
    return false;
  }
};
