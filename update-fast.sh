#!/bin/sh
# Fast update of the PodForCOP UI and backend scripts without reinstalling packages.
#
# All files are downloaded into a staging directory first. The system files are
# replaced only after every download succeeded, so an interrupted update cannot
# leave a half-updated (mixed version) installation behind.
set -eu

REPO="19man91-ops/podforkop"
STAGE="$(mktemp -d /tmp/podkop-update.XXXXXX)"
REF=""

cleanup() {
    rm -rf "$STAGE"
}
trap cleanup EXIT INT TERM

fetch() {
    local url="$1"
    local out="$2"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --connect-timeout 20 -o "$out" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$out" "$url"
    elif command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch -q -O "$out" "$url"
    else
        echo "Error: curl, wget or uclient-fetch is required." >&2
        return 1
    fi
}

echo "Updating PodForCOP UI and backend scripts..."

# Prefer the version of the installed Podkop so that a raw-file update matches
# the packages that are already installed. Fall back to the main branch only
# for development installs.
installed_version=""
if [ -x /usr/bin/podkop ]; then
    installed_version="$(/usr/bin/podkop show_version 2>/dev/null | tr -d 'v\r\n' || true)"
fi
case "$installed_version" in
[0-9]*.[0-9]*.[0-9]*) REF="$installed_version" ;;
*) REF="main" ;;
esac

BASE_URL="https://raw.githubusercontent.com/${REPO}/${REF}"
echo "Using source: ${REF}"

fetch_one() {
    local remote_path="$1"
    local staged_name="$2"

    if ! fetch "${BASE_URL}/${remote_path}" "$STAGE/$staged_name"; then
        echo "Error: failed to download ${remote_path}" >&2
        return 1
    fi
    if [ ! -s "$STAGE/$staged_name" ]; then
        echo "Error: empty file ${remote_path}" >&2
        return 1
    fi
}

echo "[1/3] Downloading UI files..."
UI_DIR="luci-app-podkop/htdocs/luci-static/resources/view/podkop"
for file in main.js podkop.js section.js settings.js dashboard.js diagnostic.js monitoring.js; do
    fetch_one "${UI_DIR}/${file}" "ui-${file}"
done
fetch_one "${UI_DIR}/fonts/TwemojiCountryFlags.woff2" "ui-TwemojiCountryFlags.woff2"

echo "[2/3] Downloading backend files..."
fetch_one "podkop/files/usr/bin/podkop" "bin-podkop"
LIB_DIR="podkop/files/usr/lib"
for file in constants.sh helpers.sh logging.sh nft.sh rulesets.sh \
    sing_box_config_facade.sh sing_box_config_manager.sh subscriptions.sh; do
    fetch_one "${LIB_DIR}/${file}" "lib-${file}"
done
fetch_one "podkop/files/etc/init.d/podkop" "init-podkop"
fetch_one "luci-app-podkop/root/usr/share/rpcd/acl.d/luci-app-podkop.json" "acl-luci-app-podkop.json"

echo "[3/3] Applying files..."

# The repository keeps version placeholders; the package build replaces them at
# build time. Substitute the running version here for consistent UI output.
if [ "$REF" != "main" ]; then
    sed -i "s/__COMPILED_VERSION_VARIABLE__/${REF}/g" "$STAGE/ui-main.js" 2>/dev/null || true
    sed -i "s/__COMPILED_VERSION_VARIABLE__/${REF}/g" "$STAGE/lib-constants.sh" 2>/dev/null || true
fi

mkdir -p /www/luci-static/resources/view/podkop/fonts
mkdir -p /usr/bin /usr/lib/podkop /etc/init.d
mkdir -p /usr/share/rpcd/acl.d
for file in main.js podkop.js section.js settings.js dashboard.js diagnostic.js monitoring.js; do
    mv "$STAGE/ui-${file}" "/www/luci-static/resources/view/podkop/${file}"
done
mv "$STAGE/ui-TwemojiCountryFlags.woff2" "/www/luci-static/resources/view/podkop/fonts/TwemojiCountryFlags.woff2"

mv "$STAGE/bin-podkop" /usr/bin/podkop
for file in constants.sh helpers.sh logging.sh nft.sh rulesets.sh \
    sing_box_config_facade.sh sing_box_config_manager.sh subscriptions.sh; do
    mv "$STAGE/lib-${file}" "/usr/lib/podkop/${file}"
done
mv "$STAGE/init-podkop" /etc/init.d/podkop
mv "$STAGE/acl-luci-app-podkop.json" /usr/share/rpcd/acl.d/luci-app-podkop.json

chmod +x /usr/bin/podkop /etc/init.d/podkop

echo "Flushing LuCI caches and restarting web services..."
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache* /tmp/luci-sessions* 2>/dev/null || true

/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/podkop restart >/dev/null 2>&1 || true

echo ""
echo "PodForCOP updated successfully (source: ${REF})."
echo "Press Ctrl + F5 in the browser (or open LuCI in a private window) to reset the JS cache."
