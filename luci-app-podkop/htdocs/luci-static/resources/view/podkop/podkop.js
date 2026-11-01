"use strict";
"require view";
"require form";
"require fs";
"require ui";
"require uci";
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

function enableRowDragAndDrop(containerNode) {
  if (!containerNode) return;

  function initRows() {
    const table = containerNode.querySelector("#cbi-podkop-section .cbi-section-table");
    if (!table) return;

    const tbody = table.querySelector("tbody") || table;
    const rows = tbody.querySelectorAll(".cbi-section-table-row");

    rows.forEach((row) => {
      if (row.dataset.dndInit) return;
      row.dataset.dndInit = "1";

      row.setAttribute("draggable", "true");
      row.title = _("Drag row with mouse to reorder sections");

      row.addEventListener("dragstart", (e) => {
        const target = e.target;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "BUTTON" ||
            target.closest(".cbi-button") ||
            target.closest("input") ||
            target.closest(".cbi-value-field"))
        ) {
          e.preventDefault();
          return;
        }

        window._podkopDraggedRow = row;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.getAttribute("data-sid") || "");
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
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

        const rect = row.getBoundingClientRect();
        const offset = e.clientY - rect.top;

        if (offset < rect.height / 2) {
          tbody.insertBefore(dragged, row);
        } else {
          tbody.insertBefore(dragged, row.nextSibling);
        }

        const newOrder = [];
        tbody.querySelectorAll(".cbi-section-table-row").forEach((r) => {
          const sid = r.getAttribute("data-sid");
          if (sid) newOrder.push(sid);
        });

        if (newOrder.length > 0 && typeof uci !== "undefined") {
          uci.reorder("podkop", newOrder);
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
    sectionsSection.description = _(
      "Select a section to edit its connection and traffic rules. Drag rows with mouse to reorder rules precedence.",
    );

    // Render section content
    section.createSectionContent(sectionsSection, singBoxFeatures);

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

    // Inject core service
    main.coreService();

    const rendered = await podkopMap.render();
    enableRowDragAndDrop(rendered);
    return rendered;
  },

  handleSaveApply(ev, mode) {
    return this.handleSave(ev).then(() => {
      return ui.changes.apply(mode == "0").then(() => {
        return fs.exec("/etc/init.d/podkop", ["restart"]).catch(() => {});
      });
    });
  },
};

return view.extend(EntryPoint);
