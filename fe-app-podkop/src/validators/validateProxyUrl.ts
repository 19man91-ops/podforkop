import { ValidationResult } from './types';
import { validateShadowsocksUrl } from './validateShadowsocksUrl';
import { validateVlessUrl } from './validateVlessUrl';
import { validateTrojanUrl } from './validateTrojanUrl';
import { validateSocksUrl } from './validateSocksUrl';
import { validateHysteria2Url } from './validateHysteriaUrl';
import { validateTuicUrl } from './validateTuicUrl';

// TODO refactor current validation and add tests
export function validateProxyUrl(url: string): ValidationResult {
  const trimmedUrl = url.trim();

  if (trimmedUrl.startsWith('ss://')) {
    return validateShadowsocksUrl(trimmedUrl);
  }

  if (trimmedUrl.startsWith('vless://')) {
    return validateVlessUrl(trimmedUrl);
  }

  if (trimmedUrl.startsWith('trojan://')) {
    return validateTrojanUrl(trimmedUrl);
  }

  if (/^socks(?:4|4a|5h?):\/\//.test(trimmedUrl) || /^socks:\/\//.test(trimmedUrl)) {
    return validateSocksUrl(trimmedUrl);
  }

  if (trimmedUrl.startsWith('tuic://')) {
    return validateTuicUrl(trimmedUrl);
  }

  if (
    trimmedUrl.startsWith('hysteria2://') ||
    trimmedUrl.startsWith('hy2://')
  ) {
    return validateHysteria2Url(trimmedUrl);
  }

  // These link types are parsed and validated by podkop-engine. Some require
  // the optional podkop-engine-full package instead of the default slim build.
  const engineScheme = trimmedUrl
    .match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]
    ?.toLowerCase();
  if (
    engineScheme &&
    [
      'vmess',
      'hysteria',
      'http',
      'https',
      'anytls',
      'naive+https',
      'naive+quic',
    ].includes(engineScheme) &&
    trimmedUrl.length > engineScheme.length + 3
  ) {
    return { valid: true, message: _('Valid') };
  }

  return {
    valid: false,
    message: _(
      'Supported links: VLESS, VMess, Trojan, Shadowsocks, SOCKS, Hysteria, TUIC, HTTP(S), AnyTLS, and NaiveProxy',
    ),
  };
}
