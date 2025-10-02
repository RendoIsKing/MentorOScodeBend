/* Dev helper: insert an INACTIVE Subscription for a user so webhook can flip it ACTIVE */
/* eslint-disable no-console */
require('dotenv').config();
// Allow requiring TypeScript source files for models
try { require('ts-node/register/transpile-only'); } catch {}
const mongoose = require('mongoose');
let Subscription;
try { ({ Subscription } = require('../src/app/Models/Subscription')); } catch {}

async function resolveUserId() {
  const explicit = process.env.TEST_USER_ID && String(process.env.TEST_USER_ID).trim();
  if (explicit) return explicit;
  const email = process.env.DEV_USER_EMAIL || 'demo@mentoros.app';
  try {
    const { User } = require('../src/app/Models/User');
    const u = await User.findOne({ email }).lean();
    return u?._id?.toString?.() || '';
  } catch {
    return '';
  }
}

async function main() {
  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error('MONGO_URI missing');
    process.exit(1);
  }
  await mongoose.connect(mongo);
  if (!Subscription) {
    console.error('Subscription model not loaded');
    process.exit(1);
  }
  const userId = await resolveUserId();
  if (!userId) {
    console.error('Unable to resolve user id');
    process.exit(1);
  }
  const stripeSubId = process.env.TEST_STRIPE_SUB_ID || 'sub_test_123';
  const stripePriceId = process.env.TEST_STRIPE_PRICE_ID || 'price_test_123';

  const planId = new mongoose.Types.ObjectId();
  const created = await Subscription.findOneAndUpdate(
    { StripeSubscriptionId: stripeSubId },
    {
      userId: new mongoose.Types.ObjectId(userId),
      planId,
      StripeSubscriptionId: stripeSubId,
      StripePriceId: stripePriceId,
      status: 'INACTIVE',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
    { upsert: true, new: true }
  );
  console.log(JSON.stringify({ ok: true, userId, subscriptionId: created._id.toString(), StripeSubscriptionId: stripeSubId }));
  await mongoose.disconnect();
}

main().catch(async (e) => { console.error(e && e.message || String(e)); try{ await mongoose.disconnect(); }catch{} process.exit(1); });


