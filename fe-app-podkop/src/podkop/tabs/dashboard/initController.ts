import {
  getClashWsUrl,
  onMount,
  preserveScrollForPage,
} from '../../../helpers';
import { prettyBytes } from '../../../helpers/prettyBytes';
import { showToast } from '../../../helpers/showToast';
import { CustomPodkopMethods, PodkopShellMethods } from '../../methods';
import { logger, socket, store, StoreType } from '../../services';
import { renderSections, renderSubscriptions, renderWidget } from './partials';
import { fetchServicesInfo } from '../../fetchers';
import { getClashApiSecret } from '../../methods/custom/getClashApiSecret';
// Manual per-node download speed test results
const speedResults: Record<string, string> = {};
let speedTestingTag = '';

// Subscription info: refresh automatically when the cached data is older than
// 30 minutes, but not more often than once per 10 minutes per page session.
const SUBSCRIPTIONS_STALE_SECONDS = 30 * 60;
const SUBSCRIPTIONS_AUTO_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
let lastSubscriptionsAutoRefreshAt = 0;

// Fetchers

async function fetchDashboardSections() {
  const prev = store.get().sectionsWidget;

  store.set({
    sectionsWidget: {
      ...prev,
      failed: false,
    },
  });

  const { data, success } = await CustomPodkopMethods.getDashboardSections();

  if (!success) {
    logger.error('[DASHBOARD]', 'fetchDashboardSections: failed to fetch');
  }

  store.set({
    sectionsWidget: {
      latencyFetching: false,
      loading: false,
      failed: !success,
      data,
    },
  });
}

async function fetchSubscriptionsInfo() {
  const prev = store.get().subscriptionsWidget;

  store.set({
    subscriptionsWidget: {
      ...prev,
      loading: prev.data.length === 0,
      failed: false,
    },
  });

  const response = await PodkopShellMethods.getSubscriptionInfo();
  const success = response.success;
  const data = response.success ? response.data : null;

  store.set({
    subscriptionsWidget: {
      loading: false,
      failed: !success,
      refreshing: false,
      updatedAt: success ? (data?.updated_at ?? 0) : 0,
      data: success ? (data?.sections ?? []) : [],
    },
  });

  return success ? data : null;
}

async function handleRefreshSubscriptions() {
  const prev = store.get().subscriptionsWidget;

  if (prev.refreshing) {
    return;
  }

  lastSubscriptionsAutoRefreshAt = Date.now();
  store.set({
    subscriptionsWidget: {
      ...prev,
      refreshing: true,
    },
  });

  const { success } = await PodkopShellMethods.refreshSubscriptionInfo();

  if (!success) {
    logger.error('[DASHBOARD]', 'handleRefreshSubscriptions: refresh failed');
  }

  await fetchSubscriptionsInfo();
}

async function refreshSubscriptionsIfStale() {
  const widget = store.get().subscriptionsWidget;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (widget.loading || widget.refreshing || widget.data.length === 0) {
    return;
  }

  if (nowSeconds - widget.updatedAt < SUBSCRIPTIONS_STALE_SECONDS) {
    return;
  }

  if (
    Date.now() - lastSubscriptionsAutoRefreshAt <
    SUBSCRIPTIONS_AUTO_REFRESH_COOLDOWN_MS
  ) {
    return;
  }

  await handleRefreshSubscriptions();
}

async function connectToClashSockets() {
  const clashApiSecret = await getClashApiSecret();

  socket.subscribe(
    `${getClashWsUrl()}/traffic?token=${clashApiSecret}`,
    (msg) => {
      const parsedMsg = JSON.parse(msg);

      store.set({
        bandwidthWidget: {
          loading: false,
          failed: false,
          data: { up: parsedMsg.up, down: parsedMsg.down },
        },
      });
    },
    (_err) => {
      logger.error(
        '[DASHBOARD]',
        'connectToClashSockets - traffic: failed to connect to',
        getClashWsUrl(),
      );
      store.set({
        bandwidthWidget: {
          loading: false,
          failed: true,
          data: { up: 0, down: 0 },
        },
      });
    },
  );

  socket.subscribe(
    `${getClashWsUrl()}/connections?token=${clashApiSecret}`,
    (msg) => {
      const parsedMsg = JSON.parse(msg);

      store.set({
        trafficTotalWidget: {
          loading: false,
          failed: false,
          data: {
            downloadTotal: parsedMsg.downloadTotal,
            uploadTotal: parsedMsg.uploadTotal,
          },
        },
        systemInfoWidget: {
          loading: false,
          failed: false,
          data: {
            connections: parsedMsg.connections?.length,
            memory: parsedMsg.memory,
          },
        },
      });
    },
    (_err) => {
      logger.error(
        '[DASHBOARD]',
        'connectToClashSockets - connections: failed to connect to',
        getClashWsUrl(),
      );
      store.set({
        trafficTotalWidget: {
          loading: false,
          failed: true,
          data: { downloadTotal: 0, uploadTotal: 0 },
        },
        systemInfoWidget: {
          loading: false,
          failed: true,
          data: {
            connections: 0,
            memory: 0,
          },
        },
      });
    },
  );
}

// Handlers

async function handleChooseOutbound(selector: string, tag: string) {
  try {
    const response = await PodkopShellMethods.setClashApiGroupProxy(
      selector,
      tag,
    );

    if (!response.success) {
      throw new Error(response.error);
    }

    await fetchDashboardSections();
  } catch (error) {
    logger.error('[DASHBOARD]', 'handleChooseOutbound failed', error);
    ui.addNotification(
      null,
      E('p', {}, _('Failed to switch the active server')),
      'error',
    );
  }
}

async function handleTestSpeed(tag: string) {
  if (!tag || speedTestingTag === tag) {
    return;
  }

  speedTestingTag = tag;
  await renderSectionsWidget();

  try {
    const response = await PodkopShellMethods.speedTest(tag);
    const result = response.success ? response.data : null;
    const succeeded = Boolean(
      result?.success && typeof result.mbps === 'number',
    );
    speedResults[tag] = succeeded ? `${result?.mbps} Mbps` : 'N/A';
    if (!succeeded) {
      showToast(_('Speed test failed'), 'error');
    }
  } catch (error) {
    logger.error('[DASHBOARD]', 'handleTestSpeed failed', error);
    speedResults[tag] = 'N/A';
  }

  speedTestingTag = '';
  await renderSectionsWidget();
}

async function handleTestGroupLatency(tag: string) {
  store.set({
    sectionsWidget: {
      ...store.get().sectionsWidget,
      latencyFetching: true,
    },
  });

  await PodkopShellMethods.getClashApiGroupLatency(tag);
  await fetchDashboardSections();

  store.set({
    sectionsWidget: {
      ...store.get().sectionsWidget,
      latencyFetching: false,
    },
  });
}

async function handleTestProxyLatency(tag: string) {
  store.set({
    sectionsWidget: {
      ...store.get().sectionsWidget,
      latencyFetching: true,
    },
  });

  await PodkopShellMethods.getClashApiProxyLatency(tag);
  await fetchDashboardSections();

  store.set({
    sectionsWidget: {
      ...store.get().sectionsWidget,
      latencyFetching: false,
    },
  });
}

// Renderer

async function renderSectionsWidget() {
  logger.debug('[DASHBOARD]', 'renderSectionsWidget');
  const sectionsWidget = store.get().sectionsWidget;
  const container = document.getElementById('dashboard-sections-grid');

  if (sectionsWidget.loading || sectionsWidget.failed) {
    const renderedWidget = renderSections({
      loading: sectionsWidget.loading,
      failed: sectionsWidget.failed,
      section: {
        code: '',
        displayName: '',
        outbounds: [],
        withTagSelect: false,
      },
      onTestLatency: () => {},
      onChooseOutbound: () => {},
      latencyFetching: sectionsWidget.latencyFetching,
    });

    return preserveScrollForPage(() => {
      container!.replaceChildren(renderedWidget);
    });
  }

  const renderedWidgets = sectionsWidget.data.map((section) =>
    renderSections({
      loading: sectionsWidget.loading,
      failed: sectionsWidget.failed,
      section,
      latencyFetching: sectionsWidget.latencyFetching,
      onTestLatency: (tag) => {
        if (section.withTagSelect) {
          return handleTestGroupLatency(tag);
        }

        return handleTestProxyLatency(tag);
      },
      onChooseOutbound: (selector, tag) => {
        handleChooseOutbound(selector, tag);
      },
      onTestSpeed: (tag) => {
        void handleTestSpeed(tag);
      },
      speedResults,
      speedTestingTag,
    }),
  );

  return preserveScrollForPage(() => {
    container!.replaceChildren(...renderedWidgets);
  });
}

async function renderSubscriptionsWidget() {
  logger.debug('[DASHBOARD]', 'renderSubscriptionsWidget');
  const subscriptionsWidget = store.get().subscriptionsWidget;
  const container = document.getElementById('dashboard-subscriptions');

  if (!container) {
    return;
  }

  const renderedWidget = renderSubscriptions({
    loading: subscriptionsWidget.loading,
    failed: subscriptionsWidget.failed,
    refreshing: subscriptionsWidget.refreshing,
    updatedAt: subscriptionsWidget.updatedAt,
    data: subscriptionsWidget.data,
    onRefresh: () => {
      void handleRefreshSubscriptions();
    },
  });

  return preserveScrollForPage(() => {
    container.replaceChildren(renderedWidget);
  });
}

async function renderBandwidthWidget() {
  logger.debug('[DASHBOARD]', 'renderBandwidthWidget');
  const traffic = store.get().bandwidthWidget;

  const container = document.getElementById('dashboard-widget-traffic');

  if (traffic.loading || traffic.failed) {
    const renderedWidget = renderWidget({
      loading: traffic.loading,
      failed: traffic.failed,
      title: '',
      items: [],
    });

    return container!.replaceChildren(renderedWidget);
  }

  const renderedWidget = renderWidget({
    loading: traffic.loading,
    failed: traffic.failed,
    title: _('Traffic'),
    items: [
      { key: _('Uplink'), value: `${prettyBytes(traffic.data.up)}/s` },
      { key: _('Downlink'), value: `${prettyBytes(traffic.data.down)}/s` },
    ],
  });

  container!.replaceChildren(renderedWidget);
}

async function renderTrafficTotalWidget() {
  logger.debug('[DASHBOARD]', 'renderTrafficTotalWidget');
  const trafficTotalWidget = store.get().trafficTotalWidget;

  const container = document.getElementById('dashboard-widget-traffic-total');

  if (trafficTotalWidget.loading || trafficTotalWidget.failed) {
    const renderedWidget = renderWidget({
      loading: trafficTotalWidget.loading,
      failed: trafficTotalWidget.failed,
      title: '',
      items: [],
    });

    return container!.replaceChildren(renderedWidget);
  }

  const renderedWidget = renderWidget({
    loading: trafficTotalWidget.loading,
    failed: trafficTotalWidget.failed,
    title: _('Traffic Total'),
    items: [
      {
        key: _('Uplink'),
        value: String(prettyBytes(trafficTotalWidget.data.uploadTotal)),
      },
      {
        key: _('Downlink'),
        value: String(prettyBytes(trafficTotalWidget.data.downloadTotal)),
      },
    ],
  });

  container!.replaceChildren(renderedWidget);
}

async function renderSystemInfoWidget() {
  logger.debug('[DASHBOARD]', 'renderSystemInfoWidget');
  const systemInfoWidget = store.get().systemInfoWidget;

  const container = document.getElementById('dashboard-widget-system-info');

  if (systemInfoWidget.loading || systemInfoWidget.failed) {
    const renderedWidget = renderWidget({
      loading: systemInfoWidget.loading,
      failed: systemInfoWidget.failed,
      title: '',
      items: [],
    });

    return container!.replaceChildren(renderedWidget);
  }

  const renderedWidget = renderWidget({
    loading: systemInfoWidget.loading,
    failed: systemInfoWidget.failed,
    title: _('System info'),
    items: [
      {
        key: _('Active Connections'),
        value: String(systemInfoWidget.data.connections),
      },
      {
        key: _('Memory Usage'),
        value: String(prettyBytes(systemInfoWidget.data.memory)),
      },
    ],
  });

  container!.replaceChildren(renderedWidget);
}

async function renderServicesInfoWidget() {
  logger.debug('[DASHBOARD]', 'renderServicesInfoWidget');
  const servicesInfoWidget = store.get().servicesInfoWidget;

  const container = document.getElementById('dashboard-widget-service-info');

  if (servicesInfoWidget.loading || servicesInfoWidget.failed) {
    const renderedWidget = renderWidget({
      loading: servicesInfoWidget.loading,
      failed: servicesInfoWidget.failed,
      title: '',
      items: [],
    });

    return container!.replaceChildren(renderedWidget);
  }

  const renderedWidget = renderWidget({
    loading: servicesInfoWidget.loading,
    failed: servicesInfoWidget.failed,
    title: _('Services info'),
    items: [
      {
        key: _('Podkop'),
        value: servicesInfoWidget.data.podkop
          ? _('✔ Enabled')
          : _('✘ Disabled'),
        attributes: {
          class: servicesInfoWidget.data.podkop
            ? 'pdk_dashboard-page__widgets-section__item__row--success'
            : 'pdk_dashboard-page__widgets-section__item__row--error',
        },
      },
      {
        key: _('Sing-box'),
        value: servicesInfoWidget.data.singbox
          ? _('✔ Running')
          : _('✘ Stopped'),
        attributes: {
          class: servicesInfoWidget.data.singbox
            ? 'pdk_dashboard-page__widgets-section__item__row--success'
            : 'pdk_dashboard-page__widgets-section__item__row--error',
        },
      },
    ],
  });

  container!.replaceChildren(renderedWidget);
}

async function onStoreUpdate(
  next: StoreType,
  prev: StoreType,
  diff: Partial<StoreType>,
) {
  if (diff.sectionsWidget) {
    renderSectionsWidget();
  }

  if (diff.subscriptionsWidget) {
    renderSubscriptionsWidget();
  }

  if (diff.bandwidthWidget) {
    renderBandwidthWidget();
  }

  if (diff.trafficTotalWidget) {
    renderTrafficTotalWidget();
  }

  if (diff.systemInfoWidget) {
    renderSystemInfoWidget();
  }

  if (diff.servicesInfoWidget) {
    renderServicesInfoWidget();
  }
}

async function onPageMount() {
  // Cleanup before mount
  onPageUnmount();

  // Add new listener
  store.subscribe(onStoreUpdate);

  // Initial sections fetch
  await fetchDashboardSections();
  await fetchSubscriptionsInfo();
  void refreshSubscriptionsIfStale();
  await fetchServicesInfo();
  await connectToClashSockets();
}

function onPageUnmount() {
  // Remove old listener
  store.unsubscribe(onStoreUpdate);
  // Clear store
  store.reset([
    'bandwidthWidget',
    'trafficTotalWidget',
    'systemInfoWidget',
    'servicesInfoWidget',
    'sectionsWidget',
    'subscriptionsWidget',
  ]);
  Object.keys(speedResults).forEach((key) => delete speedResults[key]);
  speedTestingTag = '';
  socket.resetAll();
}

function registerLifecycleListeners() {
  store.subscribe((next, prev, diff) => {
    if (
      diff.tabService &&
      next.tabService.current !== prev.tabService.current
    ) {
      logger.debug(
        '[DASHBOARD]',
        'active tab diff event, active tab:',
        diff.tabService.current,
      );
      const isDashboardVisible = next.tabService.current === 'dashboard';

      if (isDashboardVisible) {
        logger.debug(
          '[DASHBOARD]',
          'registerLifecycleListeners',
          'onPageMount',
        );
        return onPageMount();
      }

      if (!isDashboardVisible) {
        logger.debug(
          '[DASHBOARD]',
          'registerLifecycleListeners',
          'onPageUnmount',
        );
        return onPageUnmount();
      }
    }
  });
}

export async function initController(): Promise<void> {
  onMount('dashboard-status').then(() => {
    logger.debug('[DASHBOARD]', 'initController', 'onMount');
    onPageMount();
    registerLifecycleListeners();
  });
}
