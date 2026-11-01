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

  // UCI list values are consumed as whitespace-separated words by the shell
  // backend, so local subscription files must have an absolute path without spaces.
  if (trimmedUrl.startsWith('/') && !/\s/.test(trimmedUrl)) {
    return { valid: true, message: _('Valid') };
  }

  // These link types are parsed and validated by sing-box-forkop or podkop-engine.
  const engineScheme = trimmedUrl
    .match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]
    ?.toLowerCase();
  if (
    engineScheme &&
    [
      'vmess',
      'hysteria',
      'hy',
      'http',
      'https',
      'anytls',
      'naive+https',
      'naive+quic',
      'http2',
      'http3',
      'tt',
      'mieru',
      'mierus',
    ].includes(engineScheme) &&
    trimmedUrl.length > engineScheme.length + 3
  ) {
    return { valid: true, message: _('Valid') };
  }

  return {
    valid: false,
    message: _(
      'Supported links: VLESS, Trojan, Shadowsocks, Hysteria2, VMess, TUIC, SOCKS, AnyTLS, NaiveProxy, and subscriptions',
    ),
  };
}
