import { E } from '../../../helpers/element';
import { renderChevronUpIcon24, renderXIcon24 } from '../../../icons';
import { sourceLabel } from './source';

export type ConnectionSortColumn = 'time' | 'download' | 'upload';

export interface ConnectionListSort {
  column: ConnectionSortColumn;
  descending: boolean;
}

interface ConnectionListOptions {
  closable: boolean;
  sort?: ConnectionListSort | null;
  onAddDomain?: (host: string) => void;
  onExcludeDomain?: (host: string) => void;
}

export interface ConnectionListItem {
  id: string;
  host: string;
  rawHost: string;
  sourceName: string;
  sourceDetail: string;
  system: boolean;
  route: string;
  direct: boolean;
  network: string;
  time: string;
  download: string;
  upload: string;
  closing: boolean;
}

function renderList(
  rows: HTMLElement[],
  { closable, sort }: ConnectionListOptions,
) {
  return E(
    'div',
    {
      class: [
        'fkp_monitoring-page__list',
        closable ? 'fkp_monitoring-page__list--closable' : '',
      ]
        .filter(Boolean)
        .join(' '),
      role: 'table',
    },
    [
      E(
        'div',
        {
          class: 'fkp_monitoring-page__row fkp_monitoring-page__row--head',
          role: 'row',
        },
        [
          renderHeading('host', _('Host')),
          renderHeading('source', _('Source / Device')),
          renderHeading('route', _('Route')),
          renderHeading('network', _('Type')),
          renderSortHeading('time', _('Time'), sort),
          renderSortHeading('download', `↓ ${_('Downloaded')}`, sort),
          renderSortHeading('upload', `↑ ${_('Uploaded')}`, sort),
          ...(closable
            ? [
                E('div', {
                  class: cellClass('action'),
                  role: 'columnheader',
                  'aria-label': _('Close'),
                }),
              ]
            : []),
        ],
      ),
      ...rows,
    ],
  );
}

function cellClass(column: string) {
  return `fkp_monitoring-page__cell fkp_monitoring-page__cell--${column}`;
}

function renderHeading(column: string, text: string) {
  return E('div', { class: cellClass(column), role: 'columnheader' }, text);
}

function renderSortHeading(
  column: ConnectionSortColumn,
  text: string,
  sort?: ConnectionListSort | null,
) {
  const order =
    sort?.column === column
      ? sort.descending
        ? 'descending'
        : 'ascending'
      : 'none';

  return E(
    'div',
    {
      class: [cellClass(column), 'fkp_monitoring-page__cell--sortable'].join(
        ' ',
      ),
      role: 'columnheader',
      'aria-sort': order,
    },
    [
      E(
        'button',
        { class: 'fkp_monitoring-page__sort', type: 'button', value: column },
        [
          E('span', { class: 'fkp_monitoring-page__sort-label' }, text),
          E(
            'span',
            { class: 'fkp_monitoring-page__sort-icon', 'aria-hidden': 'true' },
            [renderChevronUpIcon24()],
          ),
        ],
      ),
    ],
  );
}

function renderValue(text: string, className?: string, fullValue = text) {
  return E(
    'span',
    {
      class: ['fkp_monitoring-page__value', className]
        .filter(Boolean)
        .join(' '),
      'data-copy-value': fullValue,
    },
    text,
  );
}

function renderSource({
  sourceName: name,
  sourceDetail: detail,
  system,
}: ConnectionListItem) {
  if (system) {
    return renderValue(
      name,
      'fkp_monitoring-page__value fkp_monitoring-page__tag fkp_monitoring-page__tag--builtin',
      _('The router itself: its services and programs'),
    );
  }

  const shown = name ? `${name} (${detail})` : detail || '-';
  const label = sourceLabel(name, detail) || shown;
  const muted = (text: string) =>
    E('span', { class: 'fkp_monitoring-page__muted' }, text);

  return E(
    'span',
    {
      class: 'fkp_monitoring-page__value',
      title: label,
      'data-copy-value': shown,
    },
    name
      ? [
          E(
            'span',
            {
              class: 'fkp_monitoring-page__source-name',
              style: 'font-weight: 500;',
            },
            name,
          ),
          ...(detail ? [' ', muted(`(${detail})`)] : []),
        ]
      : [muted(shown)],
  );
}

function renderRoute(route: string, direct: boolean) {
  return direct
    ? renderValue(
        route,
        'fkp_monitoring-page__tag fkp_monitoring-page__tag--builtin',
      )
    : renderValue(route, 'fkp_monitoring-page__tag');
}

function renderRowAction(
  item: ConnectionListItem,
  options: ConnectionListOptions,
) {
  return E(
    'div',
    { class: 'fkp_monitoring-page__row-actions' },
    [
      item.rawHost && options.onAddDomain
        ? E(
            'button',
            {
              class: 'btn cbi-button cbi-button-apply',
              title: _('Add domain to a section'),
              'aria-label': _('Add domain to a section'),
              type: 'button',
              click: (event: MouseEvent) => {
                event.stopPropagation();
                options.onAddDomain?.(item.rawHost);
              },
            },
            '+',
          )
        : null,
      item.rawHost && options.onExcludeDomain
        ? E(
            'button',
            {
              class: 'btn cbi-button',
              title: _('Exclude domain from routing'),
              'aria-label': _('Exclude domain from routing'),
              type: 'button',
              click: (event: MouseEvent) => {
                event.stopPropagation();
                options.onExcludeDomain?.(item.rawHost);
              },
            },
            '⊘',
          )
        : null,
      E(
        'button',
        {
          class: 'btn cbi-button fkp_monitoring-page__row-action',
          title: _('Close connection'),
          'aria-label': _('Close connection'),
          type: 'button',
          value: item.id,
        },
        [renderXIcon24()],
      ),
    ].filter(Boolean),
  );
}

function renderRow(item: ConnectionListItem, options: ConnectionListOptions) {
  const closable = options.closable;

  return E(
    'div',
    {
      class: [
        'fkp_monitoring-page__row',
        item.closing ? 'fkp_monitoring-page__row--closing' : '',
      ]
        .filter(Boolean)
        .join(' '),
      role: 'row',
      'data-connection-id': item.id,
    },
    [
      E('div', { class: cellClass('host'), role: 'cell' }, [
        renderValue(item.host, 'fkp_monitoring-page__host'),
      ]),
      E('div', { class: cellClass('source'), role: 'cell' }, [
        renderSource(item),
      ]),
      E('div', { class: cellClass('route'), role: 'cell' }, [
        renderRoute(item.route, item.direct),
      ]),
      E('div', { class: cellClass('network'), role: 'cell' }, [
        renderValue(item.network, 'fkp_monitoring-page__network'),
      ]),
      E('div', { class: cellClass('time'), role: 'cell' }, [
        renderValue(item.time, 'fkp_monitoring-page__metric'),
      ]),
      E('div', { class: cellClass('download'), role: 'cell' }, [
        renderValue(item.download, 'fkp_monitoring-page__metric'),
      ]),
      E('div', { class: cellClass('upload'), role: 'cell' }, [
        renderValue(item.upload, 'fkp_monitoring-page__metric'),
      ]),
      ...(closable
        ? [
            E('div', { class: cellClass('action'), role: 'cell' }, [
              renderRowAction(item, options),
            ]),
          ]
        : []),
    ],
  );
}

export function renderConnectionList(
  items: ConnectionListItem[],
  options: ConnectionListOptions,
) {
  return renderList(
    items.map((item) => renderRow(item, options)),
    options,
  );
}

export function renderConnectionListState(
  message: string,
  options: ConnectionListOptions & { className?: string },
) {
  return renderList(
    [
      E(
        'div',
        {
          class: 'fkp_monitoring-page__row fkp_monitoring-page__row--state',
          role: 'row',
        },
        [
          E(
            'div',
            {
              class: [
                cellClass('state'),
                'fkp_monitoring-page__cell--span',
              ].join(' '),
              role: 'cell',
            },
            [
              E(
                'div',
                {
                  class: ['fkp_monitoring-page__state', options.className]
                    .filter(Boolean)
                    .join(' '),
                },
                message,
              ),
            ],
          ),
        ],
      ),
    ],
    options,
  );
}
