import twilio from 'twilio';

export async function sendMessageTest(to: string, message: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM_NUMBER as string;
  const client = twilio(sid, token);
  return client.messages.create({ body: message, to: `+${to}`, from });
}


