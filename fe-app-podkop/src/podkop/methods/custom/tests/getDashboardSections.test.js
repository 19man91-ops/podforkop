import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardSections } from '../getDashboardSections';
import { getConfigSections } from '../getConfigSections';
import { PodkopShellMethods } from '../../shell';

vi.mock('../getConfigSections', () => ({ getConfigSections: vi.fn() }));
// the helpers index pulls in the DOM services: only the two helpers used here
vi.mock('../../../../helpers', async () => ({
  getProxyUrlName: (await import('../../../../helpers/getProxyUrlName'))
    .getProxyUrlName,
  splitProxyString: (await import('../../../../helpers/splitProxyString'))
    .splitProxyString,
  formatProxyDisplayName: (await import('../../../../helpers/countryFlags'))
    .formatProxyDisplayName,
}));
vi.mock('../../shell', () => ({
  PodkopShellMethods: { getClashApiProxies: vi.fn() },
}));

const proxy = (name, extra = {}) => ({ name, history: [], ...extra });

function mockUrlTest(section, all) {
  getConfigSections.mockResolvedValue([section]);
  PodkopShellMethods.getClashApiProxies.mockResolvedValue({
    success: true,
    data: {
      proxies: {
        'main-out': proxy('main-out', { now: 'main-urltest-out' }),
        'main-urltest-out': proxy('main-urltest-out', { all }),
        ...Object.fromEntries(all.map((tag) => [tag, proxy(tag)])),
      },
    },
  });
}

async function tileNames() {
  const result = await getDashboardSections();
  return result.data[0].outbounds.map((outbound) => outbound.displayName);
}

describe('getDashboardSections, urltest section', () => {
  beforeEach(() => vi.clearAllMocks());

  it('names the proxy links, then the fallback links, in the group order', async () => {
    mockUrlTest(
      {
        '.name': 'main',
        connection_type: 'proxy',
        proxy_config_type: 'urltest',
        urltest_proxy_links: [
          'socks5://10.0.0.1:1080#A',
          'socks5://10.0.0.2:1080#B',
        ],
        urltest_fallback_links: ['socks5://10.0.0.3:1080#Fallback'],
      },
      ['main-1-out', 'main-2-out', 'main-fallback-1-out'],
    );

    expect(await tileNames()).toEqual(['Fastest', 'A', 'B', 'Fallback']);
  });

  it('names the proxy links when there are no fallback links', async () => {
    mockUrlTest(
      {
        '.name': 'main',
        connection_type: 'proxy',
        proxy_config_type: 'urltest',
        urltest_proxy_links: [
          'socks5://10.0.0.1:1080#A',
          'socks5://10.0.0.2:1080#B',
        ],
      },
      ['main-1-out', 'main-2-out'],
    );

    expect(await tileNames()).toEqual(['Fastest', 'A', 'B']);
  });

  it('falls back to the outbound name for a link without a name', async () => {
    mockUrlTest(
      {
        '.name': 'main',
        connection_type: 'proxy',
        proxy_config_type: 'urltest',
        urltest_proxy_links: ['socks5://10.0.0.1:1080#A'],
        urltest_fallback_links: ['socks5://10.0.0.3:1080'],
      },
      ['main-1-out', 'main-fallback-1-out'],
    );

    expect(await tileNames()).toEqual(['Fastest', 'A', 'main-fallback-1-out']);
  });

  it('renders provider nodes for selector sections with subscriptions', async () => {
    getConfigSections.mockResolvedValue([
      {
        '.name': 'sub_section',
        connection_type: 'proxy',
        proxy_config_type: 'selector',
        selector_subscription_urls: ['https://example.com/sub'],
      },
    ]);
    PodkopShellMethods.getClashApiProxies.mockResolvedValue({
      success: true,
      data: {
        proxies: {
          'sub_section-out': proxy('sub_section-out', {
            type: 'Selector',
            now: 'FI-ruspace',
            all: ['FI-ruspace', 'FI-ruspace-Yulya-FI'],
          }),
          'FI-ruspace': proxy('FI-ruspace', { type: 'VLESS' }),
          'FI-ruspace-Yulya-FI': proxy('FI-ruspace-Yulya-FI', {
            type: 'Hysteria2',
          }),
        },
      },
    });

    const result = await getDashboardSections();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].withTagSelect).toBe(true);
    expect(result.data[0].outbounds.map((o) => o.displayName)).toEqual([
      '🇫🇮 FI-ruspace',
      '🇫🇮 FI-ruspace-Yulya-FI',
    ]);
    expect(result.data[0].outbounds[0].selected).toBe(true);
    expect(result.data[0].outbounds[1].selected).toBe(false);
  });

  it('skips disabled sections on the dashboard', async () => {
    getConfigSections.mockResolvedValue([
      {
        '.name': 'disabled_sec',
        enabled: '0',
        connection_type: 'proxy',
        proxy_config_type: 'url',
        proxy_string: 'vless://id@127.0.0.1:443?type=tcp&security=tls#Disabled',
      },
    ]);
    PodkopShellMethods.getClashApiProxies.mockResolvedValue({
      success: true,
      data: { proxies: {} },
    });

    const result = await getDashboardSections();
    expect(result.data).toHaveLength(0);
  });
});
