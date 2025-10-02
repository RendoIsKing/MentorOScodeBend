/* Quick check: dev-login, resolve user id, fetch recent ChangeEvents */
/* eslint-disable no-console */
(async () => {
  const email = process.env.DEV_USER_EMAIL || 'demo@mentoros.app';
  const login = await fetch('http://localhost:3006/api/backend/v1/dev/login-as?email=' + encodeURIComponent(email));
  const setCookie = login.headers.get('set-cookie') || '';
  const sid = (setCookie.match(/connect\.sid=[^;\s,]+/i) || [])[0] || '';
  const jwt = (setCookie.match(/auth_token=[^;\s,]+/i) || [])[0] || '';
  const cookie = [jwt, sid].filter(Boolean).join('; ');
  const meRes = await fetch('http://localhost:3006/api/backend/v1/auth/me', { headers: { Cookie: cookie } });
  const me = await meRes.json().catch(() => ({}));
  const id = me?.data?.id || me?.data?.user?.id || me?.data?._id || '';
  const r = await fetch(`http://localhost:3006/api/backend/v1/student/${id}/changes?limit=5`, { headers: { Cookie: cookie } });
  const j = await r.json().catch(() => ({}));
  console.log('changes', r.status, Array.isArray(j.items) ? j.items.length : 0);
  if (Array.isArray(j.items)) {
    for (const it of j.items) console.log('-', it.type, '|', it.summary);
  }
})().catch((e) => { console.error('check-changes failed:', e && e.message || String(e)); process.exit(1); });


