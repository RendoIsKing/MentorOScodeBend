/*
  Node-based smoke test for authenticated chat/actions and rate-limit.
  - Reads connect.sid from cookies.txt
  - POST chat message → expect 200
  - POST invalid actions payload → expect 422
  - Loop chat to trigger 429 (per-user+IP limiter)
*/

const fs = require('fs');
const DEV_EMAIL = process.env.DEV_USER_EMAIL || 'demo@mentoros.app';

function readCookie() {
  try {
    const t = fs.readFileSync('cookies.txt', 'utf8');
    const lines = t.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const parts = line.split(/\t/);
      if (parts.length >= 7 && parts[5] === 'connect.sid') {
        return `connect.sid=${parts[6]}`;
      }
    }
  } catch {}
  return '';
}

async function post(path, body, cookie) {
  const url = `http://localhost:3006${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { 'Cookie': cookie } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  let text = '';
  try { text = await res.text(); } catch {}
  return { status: res.status, text, headers: Object.fromEntries(res.headers.entries()) };
}

(async () => {
  // Always ensure we have fresh auth_token + connect.sid (session store may restart)
  let cookie = '';
  try {
    const res = await fetch(`http://localhost:3006/api/backend/v1/dev/login-as?email=${encodeURIComponent(DEV_EMAIL)}`, { method: 'GET' });
    const setCookie = res.headers.get('set-cookie') || '';
    const sid = (setCookie.match(/connect\.sid=[^;\s,]+/i) || [])[0] || '';
    const jwt = (setCookie.match(/auth_token=[^;\s,]+/i) || [])[0] || '';
    const parts = [];
    if (jwt) parts.push(jwt);
    if (sid) parts.push(sid);
    cookie = parts.join('; ');
  } catch {}
  console.log('cookie header length:', cookie.length);

  // 1) Authenticated chat
  const r1 = await post('/api/backend/v1/interaction/chat/engh', { message: 'hi' }, cookie);
  console.log('chat status:', r1.status);

  // 2) Invalid actions payload → 422
  const r2 = await post('/api/backend/v1/interaction/actions/apply', {}, cookie);
  console.log('actions status:', r2.status);
  // 3) Empty chat → 422
  const r3 = await post('/api/backend/v1/interaction/chat/engh', { message: '' }, cookie);
  console.log('chat empty status:', r3.status);

  // 4) Burst to hit per-user+IP rate limiter
  let burst429 = 0;
  for (let i = 0; i < 15; i++) {
    const r = await post('/api/backend/v1/interaction/chat/engh', { message: `ping ${i}` }, cookie);
    if (r.status === 429) burst429++;
  }
  console.log('burst429:', burst429);
  
  // 5) Conversation messages non-member → 403 (make a fake thread id)
  const fakeId = '000000000000000000000000';
  const res4 = await fetch(`http://localhost:3006/api/backend/v1/chat/threads/${fakeId}/messages`, { headers: { Cookie: cookie } });
  console.log('conv non-member or not-found status:', res4.status);

  // ── Negative tests: Zod validation ──────────────────────

  // 6) Actions with wrong type field → expect 400/422
  const r6 = await post('/api/backend/v1/interaction/actions/apply', { type: 'INVALID_TYPE', payload: {} }, cookie);
  console.log('actions invalid type:', r6.status, '(expect 400 or 422)');

  // 7) Actions with missing required field → expect 400/422
  const r7 = await post('/api/backend/v1/interaction/actions/apply', { payload: { value: 1 } }, cookie);
  console.log('actions missing type:', r7.status, '(expect 400 or 422)');

  // 8) Actions with excessively long text → expect 400/422
  const longText = 'x'.repeat(50000);
  const r8 = await post('/api/backend/v1/interaction/chat/engh', { message: longText }, cookie);
  console.log('chat long message:', r8.status, '(expect 400 or 422)');

  // 9) Create conversation with invalid partnerId → expect 400/422
  const r9 = await post('/api/backend/v1/chat/conversations', { partnerId: 'not-a-valid-id' }, cookie);
  console.log('conv invalid partnerId:', r9.status, '(expect 400 or 422)');

  // 10) Create conversation with missing partnerId → expect 400
  const r10 = await post('/api/backend/v1/chat/conversations', {}, cookie);
  console.log('conv missing partnerId:', r10.status, '(expect 400)');

  // ── Negative tests: Auth ────────────────────────────────

  // 11) Protected endpoint without cookie → expect 401
  const r11 = await post('/api/backend/v1/interaction/actions/apply', { type: 'WEIGHT_LOG', payload: { value: 80 } }, '');
  console.log('actions no auth:', r11.status, '(expect 401)');

  // 12) Chat without cookie → expect 401
  const r12 = await post('/api/backend/v1/interaction/chat/engh', { message: 'hi' }, '');
  console.log('chat no auth:', r12.status, '(expect 401)');

  // 13) Conversations without cookie → expect 401
  const r13 = await post('/api/backend/v1/chat/conversations', { partnerId: fakeId }, '');
  console.log('conv no auth:', r13.status, '(expect 401)');

  // ── Summary ─────────────────────────────────────────────
  console.log('\n--- Smoke test complete ---');
})().catch((e)=>{ console.error('Smoke test crashed:', e); process.exitCode = 1; });


