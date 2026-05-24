import { generateOtp } from '../../src/utils/otp';
import { success, error, paginated, parsePagination } from '../../src/utils/response';

describe('OTP utils', () => {
  test('generateOtp returns 6-digit string', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  test('generateOtp returns different values', () => {
    const otps = new Set(Array.from({ length: 20 }, generateOtp));
    expect(otps.size).toBeGreaterThan(1);
  });
});

describe('Response utils', () => {
  test('success wraps data correctly', () => {
    const result = success({ id: '1' }, 'Created', 201);
    expect(result).toEqual({ success: true, message: 'Created', data: { id: '1' }, statusCode: 201 });
  });

  test('error wraps message correctly', () => {
    const result = error('Not found', 404);
    expect(result).toEqual({ success: false, message: 'Not found', statusCode: 404 });
  });

  test('paginated includes meta', () => {
    const result = paginated([{ id: '1' }], 50, 1, 10);
    expect(result.data).toHaveLength(1);
    expect(result.meta).toMatchObject({ total: 50, page: 1, limit: 10, totalPages: 5 });
  });

  test('parsePagination defaults', () => {
    const { page, limit, skip } = parsePagination({});
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(skip).toBe(0);
  });

  test('parsePagination respects max limit', () => {
    const { limit } = parsePagination({ limit: '500' });
    expect(limit).toBe(100);
  });
});
