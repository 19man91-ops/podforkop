// language=CSS
export const styles = `
#cbi-podkop-monitoring-_mount_node {
    display: block;
    margin: 16px 0 22px;
    padding: 0;
}

#cbi-podkop-monitoring > h3 {
    display: none;
}

.fkp_monitoring-page {
    --fkp-monitoring-row-action-size: 24px;
    --fkp-monitoring-divider-color: rgba(127, 127, 127, 0.22);
    --fkp-monitoring-soft-bg: rgba(127, 127, 127, 0.08);
    --fkp-monitoring-soft-bg-hover: rgba(127, 127, 127, 0.14);
    --fkp-monitoring-danger-color: var(--error-color-medium, #d32f2f);

    container-type: inline-size;
    width: 100%;
    min-width: 0;
}

.fkp_monitoring-page__panel {
    margin-top: 0;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
}

.fkp_monitoring-page__controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    grid-template-areas: 'filters actions';
    align-items: center;
    gap: 12px 16px;
    margin-bottom: 12px;
}

.fkp_monitoring-page__pause-note {
    flex: 1 1 0;
    min-width: 0;
    align-self: center;
    margin-left: 8px;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color-medium, #888);
}

.fkp_monitoring-page__pause-note[hidden] {
    display: none;
}

.fkp_monitoring-page__tab-count {
    color: var(--text-color-medium, #888);
    font-variant-numeric: tabular-nums;
}

.fkp_monitoring-page__filters {
    grid-area: filters;
    display: grid;
    grid-template-columns: minmax(0, 220px) minmax(0, 220px) minmax(0, 320px);
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.fkp_monitoring-page .fkp_monitoring-page__filters > * {
    width: 100%;
    min-width: 0;
    margin: 0;
    box-sizing: border-box;
}

.fkp_monitoring-page__search {
    position: relative;
    display: flex;
    align-items: center;
}

.fkp_monitoring-page__search-icon {
    position: absolute;
    left: 8px;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    color: var(--text-color-medium, #888);
}

.fkp_monitoring-page__search-icon svg {
    width: 16px;
    height: 16px;
}

.fkp_monitoring-page input.fkp_monitoring-page__search-input {
    padding-left: 30px;
    width: 100%;
    box-sizing: border-box;
}

.fkp_monitoring-page__actions {
    grid-area: actions;
    display: flex;
    align-items: center;
    gap: 12px;
}

.fkp_monitoring-page__checkbox {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    cursor: pointer;
    white-space: nowrap;
}

.fkp_monitoring-page__checkbox input {
    margin: 0;
}

.fkp_monitoring-page__action {
    margin: 0;
    white-space: nowrap;
}

.fkp_monitoring-page__tabs {
    display: flex;
    align-items: flex-end;
    margin-top: 0;
    margin-bottom: 8px;
    padding-bottom: 0;
}

.fkp_monitoring-page__body {
    position: relative;
    width: 100%;
    min-width: 0;
}

.fkp_monitoring-page__list {
    display: table;
    table-layout: fixed;
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}

.fkp_monitoring-page__row {
    display: table-row;
}

.fkp_monitoring-page__row:not(.fkp_monitoring-page__row--head):hover {
    background: var(--fkp-monitoring-soft-bg);
}

.fkp_monitoring-page__row--head {
    font-weight: bold;
    border-bottom: 2px solid var(--fkp-monitoring-divider-color);
}

.fkp_monitoring-page__row--closing {
    opacity: 0.5;
}

.fkp_monitoring-page__cell {
    display: table-cell;
    padding: 6px 10px;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-bottom: 1px solid var(--fkp-monitoring-divider-color);
}

.fkp_monitoring-page__cell--host {
    width: 25%;
}

.fkp_monitoring-page__cell--source {
    width: 18%;
}

.fkp_monitoring-page__cell--route {
    width: 15%;
}

.fkp_monitoring-page__cell--network {
    width: 8%;
}

.fkp_monitoring-page__cell--time {
    width: 10%;
    text-align: right;
}

.fkp_monitoring-page__cell--download {
    width: 10%;
    text-align: right;
}

.fkp_monitoring-page__cell--upload {
    width: 10%;
    text-align: right;
}

.fkp_monitoring-page__cell--action {
    width: 4%;
    text-align: center;
}

.fkp_monitoring-page__sort {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    font: inherit;
    color: inherit;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.fkp_monitoring-page__sort-icon svg {
    width: 14px;
    height: 14px;
}

.fkp_monitoring-page__tag {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    font-size: 11px;
    font-weight: 500;
}

.fkp_monitoring-page__tag--builtin {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
}

.fkp_monitoring-page__muted {
    opacity: 0.6;
    font-size: 0.9em;
}

.fkp_monitoring-page__row-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
}

.fkp_monitoring-page__row-action:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
}

.fkp_monitoring-page__row-action svg {
    width: 14px;
    height: 14px;
}

.fkp_monitoring-page__state {
    padding: 32px;
    text-align: center;
    color: var(--text-color-medium, #888);
}
`;
