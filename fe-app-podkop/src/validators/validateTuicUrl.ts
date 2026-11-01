import { ValidationResult } from './types';

export function validateTuicUrl(url: string): ValidationResult {
  try {
    const parsed = new URL(url);
    const port = Number(parsed.port);

    if (
      parsed.protocol !== 'tuic:' ||
      !parsed.hostname ||
      !parsed.username ||
      !parsed.password ||
      !parsed.port ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      return { valid: false, message: _('Invalid URL format') };
    }

    return { valid: true, message: _('Valid') };
  } catch (_error) {
    return { valid: false, message: _('Invalid URL format') };
  }
}
