import { haversineDistance } from '../../src/integrations/maps';

describe('Haversine distance', () => {
  test('Kampala to Entebbe is ~35-40km', () => {
    // Kampala: 0.3476, 32.5825 — Entebbe: 0.0512, 32.4637
    const dist = haversineDistance(0.3476, 32.5825, 0.0512, 32.4637);
    expect(dist).toBeGreaterThan(30);
    expect(dist).toBeLessThan(50);
  });

  test('same point returns 0', () => {
    const dist = haversineDistance(0.3476, 32.5825, 0.3476, 32.5825);
    expect(dist).toBe(0);
  });

  test('distance is symmetric', () => {
    const d1 = haversineDistance(0, 0, 1, 1);
    const d2 = haversineDistance(1, 1, 0, 0);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});
