import { describe, expect, it } from 'vitest';
import {
  formatUpdatedAgo,
  getExpiryInfo,
  getTrafficUsage,
} from '../subscriptionUtils';

describe('subscriptionUtils', () => {
  describe('getTrafficUsage', () => {
    it('treats a zero total as an unlimited plan', () => {
      const usage = getTrafficUsage(1024, 2048, 0);

      expect(usage.unlimited).toBe(true);
      expect(usage.used).toBe(3072);
      expect(usage.total).toBe(0);
      expect(usage.remaining).toBe(0);
      expect(usage.percent).toBe(0);
      expect(usage.level).toBe('ok');
    });

    it('sums upload and download and calculates the remaining traffic', () => {
      const usage = getTrafficUsage(10, 20, 100);

      expect(usage.used).toBe(30);
      expect(usage.total).toBe(100);
      expect(usage.remaining).toBe(70);
      expect(usage.percent).toBe(30);
      expect(usage.level).toBe('ok');
      expect(usage.unlimited).toBe(false);
    });

    it('uses the requested warning thresholds', () => {
      expect(getTrafficUsage(69, 0, 100).level).toBe('ok');
      expect(getTrafficUsage(70, 0, 100).level).toBe('warning');
      expect(getTrafficUsage(89, 0, 100).level).toBe('warning');
      expect(getTrafficUsage(90, 0, 100).level).toBe('critical');
      expect(getTrafficUsage(120, 0, 100).level).toBe('critical');
    });

    it('clamps the percentage and never returns negative values', () => {
      const overQuota = getTrafficUsage(150, 50, 100);
      const negative = getTrafficUsage(-10, -20, -100);
      const invalid = getTrafficUsage(Number.NaN, Number.NaN, 100);

      expect(overQuota.percent).toBe(100);
      expect(overQuota.remaining).toBe(0);
      expect(negative.used).toBe(0);
      expect(negative.unlimited).toBe(true);
      expect(invalid.used).toBe(0);
    });
  });

  describe('getExpiryInfo', () => {
    const now = 1_700_000_000;

    it('returns an empty state when expire is not set', () => {
      expect(getExpiryInfo(0, now)).toEqual({
        validUntil: null,
        daysLeft: null,
        level: 'none',
      });
    });

    it('calculates days left and warns when the subscription is expiring', () => {
      const expiry = getExpiryInfo(now + 3 * 86400, now);

      expect(expiry.daysLeft).toBe(3);
      expect(expiry.level).toBe('warning');
      expect(expiry.validUntil?.getTime()).toBe((now + 3 * 86400) * 1000);
    });

    it('marks far-away dates as ok', () => {
      const expiry = getExpiryInfo(now + 40 * 86400, now);

      expect(expiry.daysLeft).toBe(40);
      expect(expiry.level).toBe('ok');
    });

    it('marks past dates as expired', () => {
      const expiry = getExpiryInfo(now - 86400, now);

      expect(expiry.daysLeft).toBe(-1);
      expect(expiry.level).toBe('expired');
    });
  });

  describe('formatUpdatedAgo', () => {
    const now = 1_700_000_000;

    it('formats the update time in human units', () => {
      expect(formatUpdatedAgo(0, now)).toBe('never');
      expect(formatUpdatedAgo(now - 30, now)).toBe('just now');
      expect(formatUpdatedAgo(now - 120, now)).toBe('2 min ago');
      expect(formatUpdatedAgo(now - 7200, now)).toBe('2 h ago');
      expect(formatUpdatedAgo(now - 3 * 86400, now)).toBe('3 d ago');
    });
  });
});
