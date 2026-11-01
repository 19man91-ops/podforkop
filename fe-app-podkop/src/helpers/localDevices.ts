import { validateIP } from '../validators';

type RpcCallFn = () => Promise<unknown>;

let callHostHints: RpcCallFn | undefined;
let callDHCPLeases: RpcCallFn | undefined;
let callNetworkInterfaceDump: RpcCallFn | undefined;

interface HostHintRecord {
  name?: string;
  ipaddrs?: string[];
}

interface DHCPLeasesPayload {
  dhcp_leases?: DHCPLeaseRecord[];
}

interface DHCPLeaseRecord {
  hostname?: string;
  ipaddr?: string;
}

interface StaticHostRecord {
  name?: string;
  ip?: string;
}

try {
  if (typeof rpc !== 'undefined' && typeof rpc.declare === 'function') {
    callHostHints = rpc.declare({
      object: 'luci-rpc',
      method: 'getHostHints',
      expect: { '': {} },
    });
    callDHCPLeases = rpc.declare({
      object: 'luci-rpc',
      method: 'getDHCPLeases',
      expect: { '': {} },
    });
    callNetworkInterfaceDump = rpc.declare({
      object: 'network.interface',
      method: 'dump',
      expect: { interface: [] },
    });
  }
} catch {
  // outside LuCI context
}

export interface LocalDevices {
  names: Record<string, string>;
}

let localDevicesCache: LocalDevices | null = null;
let localDevicesPromise: Promise<LocalDevices> | null = null;

function normalizeName(name: unknown): string {
  return `${name || ''}`.trim().replace(/\.lan$/i, '');
}

export function loadLocalDevices(): Promise<LocalDevices> {
  if (localDevicesCache) {
    return Promise.resolve(localDevicesCache);
  }
  if (localDevicesPromise) {
    return localDevicesPromise;
  }

  const hostHintsPromise =
    typeof callHostHints === 'function'
      ? callHostHints().catch(() => ({}))
      : Promise.resolve({});
  const dhcpLeasesPromise =
    typeof callDHCPLeases === 'function'
      ? callDHCPLeases().catch(() => ({}))
      : Promise.resolve({});
  const networkDumpPromise =
    typeof callNetworkInterfaceDump === 'function'
      ? callNetworkInterfaceDump().catch(() => ({}))
      : Promise.resolve({});
  const uciDhcpPromise =
    typeof uci !== 'undefined' && typeof uci.load === 'function'
      ? uci
          .load('dhcp')
          .then(() => uci.sections('dhcp', 'host'))
          .catch(() => [])
      : Promise.resolve([]);

  localDevicesPromise = Promise.all([
    hostHintsPromise,
    dhcpLeasesPromise,
    networkDumpPromise,
    uciDhcpPromise,
  ])
    .then(([hostHints, dhcpLeases, _networkInterfaces, staticHosts]) => {
      const names: Record<string, string> = {};

      if (hostHints && typeof hostHints === 'object') {
        Object.values(hostHints as Record<string, HostHintRecord>).forEach(
          (hint) => {
            if (!hint || typeof hint !== 'object') return;
            const name = normalizeName(hint.name);
            if (!name) return;
            const ipaddrs = Array.isArray(hint.ipaddrs) ? hint.ipaddrs : [];
            ipaddrs.forEach((ip: string) => {
              if (ip && validateIP(ip).valid) names[ip] = name;
            });
          },
        );
      }

      if (
        dhcpLeases &&
        typeof dhcpLeases === 'object' &&
        Array.isArray((dhcpLeases as DHCPLeasesPayload).dhcp_leases)
      ) {
        ((dhcpLeases as DHCPLeasesPayload).dhcp_leases || []).forEach(
          (lease) => {
            if (!lease || typeof lease !== 'object') return;
            const name = normalizeName(lease.hostname);
            const ip = `${lease.ipaddr || ''}`.trim();
            if (ip && name && validateIP(ip).valid) names[ip] = name;
          },
        );
      }

      if (Array.isArray(staticHosts)) {
        (staticHosts as StaticHostRecord[]).forEach((host) => {
          if (!host || typeof host !== 'object') return;
          const name = normalizeName(host.name);
          const ip = `${host.ip || ''}`.trim();
          if (ip && name && validateIP(ip).valid) names[ip] = name;
        });
      }

      localDevicesCache = { names };
      return localDevicesCache;
    })
    .catch(() => ({ names: {} }))
    .finally(() => {
      localDevicesPromise = null;
    });

  return localDevicesPromise;
}
