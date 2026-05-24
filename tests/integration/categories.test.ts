import Fastify from 'fastify';
import { registerPlugins } from '../../src/plugins';
import { registerRoutes } from '../../src/routes';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await registerPlugins(app);
  await registerRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Category routes (public)', () => {
  it('GET /api/v1/categories returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/v1/categories/passenger returns passenger categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/categories/passenger' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.every((c: any) => c.type === 'PASSENGER')).toBe(true);
  });

  it('GET /api/v1/categories/cargo returns cargo categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/categories/cargo' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.every((c: any) => c.type === 'CARGO')).toBe(true);
  });
});

describe('Pricing routes (public)', () => {
  it('GET /api/v1/pricing returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/pricing' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/v1/pricing/estimate requires body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pricing/estimate',
      payload: { categoryId: 'fake-id', distanceKm: 5 },
    });
    expect([200, 404]).toContain(res.statusCode);
  });
});
