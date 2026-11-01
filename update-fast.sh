#!/bin/sh
set -e

echo "Updating PodForCOP UI and backend scripts..."

TS=$(date +%s)
BASE_URL="https://raw.githubusercontent.com/19man91-ops/podforkop/main"
FETCH_CMD="wget -q --no-check-certificate -O"
if ! command -v wget >/dev/null 2>&1; then
    FETCH_CMD="uclient-fetch -q --no-check-certificate -O"
fi

mkdir -p /www/luci-static/resources/view/podkop/fonts /usr/bin /usr/lib /etc/init.d /usr/share/rpcd/acl.d

echo "1/10 Downloading podkop.js (Drag & Drop + Save & Apply)..."
$FETCH_CMD /www/luci-static/resources/view/podkop/podkop.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/podkop.js?t=${TS}"

echo "2/10 Downloading section.js (Mode badges)..."
$FETCH_CMD /www/luci-static/resources/view/podkop/section.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/section.js?t=${TS}"

echo "3/10 Downloading settings.js (Multiple DNS failover)..."
$FETCH_CMD /www/luci-static/resources/view/podkop/settings.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/settings.js?t=${TS}"

echo "4/10 Downloading main.js (UI Bundle with flags & device names)..."
$FETCH_CMD /www/luci-static/resources/view/podkop/main.js "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/main.js?t=${TS}"

echo "5/10 Downloading /usr/bin/podkop..."
$FETCH_CMD /usr/bin/podkop "${BASE_URL}/podkop/files/usr/bin/podkop?t=${TS}"

echo "6/10 Downloading /usr/lib/sing_box_config_manager.sh..."
$FETCH_CMD /usr/lib/sing_box_config_manager.sh "${BASE_URL}/podkop/files/usr/lib/sing_box_config_manager.sh?t=${TS}"

echo "7/10 Downloading /usr/lib/subscriptions.sh..."
$FETCH_CMD /usr/lib/subscriptions.sh "${BASE_URL}/podkop/files/usr/lib/subscriptions.sh?t=${TS}"

echo "8/11 Updating ACL permissions..."
$FETCH_CMD /usr/share/rpcd/acl.d/luci-app-podkop.json "${BASE_URL}/luci-app-podkop/root/usr/share/rpcd/acl.d/luci-app-podkop.json?t=${TS}"

echo "9/11 Downloading /etc/init.d/podkop..."
$FETCH_CMD /etc/init.d/podkop "${BASE_URL}/podkop/files/etc/init.d/podkop?t=${TS}"

echo "10/11 Downloading TwemojiCountryFlags font..."
$FETCH_CMD /www/luci-static/resources/view/podkop/fonts/TwemojiCountryFlags.woff2 "${BASE_URL}/luci-app-podkop/htdocs/luci-static/resources/view/podkop/fonts/TwemojiCountryFlags.woff2?t=${TS}"

chmod +x /usr/bin/podkop /etc/init.d/podkop

echo "11/11 Flushing LuCI cache and restarting web services..."
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache* /tmp/luci-sessions* 2>/dev/null || true

/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/podkop restart >/dev/null 2>&1 || true

echo ""
echo "PodForCOP updated successfully!"
echo "ВАЖНО: В браузере нажмите Ctrl + F5 (или откройте в режиме Инкогнито), чтобы сбросить кэш JS!"
