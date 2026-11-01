import { describe, expect, it } from 'vitest';
import {
  flagFromCountryCode,
  formatProxyDisplayName,
  renderFlagEmojis,
} from '../countryFlags';

describe('countryFlags helper', () => {
  it('converts ISO country codes to emoji flags', () => {
    expect(flagFromCountryCode('FI')).toBe('🇫🇮');
    expect(flagFromCountryCode('NL')).toBe('🇳🇱');
    expect(flagFromCountryCode('DE')).toBe('🇩🇪');
    expect(flagFromCountryCode('US')).toBe('🇺🇸');
    expect(flagFromCountryCode('RU')).toBe('🇷🇺');
    expect(flagFromCountryCode('SE')).toBe('🇸🇪');
    expect(flagFromCountryCode('UK')).toBe('🇬🇧');
  });

  it('strips subscription hash prefixes and prepends country flag', () => {
    const raw = 'podkop-sub-e0efd6c532449773551c899163650978/FI-ruspace-user1';
    expect(formatProxyDisplayName(raw)).toBe('🇫🇮 FI-ruspace-user1');

    const raw2 = 'podkop-sub-7f83400d2fb5447bb108497077bd0eac/FI-spaceru';
    expect(formatProxyDisplayName(raw2)).toBe('🇫🇮 FI-spaceru');

    const raw3 = 'podkop-sub-12345/NL-Amsterdam-Fast';
    expect(formatProxyDisplayName(raw3)).toBe('🇳🇱 NL-Amsterdam-Fast');

    const raw4 = 'podkop-sub-abcdef/US_NewYork';
    expect(formatProxyDisplayName(raw4)).toBe('🇺🇸 US_NewYork');
  });

  it('detects country names in proxy names', () => {
    expect(formatProxyDisplayName('server-finland-01')).toBe(
      '🇫🇮 server-finland-01',
    );
    expect(formatProxyDisplayName('vpn-германия-fast')).toBe(
      '🇩🇪 vpn-германия-fast',
    );
  });

  it('preserves names that already have flag emojis', () => {
    expect(formatProxyDisplayName('🇫🇮 My-Server')).toBe('🇫🇮 My-Server');
  });

  it('renders flag emojis as DOM elements', () => {
    const elements = renderFlagEmojis('🇫🇮 FI-ruspace-user1');
    expect(elements.length).toBeGreaterThan(0);
  });
});
