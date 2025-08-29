import express from 'express';
import compression from 'compression';

export function createTestApp() {
  const app = express();
  app.use(compression());
  // send a large enough payload to benefit from gzip
  const payload = 'x'.repeat(5000);
  app.get('/big', (_req, res) => {
    res.type('text/plain').send(payload);
  });
  return app;
}


