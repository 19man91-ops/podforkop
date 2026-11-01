import { domainToUnicode } from '../../../helpers/domainToUnicode';

const WEB_PORTS = new Set(['80', '443']);

function normalize(value?: string | number | null): string {
  return value == null ? '' : String(value).trim();
}

export function formatEndpoint(
  address?: string,
  port?: string | number,
): string {
  const normalizedAddress = domainToUnicode(normalize(address));
  const normalizedPort = normalize(port);

  if (!normalizedAddress) {
    return '-';
  }

  if (!normalizedPort || WEB_PORTS.has(normalizedPort)) {
    return normalizedAddress;
  }

  if (normalizedAddress.includes(':') && !normalizedAddress.startsWith('[')) {
    return `[${normalizedAddress}]:${normalizedPort}`;
  }

  return `${normalizedAddress}:${normalizedPort}`;
}
