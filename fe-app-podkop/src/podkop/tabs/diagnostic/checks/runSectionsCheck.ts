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
          const latencyGroup = await PodkopShellMethods.getClashApiGroupLatency(
            section.code,
          );
          const groupSuccess =
            latencyGroup.success && !latencyGroup.data.message;

          return section.outbounds.map((outbound) => {
            const delay = groupSuccess
              ? latencyGroup.data?.[outbound.code]
              : undefined;
            const success = Boolean(delay);

            return {
              state: success ? 'success' : 'error',
              key: `${section.displayName} · ${outbound.displayName}`,
              value: success
                ? `${delay} ms`
                : outbound.latency
                  ? `${outbound.latency} ms`
                  : _('Not responding'),
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
