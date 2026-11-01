#!/bin/sh
set -e

echo "Updating PodForCOP UI and backend scripts to 0.8.6..."

BASE_URL="https://raw.githubusercontent.com/19man91-ops/podforkop/main"
FETCH_CMD="wget -q --no-check-certificate -O"
if ! command -v wget >/dev/null 2>&1; then
    FETCH_CMD="uclient-fetch -q --no-check-certificate -O"
fi

mkdir -p /www/luci-static/resources/view/podkop /usr/bin /usr/lib /etc/init.d

$FETCH_CMD /www/luci-static/resources/view/podkop/podkop.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/podkop.js"
$FETCH_CMD /www/luci-static/resources/view/podkop/section.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/section.js"
$FETCH_CMD /www/luci-static/resources/view/podkop/monitoring.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/monitoring.js"
$FETCH_CMD /www/luci-static/resources/view/podkop/main.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/main.js"

$FETCH_CMD /usr/bin/podkop "${BASE_URL}/podkop/files/usr/bin/podkop"
$FETCH_CMD /usr/lib/subscriptions.sh "${BASE_URL}/podkop/files/usr/lib/subscriptions.sh"
$FETCH_CMD /etc/init.d/podkop "${BASE_URL}/podkop/files/etc/init.d/podkop"

chmod +x /usr/bin/podkop /etc/init.d/podkop

rm -f /tmp/luci-indexcache* /tmp/luci-modulecache*

/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/podkop restart >/dev/null 2>&1 || true

echo "PodForCOP successfully updated! Refresh your browser page (Ctrl + F5)."
