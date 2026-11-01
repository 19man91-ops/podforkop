import { prettyBytes } from '../../../../helpers/prettyBytes';
import {
  buildTrafficBars,
  TRAFFIC_GRAPH_MAX_BARS,
  TrafficSample,
} from '../trafficGraph';

function renderBars(history: TrafficSample[]) {
  const bars = buildTrafficBars(history, TRAFFIC_GRAPH_MAX_BARS);

  return E(
    'div',
    { class: 'pdk_dashboard-page__traffic-graph__bars' },
    bars.map((bar) =>
      E('div', { class: 'pdk_dashboard-page__traffic-graph__column' }, [
        E('span', {
          class:
            'pdk_dashboard-page__traffic-graph__bar pdk_dashboard-page__traffic-graph__bar--down',
          style: `height: ${bar.downPercent}%`,
        }),
        E('span', {
          class:
            'pdk_dashboard-page__traffic-graph__bar pdk_dashboard-page__traffic-graph__bar--up',
          style: `height: ${bar.upPercent}%`,
        }),
      ]),
    ),
  );
}

export function renderTrafficGraph(history: TrafficSample[]) {
  const last = history[history.length - 1];

  return E('div', { class: 'pdk_dashboard-page__traffic-graph' }, [
    E('div', { class: 'pdk_dashboard-page__traffic-graph__header' }, [
      E('b', {}, _('Traffic graph')),
      last
        ? E(
            'span',
            {
              class:
                'pdk_dashboard-page__traffic-graph__legend pdk_dashboard-page__subscriptions__row--muted',
            },
            `↓ ${prettyBytes(last.down)}/s · ↑ ${prettyBytes(last.up)}/s`,
          )
        : null,
    ]),
    history.length
      ? renderBars(history)
      : E(
          'div',
          {
            class:
              'pdk_dashboard-page__traffic-graph__empty pdk_dashboard-page__subscriptions__row--muted',
          },
          _('Waiting for traffic data...'),
        ),
  ]);
}
