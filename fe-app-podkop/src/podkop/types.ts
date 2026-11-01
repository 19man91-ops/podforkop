// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ClashAPI {
  export interface ProxyHistoryEntry {
    time: string;
    delay: number;
  }

  export interface ProxyBase {
    type: string;
    name: string;
    udp: boolean;
    history: ProxyHistoryEntry[];
    now?: string;
    all?: string[];
  }

  export interface Proxies {
    proxies: Record<string, ProxyBase>;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Podkop {
  // Available commands:
  // start                   Start podkop service
  // stop                    Stop podkop service
  // reload                  Reload podkop configuration
  // restart                 Restart podkop service
  // enable                  Enable podkop autostart
  // disable                 Disable podkop autostart
  // list_update             Update domain lists
  // check_proxy             Check proxy connectivity
  // check_nft               Check NFT rules
  // check_nft_rules         Check NFT rules status
  // check_sing_box          Check sing-box installation and status
  // check_logs              Show podkop logs from system journal
  // check_fakeip            Test FakeIP on router
  // clash_api               Clash API interface for managing proxies and groups
  // show_config             Display current podkop configuration
  // show_version            Show podkop version
  // show_sing_box_config    Show sing-box configuration
  // show_sing_box_version   Show sing-box version
  // show_system_info        Show system information
  // get_status              Get podkop service status
  // get_sing_box_status     Get sing-box service status
  // check_dns_available     Check DNS server availability
  // global_check            Run global system check

  export enum AvailableMethods {
    CHECK_DNS_AVAILABLE = 'check_dns_available',
    CHECK_FAKEIP = 'check_fakeip',
    CHECK_NFT_RULES = 'check_nft_rules',
    GET_STATUS = 'get_status',
    CHECK_SING_BOX = 'check_sing_box',
    GET_SING_BOX_STATUS = 'get_sing_box_status',
    CLASH_API = 'clash_api',
    RESTART = 'restart',
    START = 'start',
    STOP = 'stop',
    ENABLE = 'enable',
    DISABLE = 'disable',
    GLOBAL_CHECK = 'global_check',
    SHOW_SING_BOX_CONFIG = 'show_sing_box_config',
    CHECK_LOGS = 'check_logs',
    GET_SYSTEM_INFO = 'get_system_info',
    GET_SING_BOX_FEATURES = 'get_sing_box_features',
    SUBSCRIPTION_INFO = 'subscription_info',
    ADD_DOMAIN = 'add_domain',
    ADD_DOMAIN_EXCLUSION = 'add_domain_exclusion',
    TELEGRAM_TEST = 'telegram_test',
    PRIVACY_TEST = 'privacy_test',
  }

  export enum AvailableClashAPIMethods {
    GET_PROXIES = 'get_proxies',
    GET_PROXY_LATENCY = 'get_proxy_latency',
    GET_GROUP_LATENCY = 'get_group_latency',
    SET_GROUP_PROXY = 'set_group_proxy',
    GET_CONNECTIONS = 'get_connections',
    CLOSE_CONNECTION = 'close_connection',
    CLOSE_CONNECTIONS = 'close_connections',
    SPEED_TEST = 'speed_test',
  }

  export interface ClashConnection {
    id?: string;
    start?: string;
    download?: number;
    upload?: number;
    chains?: string[];
    rule?: string;
    metadata?: {
      host?: string;
      destinationIP?: string;
      destinationPort?: string | number;
      sourceIP?: string;
      network?: string;
      type?: string;
    };
  }

  export interface ClashConnections {
    connections?: ClashConnection[];
    downloadTotal?: number;
    uploadTotal?: number;
  }

  export interface Outbound {
    code: string;
    displayName: string;
    latency: number;
    type: string;
    selected: boolean;
  }

  export interface OutboundGroup {
    withTagSelect: boolean;
    code: string;
    displayName: string;
    outbounds: Outbound[];
  }

  export type SubscriptionSourceStatus =
    | 'ok'
    | 'error'
    | 'local-file'
    | 'unsupported';

  export type SubscriptionSectionStatus = 'ok' | 'partial' | 'no-data';

  export interface SubscriptionSourceInfo {
    // Host name of the subscription URL or the local file name (no secrets)
    label: string;
    status: SubscriptionSourceStatus;
    upload: number;
    download: number;
    total: number;
    expire: number;
  }

  export interface SubscriptionSectionInfo {
    section: string;
    updated_at: number;
    upload: number;
    download: number;
    total: number;
    expire: number;
    status: SubscriptionSectionStatus;
    sources: SubscriptionSourceInfo[];
  }

  export interface SubscriptionInfo {
    updated_at: number;
    sections: SubscriptionSectionInfo[];
  }

  export interface AddDomainResult {
    success: boolean;
    section?: string;
    domain?: string;
    already_exists?: boolean;
    error?: string;
  }

  export interface SpeedTestResult {
    success: boolean;
    tag?: string;
    mbps?: number;
    seconds?: number;
    bytes?: number;
    error?: string;
  }

  export interface TelegramTestResult {
    success: boolean;
    error?: string;
  }

  export interface PrivacyEgressSection {
    section: string;
    status: 'ok' | 'error';
    ip: string;
    country: string;
  }

  export interface PrivacyTestResult {
    dns: {
      status: 'ok' | 'warning';
      details: string;
    };
    sections: PrivacyEgressSection[];
    mtu: {
      wan_interface: string;
      wan_mtu: number;
      lan_interface: string;
      lan_mtu: number;
      max_ping_payload: number;
      recommended_mss: number;
      mss_clamp_enabled: boolean;
    };
  }

  export interface ConfigProxyUrlTestSection {
    connection_type: 'proxy';
    proxy_config_type: 'urltest';
    urltest_proxy_links?: string[];
    urltest_subscription_urls?: string[];
    urltest_fallback_links?: string[];
    urltest_download_check?: 'default' | 'off' | 'custom';
    urltest_download_url?: string;
  }

  export interface ConfigProxySelectorSection {
    connection_type: 'proxy';
    proxy_config_type: 'selector';
    selector_proxy_links?: string[];
    selector_subscription_urls?: string[];
  }

  export interface ConfigProxySubscriptionSection {
    connection_type: 'proxy';
    proxy_config_type: 'subscription';
    subscription_urls?: string[];
    selector_subscription_urls?: string[];
  }

  export interface ConfigProxyUrlSection {
    connection_type: 'proxy';
    proxy_config_type: 'url';
    proxy_string: string;
  }

  export interface ConfigProxyOutboundSection {
    connection_type: 'proxy';
    proxy_config_type: 'outbound';
    outbound_json: string;
  }

  export interface ConfigVpnSection {
    connection_type: 'vpn';
    interface: string;
  }

  export interface ConfigBlockSection {
    connection_type: 'block';
  }

  export interface ConfigExclusionSection {
    connection_type: 'exclusion';
  }

  export type ConfigBaseSection =
    | ConfigProxyUrlTestSection
    | ConfigProxySelectorSection
    | ConfigProxySubscriptionSection
    | ConfigProxyUrlSection
    | ConfigProxyOutboundSection
    | ConfigVpnSection
    | ConfigBlockSection
    | ConfigExclusionSection;

  export type ConfigSection = ConfigBaseSection & {
    '.name': string;
    '.type': 'settings' | 'section';
    enabled?: string;
    label?: string;
    yacd_secret_key?: string;
  };

  export interface MethodSuccessResponse<T> {
    success: true;
    data: T;
  }

  export interface MethodFailureResponse {
    success: false;
    error: string;
  }

  export type MethodResponse<T> =
    | MethodSuccessResponse<T>
    | MethodFailureResponse;

  export interface DnsCheckResult {
    dns_type: 'udp' | 'doh' | 'dot';
    dns_server: string;
    dns_status: 0 | 1;
    dns_on_router: 0 | 1;
    bootstrap_dns_server: string;
    bootstrap_dns_status: 0 | 1;
    dhcp_config_status: 0 | 1;
  }

  export interface NftRulesCheckResult {
    table_exist: 0 | 1;
    rules_mangle_exist: 0 | 1;
    rules_mangle_counters: 0 | 1;
    rules_mangle_output_exist: 0 | 1;
    rules_mangle_output_counters: 0 | 1;
    rules_proxy_exist: 0 | 1;
    rules_proxy_counters: 0 | 1;
    rules_other_mark_exist: 0 | 1;
  }

  export interface SingBoxCheckResult {
    sing_box_installed: 0 | 1;
    sing_box_version_ok: 0 | 1;
    sing_box_service_exist: 0 | 1;
    sing_box_autostart_disabled: 0 | 1;
    sing_box_process_running: 0 | 1;
    sing_box_ports_listening: 0 | 1;
  }

  export interface FakeIPCheckResult {
    fakeip: boolean;
    IP: string;
  }

  export interface GetStatus {
    enabled: number;
    status: string;
  }

  export interface GetSingBoxStatus {
    running: number;
    enabled: number;
    status: string;
  }

  export interface GetSystemInfo {
    podkop_version: string;
    podkop_latest_version: string;
    luci_app_version: string;
    sing_box_version: string;
    openwrt_version: string;
    device_model: string;
  }

  export interface GetClashApiProxyLatency {
    delay: number;
    message?: string;
  }

  export type GetClashApiGroupLatency = Record<string, number>;
}
