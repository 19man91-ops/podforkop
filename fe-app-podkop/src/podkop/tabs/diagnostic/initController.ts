import { onMount, preserveScrollForPage, withTimeout } from '../../../helpers';
import { runDnsCheck } from './checks/runDnsCheck';
import { runSingBoxCheck } from './checks/runSingBoxCheck';
import { runNftCheck } from './checks/runNftCheck';
import { runFakeIPCheck } from './checks/runFakeIPCheck';
import { loadingDiagnosticsChecksStore } from './diagnostic.store';
import { logger, store, StoreType } from '../../services';
import {
  renderAvailableActions,
  renderCheckSection,
  renderRunAction,
  renderSystemInfo,
} from './partials';
import { PodkopShellMethods } from '../../methods';
import { fetchServicesInfo } from '../../fetchers';
import { normalizeCompiledVersion } from '../../../helpers/normalizeCompiledVersion';
import { renderModal } from '../../../partials';
import { PODKOP_LUCI_APP_VERSION } from '../../../constants';
import { showToast } from '../../../helpers/showToast';
import { runSectionsCheck } from './checks/runSectionsCheck';
import { getPodkopVersionRow } from './helpers/getPodkopVersionRow';
import { DIAGNOSTICS_CHECKS } from './checks/contstants';

async function fetchSystemInfo() {
  const systemInfo = await PodkopShellMethods.getSystemInfo();

  if (systemInfo.success) {
    store.set({
      diagnosticsSystemInfo: {
        loading: false,
        ...systemInfo.data,
      },
    });
  } else {
    store.set({
      diagnosticsSystemInfo: {
        loading: false,
        podkop_version: _('unknown'),
        podkop_latest_version: _('unknown'),
        luci_app_version: _('unknown'),
        sing_box_version: _('unknown'),
        openwrt_version: _('unknown'),
        device_model: _('unknown'),
        core_family: _('unknown'),
        core_variant: _('unknown'),
        core_package: _('unknown'),
        core_package_version: _('unknown'),
      },
    });
  }
}

function renderDiagnosticsChecks() {
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticsChecks');
  const diagnosticsChecks = store
    .get()
    .diagnosticsChecks.sort((a, b) => a.order - b.order);
  const container = document.getElementById('pdk_diagnostic-page-checks');

  const renderedDiagnosticsChecks = diagnosticsChecks.map((check) =>
    renderCheckSection(check),
  );

  return preserveScrollForPage(() => {
    container!.replaceChildren(...renderedDiagnosticsChecks);
  });
}

function renderDiagnosticRunActionWidget() {
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticRunActionWidget');

  const { loading } = store.get().diagnosticsRunAction;
  const container = document.getElementById('pdk_diagnostic-page-run-check');

  const renderedAction = renderRunAction({
    loading,
    click: () => runChecks(),
  });

  return preserveScrollForPage(() => {
    container!.replaceChildren(renderedAction);
  });
}

async function handleRestart() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      restart: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.restart();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleRestart - e', e);
  } finally {
    setTimeout(async () => {
      await fetchServicesInfo();
      store.set({
        diagnosticsActions: {
          ...diagnosticsActions,
          restart: { loading: false },
        },
      });
      store.reset(['diagnosticsChecks']);
    }, 5000);
  }
}

async function handleStop() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      stop: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.stop();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleStop - e', e);
  } finally {
    await fetchServicesInfo();
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        stop: { loading: false },
      },
    });
    store.reset(['diagnosticsChecks']);
  }
}

async function handleStart() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      start: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.start();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleStart - e', e);
  } finally {
    setTimeout(async () => {
      await fetchServicesInfo();
      store.set({
        diagnosticsActions: {
          ...diagnosticsActions,
          start: { loading: false },
        },
      });
      store.reset(['diagnosticsChecks']);
    }, 5000);
  }
}

async function handleEnable() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      enable: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.enable();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleEnable - e', e);
  } finally {
    await fetchServicesInfo();
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        enable: { loading: false },
      },
    });
  }
}

async function handleDisable() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      disable: { loading: true },
    },
  });

  try {
    await PodkopShellMethods.disable();
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleDisable - e', e);
  } finally {
    await fetchServicesInfo();
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        disable: { loading: false },
      },
    });
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((part) => parseInt(part, 10) || 0);
  const partsB = b
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((part) => parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const valueA = partsA[index] ?? 0;
    const valueB = partsB[index] ?? 0;
    if (valueA > valueB) {
      return 1;
    }
    if (valueA < valueB) {
      return -1;
    }
  }

  return 0;
}

function isUpdateAvailable(): boolean {
  const systemInfo = store.get().diagnosticsSystemInfo;

  if (systemInfo.loading) {
    return false;
  }

  const latest = (systemInfo.podkop_latest_version || '').replace(/^v/, '');
  const current = (systemInfo.podkop_version || '').replace(/^v/, '');

  if (
    !latest ||
    latest === 'unknown' ||
    latest === 'loading' ||
    latest === current
  ) {
    return false;
  }

  return compareVersions(latest, current) > 0;
}

function renderUpdateLog(output: string) {
  return E(
    'pre',
    { class: 'pdk_diagnostic-page__update-log' },
    output && output.trim() ? output : _('No output'),
  );
}

async function handleUpdatePodkop() {
  const systemInfo = store.get().diagnosticsSystemInfo;
  const from = systemInfo.podkop_version.replace(/^v/, '');
  const to = systemInfo.podkop_latest_version.replace(/^v/, '');

  const runUpdate = async () => {
    const diagnosticsActions = store.get().diagnosticsActions;
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        update: { loading: true },
      },
    });

    ui.showModal(
      _('Updating PodForCOP'),
      E('div', { class: 'pdk_diagnostic-page__update' }, [
        E(
          'p',
          { class: 'spinning' },
          _(
            'Downloading and installing the update. This can take a few minutes. Do not close this page.',
          ),
        ),
        E(
          'pre',
          { class: 'pdk_diagnostic-page__update-log' },
          _('Please wait...'),
        ),
      ]),
    );

    try {
      const response = await PodkopShellMethods.updateToLatest();

      if (!response.success) {
        throw new Error(response.error || _('Update failed'));
      }

      const data = response.data;
      const output = String(data.output || '').replace(/\\n/g, '\n');

      ui.showModal(
        data.success ? _('Update completed') : _('Update failed'),
        E('div', { class: 'pdk_diagnostic-page__update' }, [
          E(
            'p',
            {},
            data.success
              ? _(
                  'PodForCOP has been updated. Reload the page to use the new interface.',
                )
              : _(
                  'The update failed. The output below may help to diagnose the problem.',
                ),
          ),
          renderUpdateLog(output),
          E('div', { class: 'pdk_diagnostic-page__update-actions' }, [
            ...(data.success
              ? [
                  E(
                    'button',
                    {
                      class: 'btn cbi-button cbi-button-apply',
                      click: () => window.location.reload(),
                    },
                    _('Reload page'),
                  ),
                ]
              : []),
            E(
              'button',
              {
                class: 'btn cbi-button',
                click: () => ui.hideModal(),
              },
              _('Close'),
            ),
          ]),
        ]),
      );

      if (data.success) {
        showToast(_('Update completed'), 'success');
      } else {
        showToast(_('Update failed'), 'error');
      }
    } catch (e) {
      logger.error('[DIAGNOSTIC]', 'handleUpdatePodkop - e', e);
      const message = e instanceof Error ? e.message : String(e);
      ui.showModal(
        _('Update failed'),
        E('div', { class: 'pdk_diagnostic-page__update' }, [
          E('p', {}, _('The update failed. Check the output below.')),
          renderUpdateLog(message),
          E('div', { class: 'pdk_diagnostic-page__update-actions' }, [
            E(
              'button',
              {
                class: 'btn cbi-button',
                click: () => ui.hideModal(),
              },
              _('Close'),
            ),
          ]),
        ]),
      );
      showToast(_('Update failed'), 'error');
    } finally {
      store.set({
        diagnosticsActions: {
          ...store.get().diagnosticsActions,
          update: { loading: false },
        },
      });
    }
  };

  ui.showModal(
    _('Update PodForCOP'),
    E('div', { class: 'pdk_diagnostic-page__update' }, [
      E(
        'p',
        {},
        _(
          'A new version is available: {from} → {to}. PodForCOP will download the official packages, verify their SHA256 checksums, install them and restart the service.',
        )
          .replace('{from}', from)
          .replace('{to}', to),
      ),
      E(
        'p',
        {},
        _(
          'Your settings and sections are kept. The service will be restarted after the update.',
        ),
      ),
      E('div', { class: 'pdk_diagnostic-page__update-actions' }, [
        E(
          'button',
          {
            class: 'btn cbi-button',
            click: () => ui.hideModal(),
          },
          _('Cancel'),
        ),
        E(
          'button',
          {
            class: 'btn cbi-button cbi-button-apply',
            click: runUpdate,
          },
          _('Update'),
        ),
      ]),
    ]),
  );
}

async function handlePrivacyTest() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      privacyTest: { loading: true },
    },
  });

  try {
    const response = await PodkopShellMethods.privacyTest();

    if (!response.success) {
      throw new Error(response.error);
    }

    const data = response.data;

    ui.showModal(
      _('Privacy & leak test'),
      E('div', { class: 'pdk_diagnostic-page__privacy' }, [
        E('h4', {}, _('DNS leak test')),
        E('p', {}, [
          `${data.dns.status === 'ok' ? _('No leaks detected') : _('Check recommended')}. ${data.dns.details}`,
        ]),
        E('h4', {}, _('Egress IP by section')),
        ...(data.sections.length
          ? data.sections.map((section) =>
              E('p', {}, [
                `${section.section}: ${
                  section.status === 'ok'
                    ? `${section.ip} (${section.country})`
                    : _('unavailable')
                }`,
              ]),
            )
          : [E('p', {}, _('No proxy sections'))]),
        E('h4', {}, _('MTU / MSS')),
        E('p', {}, [
          `${_('WAN')}: ${data.mtu.wan_interface} — MTU ${data.mtu.wan_mtu}`,
        ]),
        E('p', {}, [
          `${_('LAN')}: ${data.mtu.lan_interface} — MTU ${data.mtu.lan_mtu}`,
        ]),
        E('p', {}, [
          `${_('Max ping payload')}: ${data.mtu.max_ping_payload}; ${_('Recommended MSS')}: ${data.mtu.recommended_mss} (${
            data.mtu.mss_clamp_enabled
              ? _('MSS clamp enabled')
              : _('MSS clamp not found')
          })`,
        ]),
        E('div', { class: 'pdk_diagnostic-page__privacy-actions' }, [
          E(
            'button',
            {
              class: 'btn cbi-button',
              click: () => ui.hideModal(),
            },
            _('Close'),
          ),
        ]),
      ]),
    );
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handlePrivacyTest - e', e);
    showToast(_('Failed to run privacy test'), 'error');
  } finally {
    store.set({
      diagnosticsActions: {
        ...store.get().diagnosticsActions,
        privacyTest: { loading: false },
      },
    });
  }
}

async function handleShowGlobalCheck() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      globalCheck: { loading: true },
    },
  });

  try {
    const globalCheck = await PodkopShellMethods.globalCheck();

    if (globalCheck.success) {
      ui.showModal(
        _('Global check'),
        renderModal(globalCheck.data as string, 'global_check'),
      );
    } else {
      logger.error('[DIAGNOSTIC]', 'handleShowGlobalCheck - e', globalCheck);
      showToast(_('Failed to execute!'), 'error');
    }
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleShowGlobalCheck - e', e);
    showToast(_('Failed to execute!'), 'error');
  } finally {
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        globalCheck: { loading: false },
      },
    });
  }
}

async function handleViewLogs() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      viewLogs: { loading: true },
    },
  });

  try {
    const viewLogs = await PodkopShellMethods.checkLogs();

    if (viewLogs.success) {
      ui.showModal(
        _('View logs'),
        renderModal(viewLogs.data as string, 'view_logs'),
      );
    } else {
      logger.error('[DIAGNOSTIC]', 'handleViewLogs - e', viewLogs);
      showToast(_('Failed to execute!'), 'error');
    }
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleViewLogs - e', e);
    showToast(_('Failed to execute!'), 'error');
  } finally {
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        viewLogs: { loading: false },
      },
    });
  }
}

async function handleShowSingBoxConfig() {
  const diagnosticsActions = store.get().diagnosticsActions;
  store.set({
    diagnosticsActions: {
      ...diagnosticsActions,
      showSingBoxConfig: { loading: true },
    },
  });

  try {
    const showSingBoxConfig = await PodkopShellMethods.showSingBoxConfig();

    if (showSingBoxConfig.success) {
      ui.showModal(
        _('Show sing-box config'),
        renderModal(
          JSON.stringify(showSingBoxConfig.data, null, 2),
          'show_sing_box_config',
        ),
      );
    } else {
      logger.error(
        '[DIAGNOSTIC]',
        'handleShowSingBoxConfig - e',
        showSingBoxConfig,
      );
      showToast(_('Failed to execute!'), 'error');
    }
  } catch (e) {
    logger.error('[DIAGNOSTIC]', 'handleShowSingBoxConfig - e', e);
    showToast(_('Failed to execute!'), 'error');
  } finally {
    store.set({
      diagnosticsActions: {
        ...diagnosticsActions,
        showSingBoxConfig: { loading: false },
      },
    });
  }
}

function renderDiagnosticAvailableActionsWidget() {
  const diagnosticsActions = store.get().diagnosticsActions;
  const servicesInfoWidget = store.get().servicesInfoWidget;
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticAvailableActionsWidget');

  const podkopEnabled = Boolean(servicesInfoWidget.data.podkop);
  const singBoxRunning = Boolean(servicesInfoWidget.data.singbox);
  const atLeastOneServiceCommandLoading =
    servicesInfoWidget.loading ||
    diagnosticsActions.restart.loading ||
    diagnosticsActions.start.loading ||
    diagnosticsActions.stop.loading;

  const container = document.getElementById('pdk_diagnostic-page-actions');

  const renderedActions = renderAvailableActions({
    restart: {
      loading: diagnosticsActions.restart.loading,
      visible: true,
      onClick: handleRestart,
      disabled: atLeastOneServiceCommandLoading,
    },
    start: {
      loading: diagnosticsActions.start.loading,
      visible: !singBoxRunning,
      onClick: handleStart,
      disabled: atLeastOneServiceCommandLoading,
    },
    stop: {
      loading: diagnosticsActions.stop.loading,
      visible: singBoxRunning,
      onClick: handleStop,
      disabled: atLeastOneServiceCommandLoading,
    },
    enable: {
      loading: diagnosticsActions.enable.loading,
      visible: !podkopEnabled,
      onClick: handleEnable,
      disabled: atLeastOneServiceCommandLoading,
    },
    disable: {
      loading: diagnosticsActions.disable.loading,
      visible: podkopEnabled,
      onClick: handleDisable,
      disabled: atLeastOneServiceCommandLoading,
    },
    globalCheck: {
      loading: diagnosticsActions.globalCheck.loading,
      visible: true,
      onClick: handleShowGlobalCheck,
      disabled: atLeastOneServiceCommandLoading,
    },
    viewLogs: {
      loading: diagnosticsActions.viewLogs.loading,
      visible: true,
      onClick: handleViewLogs,
      disabled: atLeastOneServiceCommandLoading,
    },
    privacyTest: {
      loading: diagnosticsActions.privacyTest.loading,
      visible: true,
      onClick: handlePrivacyTest,
      disabled: atLeastOneServiceCommandLoading,
    },
    update: {
      loading: diagnosticsActions.update.loading,
      visible: isUpdateAvailable(),
      onClick: handleUpdatePodkop,
      disabled: atLeastOneServiceCommandLoading,
    },
    showSingBoxConfig: {
      loading: diagnosticsActions.showSingBoxConfig.loading,
      visible: true,
      onClick: handleShowSingBoxConfig,
      disabled: atLeastOneServiceCommandLoading,
    },
  });

  return preserveScrollForPage(() => {
    container!.replaceChildren(renderedActions);
  });
}

function renderDiagnosticSystemInfoWidget() {
  logger.debug('[DIAGNOSTIC]', 'renderDiagnosticSystemInfoWidget');
  const diagnosticsSystemInfo = store.get().diagnosticsSystemInfo;

  const container = document.getElementById('pdk_diagnostic-page-system-info');

  const renderedSystemInfo = renderSystemInfo({
    items: [
      getPodkopVersionRow(diagnosticsSystemInfo),
      {
        key: 'Luci App',
        value: normalizeCompiledVersion(PODKOP_LUCI_APP_VERSION),
      },
      {
        key: 'Sing-box',
        value: diagnosticsSystemInfo.sing_box_version,
      },
      {
        key: _('Core'),
        value: `${diagnosticsSystemInfo.core_package || 'unknown'} (${diagnosticsSystemInfo.core_family || 'unknown'}, ${diagnosticsSystemInfo.core_variant || 'unknown'})`,
      },
      {
        key: _('Core version'),
        value: diagnosticsSystemInfo.core_package_version,
      },
      {
        key: 'OS',
        value: diagnosticsSystemInfo.openwrt_version,
      },
      {
        key: 'Device',
        value: diagnosticsSystemInfo.device_model,
      },
    ],
  });

  return preserveScrollForPage(() => {
    container!.replaceChildren(renderedSystemInfo);
  });
}

async function onStoreUpdate(
  next: StoreType,
  prev: StoreType,
  diff: Partial<StoreType>,
) {
  if (diff.diagnosticsChecks) {
    renderDiagnosticsChecks();
  }

  if (diff.diagnosticsRunAction) {
    renderDiagnosticRunActionWidget();
  }

  if (
    diff.diagnosticsActions ||
    diff.servicesInfoWidget ||
    diff.diagnosticsSystemInfo
  ) {
    renderDiagnosticAvailableActionsWidget();
  }

  if (diff.diagnosticsSystemInfo) {
    renderDiagnosticSystemInfoWidget();
  }
}

const DIAGNOSTIC_CHECK_TIMEOUT_MS = 20000;

function markCheckFailed(code: string) {
  store.set({
    diagnosticsChecks: store.get().diagnosticsChecks.map((check) =>
      check.code === code
        ? {
            ...check,
            state: 'error',
            description: _('Cannot receive checks result'),
            items: [],
          }
        : check,
    ),
  });
}

async function runChecks() {
  const checks: Array<{ code: string; run: () => Promise<void> }> = [
    { code: DIAGNOSTICS_CHECKS.DNS, run: runDnsCheck },
    { code: DIAGNOSTICS_CHECKS.SINGBOX, run: runSingBoxCheck },
    { code: DIAGNOSTICS_CHECKS.NFT, run: runNftCheck },
    { code: DIAGNOSTICS_CHECKS.OUTBOUNDS, run: runSectionsCheck },
    { code: DIAGNOSTICS_CHECKS.FAKEIP, run: runFakeIPCheck },
  ];

  try {
    store.set({
      diagnosticsRunAction: { loading: true },
      diagnosticsChecks: loadingDiagnosticsChecksStore.diagnosticsChecks,
    });

    for (const check of checks) {
      try {
        await withTimeout(
          check.run(),
          DIAGNOSTIC_CHECK_TIMEOUT_MS,
          `diagnostic ${check.code}`,
        );
      } catch (e) {
        logger.error('[DIAGNOSTIC]', `${check.code} check failed`, e);
        markCheckFailed(check.code);
      }
    }
  } finally {
    store.set({ diagnosticsRunAction: { loading: false } });
  }
}

function onPageMount() {
  // Cleanup before mount
  onPageUnmount();

  // Add new listener
  store.subscribe(onStoreUpdate);

  // Initial checks render
  renderDiagnosticsChecks();

  // Initial run checks action render
  renderDiagnosticRunActionWidget();

  // Initial available actions render
  renderDiagnosticAvailableActionsWidget();

  // Initial system info render
  renderDiagnosticSystemInfoWidget();

  // Initial services info fetch
  fetchServicesInfo();

  // Initial system info fetch
  fetchSystemInfo();
}

function onPageUnmount() {
  // Remove old listener
  store.unsubscribe(onStoreUpdate);

  // Clear store
  store.reset([
    'diagnosticsActions',
    'diagnosticsSystemInfo',
    'diagnosticsChecks',
    'diagnosticsRunAction',
  ]);
}

function registerLifecycleListeners() {
  store.subscribe((next, prev, diff) => {
    if (
      diff.tabService &&
      next.tabService.current !== prev.tabService.current
    ) {
      logger.debug(
        '[DIAGNOSTIC]',
        'active tab diff event, active tab:',
        diff.tabService.current,
      );
      const isDIAGNOSTICVisible = next.tabService.current === 'diagnostic';

      if (isDIAGNOSTICVisible) {
        logger.debug(
          '[DIAGNOSTIC]',
          'registerLifecycleListeners',
          'onPageMount',
        );
        return onPageMount();
      }

      if (!isDIAGNOSTICVisible) {
        logger.debug(
          '[DIAGNOSTIC]',
          'registerLifecycleListeners',
          'onPageUnmount',
        );
        return onPageUnmount();
      }
    }
  });
}

export async function initController(): Promise<void> {
  onMount('diagnostic-status').then(() => {
    logger.debug('[DIAGNOSTIC]', 'initController', 'onMount');
    onPageMount();
    registerLifecycleListeners();
  });
}
