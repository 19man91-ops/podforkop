import { insertIf } from '../../../../helpers';
import { DIAGNOSTICS_CHECKS_MAP } from './contstants';
import { PodkopShellMethods } from '../../../methods';
import { IDiagnosticsChecksItem } from '../../../services';
import { updateCheckStore } from './updateCheckStore';
import { getMeta } from '../helpers/getMeta';

export async function runDnsCheck() {
  const { order, title, code } = DIAGNOSTICS_CHECKS_MAP.DNS;

  updateCheckStore({
    order,
    code,
    title,
    description: _('Checking, please wait'),
    state: 'loading',
    items: [],
  });

  const dnsChecks = await PodkopShellMethods.checkDNSAvailable();

  if (!dnsChecks.success) {
    updateCheckStore({
      order,
      code,
      title,
      description: _('Cannot receive checks result'),
      state: 'error',
      items: [],
    });

    throw new Error('DNS checks failed');
  }

  const data = dnsChecks.data;

  const mainServers =
    data.dns_servers && data.dns_servers.length > 0
      ? data.dns_servers
      : [{ server: data.dns_server, status: data.dns_status }];
  const bootstrapServers =
    data.bootstrap_dns_servers && data.bootstrap_dns_servers.length > 0
      ? data.bootstrap_dns_servers
      : [
          {
            server: data.bootstrap_dns_server,
            status: data.bootstrap_dns_status,
          },
        ];

  const mainItems: IDiagnosticsChecksItem[] = mainServers.map((server) => ({
    state: server.status ? 'success' : 'error',
    key: _('Main DNS'),
    value: `${server.server} [${data.dns_type}]`,
  }));

  const bootstrapItems: IDiagnosticsChecksItem[] = insertIf(
    data.dns_type === 'doh' ||
      data.dns_type === 'dot' ||
      bootstrapServers.some((server) => !server.status),
    bootstrapServers.map((server) => ({
      state: server.status ? 'success' : 'error',
      key: _('Bootstrap DNS'),
      value: server.server,
    })),
  );

  const allGood =
    Boolean(data.dns_on_router) &&
    Boolean(data.dhcp_config_status) &&
    mainServers.every((server) => Boolean(server.status)) &&
    bootstrapServers.every((server) => Boolean(server.status));

  const atLeastOneGood =
    Boolean(data.dns_on_router) ||
    Boolean(data.dhcp_config_status) ||
    mainServers.some((server) => Boolean(server.status)) ||
    bootstrapServers.some((server) => Boolean(server.status));

  const { state, description } = getMeta({ atLeastOneGood, allGood });

  updateCheckStore({
    order,
    code,
    title,
    description,
    state,
    items: [
      ...bootstrapItems,
      ...mainItems,
      {
        state: data.dns_on_router ? 'success' : 'error',
        key: _('DNS on router'),
        value: '',
      },
      {
        state: data.dhcp_config_status ? 'success' : 'error',
        key: _('DHCP has DNS server'),
        value: '',
      },
    ],
  });

  if (!atLeastOneGood) {
    throw new Error('DNS checks failed');
  }
}
