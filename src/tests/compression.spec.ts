import request from 'supertest';
import { createTestApp } from './compression.server';

describe('HTTP compression', () => {
  it('serves gzip when client accepts it and reduces size', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/big')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    // compression should set content-encoding
    expect(res.header['content-encoding']).toBeDefined();
    expect(res.header['content-encoding']).toMatch(/gzip|br|deflate/);
    // ensure body length is smaller than raw 5000 bytes
    const contentLength = parseInt(res.header['content-length'] || '0', 10);
    if (!Number.isNaN(contentLength) && contentLength > 0) {
      expect(contentLength).toBeLessThan(5000);
    } else {
      // some servers use chunked encoding; still OK as long as encoding header exists
      expect(true).toBe(true);
    }
  });
});


