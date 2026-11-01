import { getConfigSections } from './getConfigSections';
import { Podkop } from '../../types';
import { getProxyUrlName, splitProxyString } from '../../../helpers';
import { PodkopShellMethods } from '../shell';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface IGetDashboardSectionsResponse {
  success: boolean;
  data: Podkop.OutboundGroup[];
}

export async function getDashboardSections(): Promise<IGetDashboardSectionsResponse> {
  const configSections = await getConfigSections();
  const clashProxies = await PodkopShellMethods.getClashApiProxies();

  if (!clashProxies.success) {
    return {
      success: false,
      data: [],
    };
  }

  const proxies = Object.entries(clashProxies.data.proxies).map(
    ([key, value]) => ({
      code: key,
      value,
    }),
  );

  const data = configSections
    .filter(
      (section) =>
        section.enabled !== '0' &&
        section.connection_type !== 'block' &&
        section.connection_type !== 'exclusion' &&
        section['.type'] !== 'settings',
    )
    .map((section) => {
      if (section.connection_type === 'proxy') {
        if (section.proxy_config_type === 'url') {
          const outbound = proxies.find(
            (proxy) => proxy.code === `${section['.name']}-out`,
          );

          if (
            outbound?.value?.type === 'selector' &&
            (outbound?.value?.all?.length ?? 0) > 0
          ) {
            const allCodes = outbound.value.all ?? [];
            const outbounds = allCodes.map((code) => {
              const node = proxies.find((p) => p.code === code);
              return {
                code,
                displayName: node?.value?.name || code,
                latency: node?.value?.history?.[0]?.delay || 0,
                type: node?.value?.type || '',
                selected: outbound.value?.now === code,
              };
            });

            return {
              withTagSelect: true,
              code: outbound.code,
              displayName: section['.name'],
              outbounds,
            };
          }

          const activeConfigs = splitProxyString(section.proxy_string);

          const proxyDisplayName =
            getProxyUrlName(activeConfigs?.[0]) || outbound?.value?.name || '';

          return {
            withTagSelect: false,
            code: outbound?.code || section['.name'],
            displayName: section['.name'],
            outbounds: [
              {
                code: outbound?.code || section['.name'],
                displayName: proxyDisplayName,
                latency: outbound?.value?.history?.[0]?.delay || 0,
                type: outbound?.value?.type || '',
                selected: true,
              },
            ],
          };
        }

        if (section.proxy_config_type === 'outbound') {
          const outbound = proxies.find(
            (proxy) => proxy.code === `${section['.name']}-out`,
          );

          let parsedOutbound: any = null;
          try {
            parsedOutbound = section.outbound_json
              ? JSON.parse(section.outbound_json)
              : null;
          } catch {
            parsedOutbound = null;
          }
          const parsedTag = parsedOutbound?.tag
            ? decodeURIComponent(parsedOutbound?.tag)
            : undefined;
          const proxyDisplayName = parsedTag || outbound?.value?.name || '';

          return {
            withTagSelect: false,
            code: outbound?.code || section['.name'],
            displayName: section['.name'],
            outbounds: [
              {
                code: outbound?.code || section['.name'],
                displayName: proxyDisplayName,
                latency: outbound?.value?.history?.[0]?.delay || 0,
                type: outbound?.value?.type || '',
                selected: true,
              },
            ],
          };
        }

        if (
          section.proxy_config_type === 'selector' ||
          section.proxy_config_type === 'subscription'
        ) {
          const selector = proxies.find(
            (proxy) => proxy.code === `${section['.name']}-out`,
          );

          const links =
            section.proxy_config_type === 'selector'
              ? (section.selector_proxy_links ?? [])
              : [];
          const allCodes: string[] = selector?.value?.all ?? [];

          let outbounds;
          if (allCodes.length > 0) {
            outbounds = allCodes.map((code) => {
              const item = proxies.find((p) => p.code === code);
              let displayName = '';
              const linkMatch = code.match(
                new RegExp(`^${escapeRegExp(section['.name'])}-(\\d+)-out$`),
              );
              if (linkMatch) {
                const linkIndex = parseInt(linkMatch[1], 10) - 1;
                if (links[linkIndex]) {
                  displayName = getProxyUrlName(links[linkIndex]);
                }
              }
              if (!displayName) {
                displayName = item?.value?.name || code;
              }

              return {
                code,
                displayName,
                latency: item?.value?.history?.[0]?.delay || 0,
                type: item?.value?.type || '',
                selected: selector?.value?.now === code,
              };
            });
          } else {
            outbounds = links
              .map((link, index) => ({
                link,
                outbound: proxies.find(
                  (item) => item.code === `${section['.name']}-${index + 1}-out`,
                ),
              }))
              .map((item) => ({
                code: item?.outbound?.code || '',
                displayName:
                  getProxyUrlName(item.link) || item?.outbound?.value?.name || '',
                latency: item?.outbound?.value?.history?.[0]?.delay || 0,
                type: item?.outbound?.value?.type || '',
                selected: selector?.value?.now === item?.outbound?.code,
              }));
          }

          return {
            withTagSelect: true,
            code: selector?.code || section['.name'],
            displayName: section['.name'],
            outbounds,
          };
        }

        if (section.proxy_config_type === 'urltest') {
          const selector = proxies.find(
            (proxy) => proxy.code === `${section['.name']}-out`,
          );
          const outbound = proxies.find(
            (proxy) => proxy.code === `${section['.name']}-urltest-out`,
          );
          // the group lists its proxy links, then its fallback links
          const links = [
            ...(section.urltest_proxy_links ?? []),
            ...(section.urltest_fallback_links ?? []),
          ];

          const allCodes: string[] = outbound?.value?.all ?? [];
          let outbounds;
          if (allCodes.length > 0) {
            outbounds = allCodes.map((code, index) => {
              const item = proxies.find((p) => p.code === code);
              let displayName = '';
              const linkMatch = code.match(
                new RegExp(
                  `^${escapeRegExp(section['.name'])}-(?:fallback-)?(\\d+)-out$`,
                ),
              );
              if (linkMatch && links[index]) {
                displayName = getProxyUrlName(links[index]);
              }
              if (!displayName) {
                displayName = item?.value?.name || code;
              }

              return {
                code: item?.code || code,
                displayName,
                latency: item?.value?.history?.[0]?.delay || 0,
                type: item?.value?.type || '',
                selected: selector?.value?.now === (item?.code || code),
              };
            });
          } else {
            outbounds = (outbound?.value?.all ?? [])
              .map((code) => proxies.find((item) => item.code === code))
              .map((item, index) => ({
                code: item?.code || '',
                displayName:
                  getProxyUrlName(links[index]) || item?.value?.name || '',
                latency: item?.value?.history?.[0]?.delay || 0,
                type: item?.value?.type || '',
                selected: selector?.value?.now === item?.code,
              }));
          }

          return {
            withTagSelect: true,
            code: selector?.code || section['.name'],
            displayName: section['.name'],
            outbounds: [
              {
                code: outbound?.code || '',
                displayName: _('Fastest'),
                latency: outbound?.value?.history?.[0]?.delay || 0,
                type: outbound?.value?.type || '',
                selected: selector?.value?.now === outbound?.code,
              },
              ...outbounds,
            ],
          };
        }
      }

      if (section.connection_type === 'vpn') {
        const outbound = proxies.find(
          (proxy) => proxy.code === `${section['.name']}-out`,
        );

        return {
          withTagSelect: false,
          code: outbound?.code || section['.name'],
          displayName: section['.name'],
          outbounds: [
            {
              code: outbound?.code || section['.name'],
              displayName: section.interface || outbound?.value?.name || '',
              latency: outbound?.value?.history?.[0]?.delay || 0,
              type: outbound?.value?.type || '',
              selected: true,
            },
          ],
        };
      }

      return {
        withTagSelect: false,
        code: section['.name'],
        displayName: section['.name'],
        outbounds: [],
      };
    });

  return {
    success: true,
    data,
  };
}
