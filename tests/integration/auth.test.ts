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

describe('Auth routes', () => {
  describe('POST /api/v1/auth/send-otp', () => {
    it('returns 200 with valid phone', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/send-otp',
        payload: { phone: '+256700000001' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it('returns 400 with missing phone', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/send-otp',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
    });
  });
});

describe('Protected routes require auth', () => {
  it('GET /api/v1/users/me returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/bookings returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/bookings' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/admin/dashboard returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard' });
    expect(res.statusCode).toBe(401);
  });
});
