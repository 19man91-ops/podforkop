import { validateIP } from '../validators';
import { normalizeMac } from './macVendor';

type RpcCallFn = () => Promise<unknown>;

let callHostHints: RpcCallFn | undefined;
let callDHCPLeases: RpcCallFn | undefined;
let callNetworkInterfaceDump: RpcCallFn | undefined;

interface HostHintRecord {
  name?: string;
  ipaddrs?: string[];
  ip6addrs?: string[];
  macaddrs?: string[];
}

interface DHCPLeasesPayload {
  dhcp_leases?: DHCPLeaseRecord[];
  leases?: DHCPLeaseRecord[];
}

interface DHCPLeaseRecord {
  hostname?: string;
  ipaddr?: string;
  macaddr?: string;
  mac?: string;
}

interface StaticHostRecord {
  name?: string;
  ip?: string;
  mac?: string;
}

interface NetworkInterfaceAddress {
  address?: string;
}

interface NetworkInterfaceItem {
  'ipv4-address'?: (string | NetworkInterfaceAddress)[];
  'ipv6-address'?: (string | NetworkInterfaceAddress)[];
}

interface NetworkInterfacePayload {
  interface?: NetworkInterfaceItem[];
}

interface LuciRpcObject {
  declare: (options: {
    object: string;
    method: string;
    expect?: Record<string, unknown>;
  }) => RpcCallFn;
}

interface LuciUciObject {
  load: (package_name: string) => Promise<unknown>;
  sections: (package_name: string, type: string) => StaticHostRecord[];
}

interface LuciFsObject {
  read_direct: (path: string) => Promise<string>;
}

interface GlobalLuciContext {
  rpc?: LuciRpcObject;
  uci?: LuciUciObject;
  fs?: LuciFsObject;
  L?: {
    rpc?: LuciRpcObject;
    uci?: LuciUciObject;
    fs?: LuciFsObject;
  };
}

function getRpcObj(): LuciRpcObject | undefined {
  if (typeof rpc !== 'undefined' && rpc) return rpc as unknown as LuciRpcObject;
  const g = globalThis as unknown as GlobalLuciContext;
  if (g.L?.rpc) return g.L.rpc;
  if (g.rpc) return g.rpc;
  if (typeof window !== 'undefined') {
    const w = window as unknown as GlobalLuciContext;
    if (w.L?.rpc) return w.L.rpc;
  }
  return undefined;
}

function initRpcCalls(): void {
  const rpcObj = getRpcObj();
  if (!rpcObj || typeof rpcObj.declare !== 'function') return;

  if (!callHostHints) {
    try {
      callHostHints = rpcObj.declare({
        object: 'luci-rpc',
        method: 'getHostHints',
        expect: { '': {} },
      });
    } catch {
      // outside LuCI context
    }
  }

  if (!callDHCPLeases) {
    try {
      callDHCPLeases = rpcObj.declare({
        object: 'luci-rpc',
        method: 'getDHCPLeases',
        expect: { '': {} },
      });
    } catch {
      // outside LuCI context
    }
  }

  if (!callNetworkInterfaceDump) {
    try {
      callNetworkInterfaceDump = rpcObj.declare({
        object: 'network.interface',
        method: 'dump',
        expect: { interface: [] },
      });
    } catch {
      // outside LuCI context
    }
  }
}

export interface LocalDevices {
  names: Record<string, string>;
  macs: Record<string, string>;
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

  initRpcCalls();

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

  const g = globalThis as unknown as GlobalLuciContext;

  const uciObj =
    (typeof uci !== 'undefined' && (uci as unknown as LuciUciObject)) ||
    g.L?.uci ||
    g.uci;

  const uciDhcpPromise =
    uciObj && typeof uciObj.load === 'function'
      ? uciObj
          .load('dhcp')
          .then(() => uciObj.sections('dhcp', 'host'))
          .catch(() => [])
      : Promise.resolve([]);

  const fsObj =
    (typeof fs !== 'undefined' && (fs as unknown as LuciFsObject)) ||
    g.L?.fs ||
    g.fs;

  const leasesFilePromise =
    fsObj && typeof fsObj.read_direct === 'function'
      ? fsObj.read_direct('/tmp/dhcp.leases').catch(() => '')
      : Promise.resolve('');

  localDevicesPromise = Promise.all([
    hostHintsPromise,
    dhcpLeasesPromise,
    networkDumpPromise,
    uciDhcpPromise,
    leasesFilePromise,
  ])
    .then(
      ([
        hostHints,
        dhcpLeases,
        networkInterfaces,
        staticHosts,
        leasesContent,
      ]) => {
        const names: Record<string, string> = {};
        const macs: Record<string, string> = {};

        // Parse direct /tmp/dhcp.leases file (standard dnsmasq format: timestamp mac ip hostname client-id)
        if (typeof leasesContent === 'string' && leasesContent) {
          leasesContent.split('\n').forEach((line) => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              const ip = parts[2];
              const hostname = parts[3];
              const mac = normalizeMac(parts[1]);
              if (ip && mac && validateIP(ip).valid) {
                macs[ip] = mac;
              }
              if (ip && hostname && hostname !== '*' && validateIP(ip).valid) {
                names[ip] = normalizeName(hostname);
              }
            }
          });
        }

        // Parse host hints from RPC
        if (hostHints && typeof hostHints === 'object') {
          Object.values(hostHints as Record<string, HostHintRecord>).forEach(
            (hint) => {
              if (!hint || typeof hint !== 'object') return;
              const name = normalizeName(hint.name);
              const ipaddrs = [
                ...(Array.isArray(hint.ipaddrs) ? hint.ipaddrs : []),
                ...(Array.isArray(hint.ip6addrs) ? hint.ip6addrs : []),
              ];
              const hintMac = normalizeMac(
                Array.isArray(hint.macaddrs) ? hint.macaddrs[0] : '',
              );
              ipaddrs.forEach((ip: string) => {
                if (!ip || !validateIP(ip).valid) return;
                if (name) names[ip] = name;
                if (hintMac) macs[ip] = hintMac;
              });
            },
          );
        }

        // Parse DHCP leases from RPC
        const leaseEntries =
          (dhcpLeases as DHCPLeasesPayload)?.dhcp_leases ||
          (dhcpLeases as DHCPLeasesPayload)?.leases ||
          [];
        if (Array.isArray(leaseEntries)) {
          leaseEntries.forEach((lease) => {
            if (!lease || typeof lease !== 'object') return;
            const name = normalizeName(lease.hostname);
            const ip = `${lease.ipaddr || ''}`.trim();
            const mac = normalizeMac(lease.macaddr || lease.mac);
            if (ip && mac && validateIP(ip).valid) macs[ip] = mac;
            if (ip && name && validateIP(ip).valid) names[ip] = name;
          });
        }

        // Parse static hosts from UCI
        if (Array.isArray(staticHosts)) {
          (staticHosts as StaticHostRecord[]).forEach((host) => {
            if (!host || typeof host !== 'object') return;
            const name = normalizeName(host.name);
            const ip = `${host.ip || ''}`.trim();
            const mac = normalizeMac(host.mac);
            if (ip && mac && validateIP(ip).valid) macs[ip] = mac;
            if (ip && name && validateIP(ip).valid) names[ip] = name;
          });
        }

        // Exclude the router's own IPs so they are not misattributed
        const ifaceList: NetworkInterfaceItem[] = Array.isArray(
          networkInterfaces,
        )
          ? (networkInterfaces as NetworkInterfaceItem[])
          : ((networkInterfaces as NetworkInterfacePayload)?.interface ?? []);
        if (Array.isArray(ifaceList)) {
          ifaceList.forEach((iface) => {
            const ipv4 = Array.isArray(iface['ipv4-address'])
              ? iface['ipv4-address']
              : [];
            const ipv6 = Array.isArray(iface['ipv6-address'])
              ? iface['ipv6-address']
              : [];
            [...ipv4, ...ipv6].forEach((addr) => {
              const ip = typeof addr === 'string' ? addr : addr?.address;
              if (ip && names[ip]) {
                delete names[ip];
              }
              if (ip && macs[ip]) {
                delete macs[ip];
              }
            });
          });
        }

        localDevicesCache = { names, macs };
        return localDevicesCache;
      },
    )
    .catch(() => ({ names: {}, macs: {} }))
    .finally(() => {
      localDevicesPromise = null;
    });

  return localDevicesPromise;
}
