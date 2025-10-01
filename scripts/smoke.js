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
  // 3) Burst to hit per-user+IP rate limiter
  let burst429 = 0;
  for (let i = 0; i < 15; i++) {
    const r = await post('/api/backend/v1/interaction/chat/engh', { message: `ping ${i}` }, cookie);
    if (r.status === 429) burst429++;
  }
  console.log('burst429:', burst429);
})().catch(()=>{});


