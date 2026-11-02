"use strict";
"require view";
"require form";
"require fs";
"require ui";
"require uci";
"require rpc";
"require baseclass";
"require network";
"require view.podkop.main as main";

// Settings content
"require view.podkop.settings as settings";

// Sections content
"require view.podkop.section as section";

// Dashboard content
"require view.podkop.dashboard as dashboard";

// Diagnostic content
"require view.podkop.diagnostic as diagnostic";
"require view.podkop.monitoring as monitoring";

async function loadDeviceChoices() {
  try {
    const content = await fs.read_direct("/tmp/dhcp.leases");
    if (!content) return [];

    const seen = new Set();
    const devices = [];

    content.split("\n").forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) return;

      const ip = parts[2];
      const name = parts[3];
      if (!ip || !name || name === "*" || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        return;
      }

      const key = `${name}|${ip}`;
      if (seen.has(key)) return;
      seen.add(key);
      devices.push({ ip: ip, name: name });
    });

    return devices;
  } catch (_error) {
    return [];
  }
}

function enableRowDragAndDrop(containerNode) {
  if (!containerNode) return;

  function initRows() {
    const table =
      containerNode.querySelector("#cbi-podkop-section .cbi-section-table") ||
      containerNode.querySelector(".cbi-section-table");
    if (!table) return;

    // Modern LuCI already implements sortable tables natively (drag handle in
    // the actions column, persisted to UCI). Do not attach a second DnD
    // implementation on top of it: duplicated handlers cancel each other and
    // can reorder sections twice.
    if (table.querySelector(".drag-handle")) return;

    const tbody = table.querySelector("tbody") || table;
    const rows = tbody.querySelectorAll(".cbi-section-table-row");

    rows.forEach((row) => {
      if (row.dataset.dndInit) return;
      row.dataset.dndInit = "1";

      row.setAttribute("draggable", "true");
      row.style.cursor = "grab";
      row.style.userSelect = "none";
      row.style.webkitUserSelect = "none";
      row.title = _("Drag row with mouse to reorder sections");

      row.addEventListener("dragstart", (e) => {
        const target = e.target;
        if (
          target &&
          (target.closest("input") ||
            target.closest("button") ||
            target.closest("select") ||
            target.closest("textarea") ||
            target.closest("a") ||
            target.closest(".cbi-button"))
        ) {
          e.preventDefault();
          return;
        }

        window._podkopDraggedRow = row;
        row.classList.add("dragging");
        row.style.cursor = "grabbing";
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "text/plain",
          row.getAttribute("data-sid") || "",
        );
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        row.style.cursor = "grab";
        window._podkopDraggedRow = null;
        tbody.querySelectorAll(".cbi-section-table-row").forEach((r) => {
          r.classList.remove("drag-target-above", "drag-target-below");
        });
      });

      row.addEventListener("dragover", (e) => {
        const dragged = window._podkopDraggedRow;
        if (!dragged || dragged === row) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        const rect = row.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        if (offset < rect.height / 2) {
          row.classList.add("drag-target-above");
          row.classList.remove("drag-target-below");
        } else {
          row.classList.add("drag-target-below");
          row.classList.remove("drag-target-above");
        }
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-target-above", "drag-target-below");
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-target-above", "drag-target-below");
        const dragged = window._podkopDraggedRow;
        if (!dragged || dragged === row) return;

        const draggedSid = dragged.getAttribute("data-sid");
        const targetSid = row.getAttribute("data-sid");
        if (!draggedSid || !targetSid) return;

        const rect = row.getBoundingClientRect();
        const offset = e.clientY - rect.top;

        if (offset < rect.height / 2) {
          tbody.insertBefore(dragged, row);
          if (typeof uci !== "undefined" && typeof uci.move === "function") {
            uci.move("podkop", draggedSid, targetSid, false);
            if (typeof uci.save === "function") {
              uci.save();
            }
          }
        } else {
          tbody.insertBefore(dragged, row.nextSibling);
          if (typeof uci !== "undefined" && typeof uci.move === "function") {
            uci.move("podkop", draggedSid, targetSid, true);
            if (typeof uci.save === "function") {
              uci.save();
            }
          }
        }

        const formEl =
          containerNode.closest("form") ||
          document.querySelector(".cbi-map form") ||
          document.querySelector("form");
        if (formEl) {
          formEl.dispatchEvent(new Event("input", { bubbles: true }));
          formEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeof ui !== "undefined" && ui.changes) {
          ui.changes.init();
        }
      });
    });
  }

  initRows();

  const observer = new MutationObserver(() => initRows());
  observer.observe(containerNode, { childList: true, subtree: true });
}

/* Modern, unified PodForCOP navigation and page chrome.
   Tabs are generated by LuCI's CBI map, so we restyle the cbi-tabmenu instead
   of reimplementing navigation. Scope: only #cbi-podkop. */
const PODKOP_UI_CSS = `
#cbi-podkop {
    --pdk-ui-accent: #2f7cf6;
    --pdk-ui-border: var(--border-color-medium, rgba(127, 127, 127, 0.28));
    --pdk-ui-panel: var(--background-color-high, rgba(127, 127, 127, 0.06));
    --pdk-ui-panel-hover: var(--background-color-low, rgba(127, 127, 127, 0.12));
}

#cbi-podkop > h2 {
    margin: 0;
    padding: 14px 16px 2px;
    border: 1px solid var(--pdk-ui-border);
    border-bottom: 0;
    border-radius: 12px 12px 0 0;
    background: linear-gradient(135deg, var(--pdk-ui-panel), transparent);
    font-size: 1.55rem;
    letter-spacing: -0.01em;
}

#cbi-podkop > .cbi-map-descr {
    margin: 0 0 14px;
    padding: 0 16px 12px;
    border: 1px solid var(--pdk-ui-border);
    border-top: 0;
    border-radius: 0 0 12px 12px;
    background: linear-gradient(135deg, var(--pdk-ui-panel), transparent);
    color: var(--text-color-medium, #777);
}

#cbi-podkop .cbi-tabmenu {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 18px;
    padding: 5px;
    list-style: none;
    border: 1px solid var(--pdk-ui-border);
    border-radius: 12px;
    background: var(--pdk-ui-panel);
    overflow-x: auto;
    scrollbar-width: thin;
}

#cbi-podkop .cbi-tabmenu > li {
    flex: 0 0 auto;
    margin: 0;
}

#cbi-podkop .cbi-tabmenu > li > a {
    display: block;
    padding: 8px 16px;
    border-radius: 8px;
    color: var(--text-color-medium, #666);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
}

#cbi-podkop .cbi-tabmenu > li > a:hover {
    background: var(--pdk-ui-panel-hover);
    color: inherit;
    text-decoration: none;
}

#cbi-podkop .cbi-tabmenu > li.cbi-tab > a {
    background: var(--background-color-high, #fff);
    color: var(--pdk-ui-accent);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

#cbi-podkop > .cbi-section,
#cbi-podkop .cbi-section {
    margin-bottom: 14px;
    padding: 12px 14px;
    border: 1px solid var(--pdk-ui-border);
    border-radius: 12px;
    background: var(--pdk-ui-panel);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

#cbi-podkop .cbi-section > h3,
#cbi-podkop .cbi-section > legend {
    margin: 0 0 8px;
    padding: 0;
    font-size: 1.02rem;
}

#cbi-podkop .cbi-tabmenu > li > a::before {
    display: inline-block;
    margin-right: 7px;
    opacity: 0.75;
    font-weight: 400;
}

#cbi-podkop .cbi-tabmenu > li:nth-child(1) > a::before { content: "▦"; }
#cbi-podkop .cbi-tabmenu > li:nth-child(2) > a::before { content: "⚙"; }
#cbi-podkop .cbi-tabmenu > li:nth-child(3) > a::before { content: "◉"; }
#cbi-podkop .cbi-tabmenu > li:nth-child(4) > a::before { content: "▤"; }
#cbi-podkop .cbi-tabmenu > li:nth-child(5) > a::before { content: "≋"; }

#cbi-podkop .cbi-page-actions .cbi-button-save {
    display: none !important;
}

.pdk-app-shell {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.pdk-config-stale {
    margin: 0 0 14px;
    padding: 10px 12px;
    border: 1px solid var(--warn-color-medium, #d9a300);
    border-left: 4px solid var(--warn-color-medium, #d9a300);
    border-radius: 8px;
    background: color-mix(in srgb, var(--warn-color-medium, #d9a300) 14%, transparent);
    color: inherit;
}#cbi-podkop .cbi-section-table {
    border-radius: 10px;
    overflow: hidden;
}
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}

#cbi-podkop .cbi-section-table th {
    padding: 8px 10px;
    color: var(--text-color-medium, #777);
    font-weight: 600;
    text-align: left;
    border-bottom: 1px solid var(--pdk-ui-border);
}

#cbi-podkop .cbi-section-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--pdk-ui-border);
    vertical-align: middle;
}

#cbi-podkop .cbi-section-table tr:last-child td {
    border-bottom: 0;
}

#cbi-podkop .cbi-section-table tbody tr:hover {
    background: var(--pdk-ui-panel-hover);
}

#cbi-podkop .cbi-input-text,
#cbi-podkop .cbi-input-select,
#cbi-podkop .cbi-input-password,
#cbi-podkop .cbi-input-file,
#cbi-podkop textarea {
    border-radius: 7px;
}

#cbi-podkop .cbi-button {
    border-radius: 7px;
}

#cbi-podkop .cbi-page-actions {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin-top: 16px;
    padding: 10px 12px;
    border: 1px solid var(--pdk-ui-border);
    border-radius: 12px;
    background: var(--background-color-high, rgba(255, 255, 255, 0.96));
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(8px);
}

@media (max-width: 720px) {
    #cbi-podkop > h2 {
        font-size: 1.3rem;
    }

    #cbi-podkop .cbi-tabmenu {
        padding: 4px;
        gap: 2px;
    }

    #cbi-podkop .cbi-tabmenu > li > a {
        padding: 8px 12px;
        font-size: 0.92rem;
    }

    #cbi-podkop .cbi-section {
        padding: 10px;
    }

    #cbi-podkop .cbi-page-actions {
        padding: 8px;
    }
}
`;

function ensureModernPodkopStyles() {
    if (document.getElementById("podkop-modern-ui")) {
        return;
    }

    document.head.appendChild(
        E("style", { id: "podkop-modern-ui" }, PODKOP_UI_CSS),
    );
}

const EntryPoint = {
  async render() {
    main.injectGlobalStyles();

    // Options of features the installed sing-box does not have are not created
    const singBoxFeatures = await main.CustomPodkopMethods.getSingBoxFeatures();

    const podkopMap = new form.Map(
      "podkop",
      _("PodForCOP Settings"),
      _("Manage traffic sections, proxy subscriptions, and router settings"),
    );
    // Enable tab views
    podkopMap.tabbed = true;

    // Sections tab
    const sectionsSection = podkopMap.section(
      form.GridSection,
      "section",
      _("Sections"),
    );
    sectionsSection.anonymous = false;
    sectionsSection.addremove = true;
    sectionsSection.sortable = true;
    sectionsSection.addbtntitle = _("Add section");
    sectionsSection.nodescriptions = true;
    sectionsSection.description =
      _(
        "Select a section to edit its connection and traffic rules. Drag rows with mouse to reorder rules precedence.",
      ) +
      " " +
      _(
        "After changing a section press Save & Apply at the bottom of the page: Podkop will regenerate the config and restart automatically.",
      );

    // Render section content
    const deviceChoices = await loadDeviceChoices();
    section.createSectionContent(sectionsSection, singBoxFeatures, deviceChoices);

    // Settings tab
    const settingsSection = podkopMap.section(
      form.TypedSection,
      "settings",
      _("Settings"),
    );
    settingsSection.anonymous = true;
    settingsSection.addremove = false;
    // Make it named [ config settings 'settings' ]
    settingsSection.cfgsections = function () {
      return ["settings"];
    };

    // Render settings content
    settings.createSettingsContent(settingsSection, singBoxFeatures);

    // Diagnostic tab
    const diagnosticSection = podkopMap.section(
      form.TypedSection,
      "diagnostic",
      _("Diagnostics"),
    );
    diagnosticSection.anonymous = true;
    diagnosticSection.addremove = false;
    diagnosticSection.cfgsections = function () {
      return ["diagnostic"];
    };

    // Render diagnostic content
    diagnostic.createDiagnosticContent(diagnosticSection);

    // Dashboard tab
    const dashboardSection = podkopMap.section(
      form.TypedSection,
      "dashboard",
      _("Dashboard"),
    );
    dashboardSection.anonymous = true;
    dashboardSection.addremove = false;
    dashboardSection.cfgsections = function () {
      return ["dashboard"];
    };

    // Render dashboard content
    dashboard.createDashboardContent(dashboardSection);

    const monitoringSection = podkopMap.section(
      form.TypedSection,
      "monitoring",
      _("Monitoring"),
    );
    monitoringSection.anonymous = true;
    monitoringSection.addremove = false;
    monitoringSection.cfgsections = function () {
      return ["monitoring"];
    };
    monitoring.createMonitoringContent(monitoringSection);

    // Inject core service
    main.coreService();

    ensureModernPodkopStyles();

    const rendered = await podkopMap.render();
    enableRowDragAndDrop(rendered);

    let staleBanner = null;
    try {
      const configStatusResult = await fs.exec("/usr/bin/podkop", [
        "get_config_status",
      ]);
      const configStatus = JSON.parse(configStatusResult?.stdout || "{}");
      if (configStatus?.stale) {
        staleBanner = E("div", { class: "pdk-config-stale" }, [
          E("b", {}, _("Settings are saved but not applied. ")),
          E(
            "span",
            {},
            _(
              "Click Save & Apply to regenerate the sing-box configuration and restart Podkop.",
            ),
          ),
        ]);
      }
    } catch (e) {
      console.error("Podkop config status check failed", e);
    }

    return E("div", { class: "pdk-app-shell" }, [
      ...(staleBanner ? [staleBanner] : []),
      rendered,
    ]);
  },

  handleSaveApply(ev, mode) {
    return this.handleSave(ev).then(() => {
      ui.showModal(_("Applying changes"), [
        E(
          "p",
          { class: "spinning" },
          _("Applying configuration and restarting Podkop service..."),
        ),
      ]);

      return ui.changes
        .apply(mode == "0")
        .then(() => {
          ui.showModal(_("Restarting service"), [
            E("p", { class: "spinning" }, _("Restarting Podkop service...")),
          ]);
          return fs
            .exec("/etc/init.d/podkop", ["restart"])
            .catch((err) => {
              console.error("Podkop restart failed", err);
              ui.hideModal();
              ui.addNotification(
                null,
                E(
                  "p",
                  {},
                  _(
                    "Failed to restart Podkop service. The changes are saved; run service podkop restart manually.",
                  ),
                ),
                "error",
              );
            })
            .finally(() => {
              ui.hideModal();
            });
        })
        .catch((err) => {
          ui.hideModal();
          ui.addNotification(
            null,
            E("p", {}, err ? err.message : _("Failed to apply changes")),
            "error",
          );
        });
    });
  },
};

return view.extend(EntryPoint);
