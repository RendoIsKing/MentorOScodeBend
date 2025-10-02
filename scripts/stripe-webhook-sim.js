// Simple local Stripe webhook simulator
// Usage (env only, no secrets printed):
//   set STRIPE_WEBHOOK_SECRET=whsec_xxx
//   set STRIPE_SECRET_KEY=sk_test_xxx (optional, only for helper)
//   set TEST_USER_ID=<mongoId> (optional)
//   set STRIPE_TEST_EVENT=checkout.session.completed (optional)
//   set WEBHOOK_URL=http://localhost:3006/api/v1/handlePaymentStripe (optional)
//   node scripts/stripe-webhook-sim.js

/* eslint-disable no-console */
const axios = require('axios');
const Stripe = require('stripe');

async function main() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET missing');
    process.exit(1);
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_123';
  const stripe = new Stripe(stripeSecretKey);

  const eventType = process.env.STRIPE_TEST_EVENT || 'checkout.session.completed';
  const testUserId = process.env.TEST_USER_ID || '';
  const url = process.env.WEBHOOK_URL || 'http://localhost:3006/api/v1/handlePaymentStripe';

  const payload = {
    id: 'evt_test_' + Date.now(),
    object: 'event',
    type: eventType,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        object: eventType.startsWith('customer.subscription') ? 'subscription' : 'checkout.session',
        id: process.env.TEST_STRIPE_SUB_ID || ('sub_test_' + Date.now()),
        status: 'active',
        customer: 'cus_test_123',
        subscription: 'sub_test_123',
        metadata: testUserId ? { userId: testUserId } : {},
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_test_' + Date.now(), idempotency_key: null },
  };

  const payloadString = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: webhookSecret,
  });

  try {
    const res = await axios.post(url, payloadString, {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': header,
      },
      validateStatus: () => true,
    });
    console.log('Webhook POST →', res.status, res.statusText);
    console.log(String(res.data || ''));
  } catch (e) {
    console.error('Webhook POST failed:', e?.message || String(e));
    process.exitCode = 1;
  }
}

main();


