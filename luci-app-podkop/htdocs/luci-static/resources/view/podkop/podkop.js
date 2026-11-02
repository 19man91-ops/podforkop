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

    const rendered = await podkopMap.render();
    enableRowDragAndDrop(rendered);
    return rendered;
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
