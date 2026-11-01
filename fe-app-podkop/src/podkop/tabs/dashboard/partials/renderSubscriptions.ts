import { Podkop } from '../../../types';
import { prettyBytes } from '../../../../helpers/prettyBytes';
import {
  formatUpdatedAgo,
  getExpiryInfo,
  getTrafficUsage,
} from '../subscriptionUtils';

interface IRenderSubscriptionsProps {
  loading: boolean;
  failed: boolean;
  refreshing: boolean;
  updatedAt: number;
  data: Podkop.SubscriptionSectionInfo[];
  onRefresh: () => void;
}

function formatDate(date: Date): string {
  try {
    return date.toLocaleDateString();
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function renderSkeleton() {
  return E('div', { class: 'pdk_dashboard-page__subscriptions' }, [
    E('div', { class: 'pdk_dashboard-page__subscriptions__header' }, [
      E('b', {}, _('Subscriptions')),
    ]),
    E('div', { class: 'pdk_dashboard-page__subscriptions__grid' }, [
      E('div', {
        class:
          'pdk_dashboard-page__subscriptions__card pdk_dashboard-page__subscriptions__card--skeleton skeleton',
      }),
    ]),
  ]);
}

function renderRefreshButton(
  refreshing: boolean,
  onRefresh: () => void,
  compact = false,
) {
  return E(
    'button',
    {
      class: `btn cbi-button pdk_dashboard-page__subscriptions__refresh${compact ? ' pdk_dashboard-page__subscriptions__refresh--compact' : ''}`,
      disabled: refreshing ? true : undefined,
      title: _('Refresh'),
      click: () => {
        if (!refreshing) {
          onRefresh();
        }
      },
    },
    refreshing ? '…' : compact ? '🔄' : _('Refresh'),
  );
}

function renderTrafficBlock(info: Podkop.SubscriptionSectionInfo) {
  const usage = getTrafficUsage(info.upload, info.download, info.total);

  if (usage.unlimited) {
    return E('div', { class: 'pdk_dashboard-page__subscriptions__row' }, [
      E('span', { class: 'pdk_dashboard-page__subscriptions__key' }, [
        `${_('Used')}: `,
      ]),
      E('span', {}, [
        prettyBytes(usage.used),
        E(
          'span',
          {
            class:
              'pdk_dashboard-page__subscriptions__muted pdk_dashboard-page__subscriptions__inline-muted',
          },
          ` · ${_('no traffic limit')}`,
        ),
      ]),
    ]);
  }

  const levelClass =
    usage.level === 'critical'
      ? 'pdk_dashboard-page__subscriptions__bar-fill--red'
      : usage.level === 'warning'
        ? 'pdk_dashboard-page__subscriptions__bar-fill--yellow'
        : 'pdk_dashboard-page__subscriptions__bar-fill--green';

  return E('div', { class: 'pdk_dashboard-page__subscriptions__traffic' }, [
    E('div', { class: 'pdk_dashboard-page__subscriptions__row' }, [
      E('span', { class: 'pdk_dashboard-page__subscriptions__key' }, [
        `${_('Traffic')}: `,
      ]),
      E('span', {}, [
        `${prettyBytes(usage.used)} / ${prettyBytes(usage.total)}`,
      ]),
    ]),
    E(
      'div',
      {
        class: 'pdk_dashboard-page__subscriptions__bar',
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(usage.percent),
      },
      [
        E('div', {
          class: `pdk_dashboard-page__subscriptions__bar-fill ${levelClass}`,
          style: `width: ${usage.percent}%`,
        }),
      ],
    ),
    E(
      'div',
      {
        class:
          'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__muted',
      },
      [
        `${_('Remaining')}: ${prettyBytes(usage.remaining)} (${usage.percent}%)`,
      ],
    ),
  ]);
}

function renderExpiryBlock(info: Podkop.SubscriptionSectionInfo) {
  const expiry = getExpiryInfo(info.expire);

  if (!expiry.validUntil) {
    return E(
      'div',
      {
        class:
          'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__muted',
      },
      [`${_('Valid until')}: ${_('no limit')}`],
    );
  }

  const children: (HTMLElement | string)[] = [
    E('span', { class: 'pdk_dashboard-page__subscriptions__key' }, [
      `${_('Valid until')}: `,
    ]),
    E('span', {}, [formatDate(expiry.validUntil)]),
    E(
      'span',
      {
        class:
          'pdk_dashboard-page__subscriptions__muted pdk_dashboard-page__subscriptions__inline-muted',
      },
      [` · ${_('Days left')}: ${Math.max(0, expiry.daysLeft ?? 0)}`],
    ),
  ];

  if (expiry.level === 'expired') {
    children.push(
      E(
        'span',
        {
          class:
            'pdk_dashboard-page__subscriptions__badge pdk_dashboard-page__subscriptions__badge--red',
        },
        `⚠️ ${_('Expired')}`,
      ),
    );
  } else if (expiry.level === 'warning') {
    children.push(
      E(
        'span',
        {
          class:
            'pdk_dashboard-page__subscriptions__badge pdk_dashboard-page__subscriptions__badge--yellow',
        },
        `⚠️ ${_('Expires soon')}`,
      ),
    );
  }

  return E(
    'div',
    { class: 'pdk_dashboard-page__subscriptions__row' },
    children,
  );
}

function renderCard(
  info: Podkop.SubscriptionSectionInfo,
  refreshing: boolean,
  onRefresh: () => void,
) {
  const sources = Array.from(
    new Set(info.sources.map((source) => source.label).filter(Boolean)),
  );
  const hasData = info.status !== 'no-data';
  const partial = info.status === 'partial';
  const sourcesLabel = sources.length
    ? sources.length > 1
      ? `${sources[0]} +${sources.length - 1}`
      : sources[0]
    : _('unknown');

  const children: HTMLElement[] = [
    E('div', { class: 'pdk_dashboard-page__subscriptions__card-header' }, [
      E(
        'b',
        {
          class: 'pdk_dashboard-page__subscriptions__card-title',
          title: info.section,
        },
        info.section,
      ),
      renderRefreshButton(refreshing, onRefresh, true),
    ]),
    E(
      'div',
      {
        class:
          'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__muted',
      },
      [`${_('Sources')}: ${sourcesLabel}`],
    ),
  ];

  if (hasData) {
    children.push(renderTrafficBlock(info));
    children.push(renderExpiryBlock(info));
  } else {
    children.push(
      E(
        'div',
        {
          class:
            'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__muted',
        },
        [_('No subscription data')],
      ),
    );
  }

  if (partial) {
    children.push(
      E(
        'div',
        {
          class:
            'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__muted',
        },
        [_('Some sources did not return subscription info')],
      ),
    );
  }

  children.push(
    E(
      'div',
      {
        class:
          'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__muted pdk_dashboard-page__subscriptions__updated',
      },
      [`${_('Updated')}: ${formatUpdatedAgo(info.updated_at)}`],
    ),
  );

  return E(
    'div',
    {
      class: `pdk_dashboard-page__subscriptions__card${partial ? ' pdk_dashboard-page__subscriptions__card--warning' : ''}`,
    },
    children,
  );
}

export function renderSubscriptions({
  loading,
  failed,
  refreshing,
  updatedAt,
  data,
  onRefresh,
}: IRenderSubscriptionsProps) {
  if (loading) {
    return renderSkeleton();
  }

  const header = E(
    'div',
    { class: 'pdk_dashboard-page__subscriptions__header' },
    [
      E('b', {}, _('Subscriptions')),
      E(
        'span',
        {
          class:
            'pdk_dashboard-page__subscriptions__muted pdk_dashboard-page__subscriptions__header-updated',
        },
        [`${_('Updated')}: ${formatUpdatedAgo(updatedAt)}`],
      ),
      renderRefreshButton(refreshing, onRefresh),
    ],
  );

  if (failed) {
    return E('div', { class: 'pdk_dashboard-page__subscriptions' }, [
      header,
      E(
        'div',
        {
          class:
            'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__row--error',
        },
        [_('Currently unavailable')],
      ),
    ]);
  }

  if (data.length === 0) {
    return E('div', { class: 'pdk_dashboard-page__subscriptions' }, [
      header,
      E(
        'div',
        {
          class:
            'pdk_dashboard-page__subscriptions__row pdk_dashboard-page__subscriptions__muted',
        },
        [_('No subscriptions configured in any section')],
      ),
    ]);
  }

  return E('div', { class: 'pdk_dashboard-page__subscriptions' }, [
    header,
    E(
      'div',
      { class: 'pdk_dashboard-page__subscriptions__grid' },
      data.map((info) => renderCard(info, refreshing, onRefresh)),
    ),
  ]);
}
