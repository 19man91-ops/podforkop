"use strict";
"require baseclass";
"require form";
"require view.podkop.main as main";

function createMonitoringContent(section) {
  const o = section.option(form.DummyValue, "_mount_node");
  o.rawhtml = true;
  o.cfgvalue = () => { main.MonitoringTab.initController(); return main.MonitoringTab.render(); };
}

return baseclass.extend({ createMonitoringContent });
