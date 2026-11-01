export type TrafficLevel = 'ok' | 'warning' | 'critical';

export interface TrafficUsage {
  used: number;
  total: number;
  remaining: number;
  percent: number;
  level: TrafficLevel;
  unlimited: boolean;
}

const SAFE_ZERO = 0;

function toNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return SAFE_ZERO;
  }

  return value;
}

export function getTrafficUsage(
  upload: number,
  download: number,
  total: number,
): TrafficUsage {
  const safeUpload = toNonNegativeNumber(upload);
  const safeDownload = toNonNegativeNumber(download);
  const safeTotal = toNonNegativeNumber(total);
  const used = safeUpload + safeDownload;

  if (safeTotal === 0) {
    return {
      used,
      total: 0,
      remaining: 0,
      percent: 0,
      level: 'ok',
      unlimited: true,
    };
  }

  const percent = Math.min(100, Math.round((used / safeTotal) * 100));
  const level: TrafficLevel =
    percent >= 90 ? 'critical' : percent >= 70 ? 'warning' : 'ok';

  return {
    used,
    total: safeTotal,
    remaining: Math.max(0, safeTotal - used),
    percent,
    level,
    unlimited: false,
  };
}

export type ExpiryLevel = 'none' | 'ok' | 'warning' | 'expired';

export interface ExpiryInfo {
  validUntil: Date | null;
  daysLeft: number | null;
  level: ExpiryLevel;
}

const SECONDS_PER_DAY = 86400;
const EXPIRY_WARNING_DAYS = 3;

export function getExpiryInfo(
  expire: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ExpiryInfo {
  if (!Number.isFinite(expire) || expire <= 0) {
    return { validUntil: null, daysLeft: null, level: 'none' };
  }

  const daysLeft = Math.ceil((expire - nowSeconds) / SECONDS_PER_DAY);
  const level: ExpiryLevel =
    daysLeft < 0
      ? 'expired'
      : daysLeft <= EXPIRY_WARNING_DAYS
        ? 'warning'
        : 'ok';

  return {
    validUntil: new Date(expire * 1000),
    daysLeft,
    level,
  };
}

export function formatUpdatedAgo(
  updatedAt: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return _('never');
  }

  const diff = Math.max(0, nowSeconds - updatedAt);

  if (diff < 60) {
    return _('just now');
  }

  if (diff < 3600) {
    return `${Math.floor(diff / 60)} ${_('min ago')}`;
  }

  if (diff < SECONDS_PER_DAY) {
    return `${Math.floor(diff / 3600)} ${_('h ago')}`;
  }

  return `${Math.floor(diff / SECONDS_PER_DAY)} ${_('d ago')}`;
}
