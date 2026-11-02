import { DIAGNOSTICS_CHECKS_MAP } from './contstants';
import { PodkopShellMethods } from '../../../methods';
import { updateCheckStore } from './updateCheckStore';
import { getMeta } from '../helpers/getMeta';
import { getDashboardSections } from '../../../methods/custom/getDashboardSections';
import { IDiagnosticsChecksItem } from '../../../services';

export async function runSectionsCheck() {
  const { order, title, code } = DIAGNOSTICS_CHECKS_MAP.OUTBOUNDS;

  updateCheckStore({
    order,
    code,
    title,
    description: _('Checking, please wait'),
    state: 'loading',
    items: [],
  });

  const sections = await getDashboardSections();

  if (!sections.success) {
    updateCheckStore({
      order,
      code,
      title,
      description: _('Cannot receive checks result'),
      state: 'error',
      items: [],
    });

    throw new Error('Sections checks failed');
  }

  const items = (
    await Promise.all(
      sections.data.map(async (section) => {
        if (section.withTagSelect) {
          // For URLTest sections the selector only reports the URLTest group
          // itself, while the URLTest group reports every node. Use the group
          // tag for latency so each node gets its real delay.
          const urlTestGroup = section.outbounds.find(
            (outbound) => outbound.type === 'URLTest',
          );
          const latencyGroup = await PodkopShellMethods.getClashApiGroupLatency(
            urlTestGroup?.code || section.code,
          );
          const groupData =
            latencyGroup.success && !latencyGroup.data.message
              ? latencyGroup.data
              : ({} as Record<string, number>);

          const nodeDelays = section.outbounds.map((outbound) => {
            const liveDelay =
              groupData[outbound.code] ?? groupData[outbound.displayName];
            return typeof liveDelay === 'number' && liveDelay > 0
              ? liveDelay
              : outbound.latency > 0
                ? outbound.latency
                : 0;
          });
          const fallbackDelay = nodeDelays.find((delay) => delay > 0) ?? 0;

          return section.outbounds.map((outbound, index) => {
            const isGroupSummary =
              outbound.type === 'URLTest' ||
              outbound.code === urlTestGroup?.code;
            const delay =
              nodeDelays[index] || (isGroupSummary ? fallbackDelay : 0);
            const success = delay > 0;

            return {
              state: success ? 'success' : 'error',
              key: `${section.displayName} · ${outbound.displayName}`,
              value: success ? `${delay} ms` : _('Not responding'),
            } as IDiagnosticsChecksItem;
          });
        }

        const latencyProxy = await PodkopShellMethods.getClashApiProxyLatency(
          section.code,
        );

        const success = latencyProxy.success && !latencyProxy.data.message;

        return [
          {
            state: success ? 'success' : 'error',
            key: section.displayName,
            value: success
              ? `${latencyProxy.data.delay} ms`
              : _('Not responding'),
          } as IDiagnosticsChecksItem,
        ];
      }),
    )
  ).flat() as Array<IDiagnosticsChecksItem>;

  const allGood = items.every((item) => item.state === 'success');

  const atLeastOneGood = items.some((item) => item.state === 'success');

  const { state, description } = getMeta({ atLeastOneGood, allGood });

  updateCheckStore({
    order,
    code,
    title,
    description,
    state,
    items,
  });

  if (!atLeastOneGood) {
    throw new Error('Sections checks failed');
  }
}
