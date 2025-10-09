import { Router } from 'express';

const r = Router();

function page(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;max-width:760px;margin:24px auto;padding:0 12px;line-height:1.6}h1{font-size:1.6rem}h2{font-size:1.2rem;margin-top:1.2rem}</style></head><body><h1>${title}</h1>${body}</body></html>`;
}

r.get('/legal/terms', (_req, res) => {
  res.type('html').send(page('Terms of Service', `<p>These Terms govern your use of Arken. By using the service you agree to these Terms.</p><h2>Use</h2><p>Be respectful. Don’t abuse or harm others.</p><h2>Content</h2><p>You retain ownership of your content. You grant us a license to operate the service.</p><h2>Liability</h2><p>Service is provided AS IS, without warranties. We are not liable for indirect damages.</p><h2>Changes</h2><p>We may update these Terms. We’ll post updates here.</p>`));
});

r.get('/legal/privacy', (_req, res) => {
  res.type('html').send(page('Privacy Policy', `<p>We collect data to provide the service: account info, usage, and device data.</p><h2>Data</h2><p>We store account data and logs. We do not sell personal data.</p><h2>Security</h2><p>We take reasonable measures. No method is 100% secure.</p><h2>Rights</h2><p>You can request export or deletion of your data.</p>`));
});

r.get('/legal/guidelines', (_req, res) => {
  res.type('html').send(page('Community Guidelines', `<p>Be kind. Share constructive feedback. No harassment, hate, or illegal activity.</p><h2>Moderation</h2><p>We may remove content that violates these guidelines.</p>`));
});

r.get('/legal/ai', (_req, res) => {
  res.type('html').send(page('AI Use', `<p>AI features may be inaccurate. Verify suggestions before acting.</p><h2>Safety</h2><p>Consult professionals for medical or health advice.</p>`));
});

export default r;


