/* Burst test to demonstrate rate limiting (expects dev login enabled) */
(async () => {
  const email = process.env.DEV_USER_EMAIL || 'demo@mentoros.app';
  const login = await fetch('http://localhost:3006/api/backend/v1/dev/login-as?email=' + encodeURIComponent(email));
  const setCookie = login.headers.get('set-cookie') || '';
  const sid = (setCookie.match(/connect\.sid=[^;\s,]+/i) || [])[0] || '';
  const jwt = (setCookie.match(/auth_token=[^;\s,]+/i) || [])[0] || '';
  const cookie = [jwt, sid].filter(Boolean).join('; ');
  let oks = 0, r429 = 0, other = 0, first429 = -1;
  for (let i = 0; i < 80; i++) {
    const r = await fetch('http://localhost:3006/api/backend/v1/interaction/chat/engh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({ message: 'ping ' + i })
    });
    if (r.status === 200) oks++; else if (r.status === 429) { r429++; if (first429 < 0) first429 = i; } else other++;
  }
  console.log(JSON.stringify({ oks, r429, other, first429 }));
})().catch(e => { console.error('burst-fail', e && e.message || String(e)); process.exit(1); });


