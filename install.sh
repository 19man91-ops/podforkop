#!/bin/sh
# shellcheck shell=dash

GITHUB_REPO="19man91-ops/podforkop"
DOWNLOAD_DIR="/tmp/podkop"
COUNT=3

# Cached flag to switch between ipk or apk package managers
PKG_IS_APK=0
command -v apk >/dev/null 2>&1 && PKG_IS_APK=1

rm -rf "$DOWNLOAD_DIR"
mkdir -p "$DOWNLOAD_DIR"

msg() {
    printf "\033[32;1m%s\033[0m\n" "$1"
}

download_asset() {
    local filename="$1"
    local browser_url="$2"
    local api_url="${3:-}"
    local filepath="$DOWNLOAD_DIR/$filename"
    local attempt=0

    while [ "$attempt" -lt "$COUNT" ]; do
        msg "Download $filename (count $((attempt + 1)))..."
        # 1. Direct release download (not subject to GitHub API rate limits)
        if [ -n "$browser_url" ]; then
            if command -v curl >/dev/null 2>&1; then
                curl -fsSL -o "$filepath" "$browser_url" 2>/dev/null
            else
                wget -q --no-check-certificate -O "$filepath" "$browser_url" 2>/dev/null
            fi
            if [ -s "$filepath" ]; then
                msg "$filename successfully downloaded"
                return 0
            fi
            rm -f "$filepath"
        fi

        # 2. GitHub API asset download fallback
        if [ -n "$api_url" ]; then
            if command -v curl >/dev/null 2>&1; then
                curl -fsSL -H "Accept: application/octet-stream" -o "$filepath" "$api_url" 2>/dev/null
            else
                wget -q --no-check-certificate --header="Accept: application/octet-stream" -O "$filepath" "$api_url" 2>/dev/null
            fi
            if [ -s "$filepath" ]; then
                msg "$filename successfully downloaded"
                return 0
            fi
            rm -f "$filepath"
        fi

        msg "Download error for $filename. Retrying..."
        attempt=$((attempt + 1))
        sleep 1
    done

    msg "Failed to download $filename after $COUNT attempts"
    return 1
}

pkg_is_installed () {
    local pkg_name="$1"

    if [ "$PKG_IS_APK" -eq 1 ]; then
        if apk info -e "$pkg_name" >/dev/null 2>&1; then
            return 0
        fi
        if [ -f /etc/apk/world ] && grep -qx "$pkg_name" /etc/apk/world 2>/dev/null; then
            return 0
        fi
        apk list --installed 2>/dev/null | awk -v package="$pkg_name" '
            {
                for (i = 1; i <= NF; i++) {
                    name = $i
                    sub(/^</, "", name)
                    sub(/>$/, "", name)
                    sub(/-[0-9].*$/, "", name)
                    if (name == package) { found = 1; exit }
                }
            }
            END { exit !found }
        '
    else
        opkg list-installed | awk -v package="$pkg_name" '$1 == package { found = 1 } END { exit !found }'
    fi
}

pkg_remove() {
    local pkg_name="$1"

    if [ "$PKG_IS_APK" -eq 1 ]; then
        apk del "$pkg_name" >/dev/null 2>&1 || true
    else
        opkg remove --force-depends "$pkg_name"
    fi
}

pkg_list_update() {
    if [ "$PKG_IS_APK" -eq 1 ]; then
        apk update
    else
        opkg update
    fi
}

pkg_install() {
    local pkg_file="$1"

    if [ "$PKG_IS_APK" -eq 1 ]; then
        # Can't install without flag based on info from documentation
        # If you're installing a non-standard (self-built) package, use the --allow-untrusted option:
        apk add --allow-untrusted "$pkg_file"
    else
        opkg install "$pkg_file"
    fi
}

update_config() {
    if [ -f "/etc/config/podkop-070" ]; then
        msg "Existing /etc/config/podkop-070 backup found. Keeping it and the current Podkop config."
        return
    fi

    printf "\033[48;5;196m\033[1m╔══════════════════════════════════════════════════════════════════════╗\033[0m\n"
    printf "\033[48;5;196m\033[1m║ ! Обнаружена старая версия podkop.                                   ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ Если продолжите обновление, вам потребуется настроить Podkop заново. ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ Старая конфигурация будет сохранена в /etc/config/podkop-070         ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ Подробности: github.com/19man91-ops/podforkop                        ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ Точно хотите продолжить?                                             ║\033[0m\n"
    printf "\033[48;5;196m\033[1m╚══════════════════════════════════════════════════════════════════════╝\033[0m\n"

    echo ""

    printf "\033[48;5;196m\033[1m╔══════════════════════════════════════════════════════════════════════╗\033[0m\n"
    printf "\033[48;5;196m\033[1m║ ! Detected old podkop version.                                       ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ If you continue the update, you will need to RECONFIGURE podkop.     ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ Your old configuration will be saved to /etc/config/podkop-070       ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ Details: github.com/19man91-ops/podforkop                            ║\033[0m\n"
    printf "\033[48;5;196m\033[1m║ Are you sure you want to continue?                                   ║\033[0m\n"
    printf "\033[48;5;196m\033[1m╚══════════════════════════════════════════════════════════════════════╝\033[0m\n"

    msg "Continue? (yes/no)"

    while true; do
            read -r -p '' CONFIG_UPDATE
            case $CONFIG_UPDATE in

            yes|y|Y)
                mv /etc/config/podkop /etc/config/podkop-070
                wget -O /etc/config/podkop https://raw.githubusercontent.com/19man91-ops/podforkop/main/podkop/files/etc/config/podkop
                msg "Podkop config has been reset to default. Your old config saved in /etc/config/podkop-070"
                break
                ;;
            *)
                msg "Exit"
                exit 1
                ;;
        esac
    done
}

main() {
    check_system

    /usr/sbin/ntpd -q -p 194.190.168.1 -p 216.239.35.0 -p 216.239.35.4 -p 162.159.200.1 -p 162.159.200.123

    pkg_list_update || { echo "Packages list update failed"; exit 1; }

    if [ -f "/etc/init.d/podkop" ]; then
        msg "Podkop is already installed. Upgrading..."
    else
        msg "Installing podkop..."
    fi

    local version=""
    version=$(wget -qO- "https://raw.githubusercontent.com/19man91-ops/podforkop/main/VERSION" 2>/dev/null | tr -d '\r\n')
    case "$version" in
        [0-9]*.[0-9]*.[0-9]*) ;;
        *) version="0.8.9" ;;
    esac

    local pkg_ext
    if [ "$PKG_IS_APK" -eq 1 ]; then
        pkg_ext=apk
    else
        pkg_ext=ipk
    fi

    local luci_pkg ru_pkg podkop_pkg
    if [ "$pkg_ext" = "apk" ]; then
        luci_pkg="luci-app-podkop-${version}-r1.apk"
        ru_pkg="luci-i18n-podkop-ru-${version}.apk"
        podkop_pkg="podkop-${version}-r1.apk"
    else
        luci_pkg="luci-app-podkop-v${version}-r1-all.ipk"
        ru_pkg="luci-i18n-podkop-ru-${version}.ipk"
        podkop_pkg="podkop-v${version}-r1-all.ipk"
    fi

    if ! download_asset "$luci_pkg" "https://github.com/19man91-ops/podforkop/releases/download/${version}/${luci_pkg}"; then
        msg "Failed to download $luci_pkg. Aborting installation."
        exit 1
    fi
    if ! download_asset "$ru_pkg" "https://github.com/19man91-ops/podforkop/releases/download/${version}/${ru_pkg}"; then
        msg "Failed to download $ru_pkg. Aborting installation."
        exit 1
    fi
    if ! download_asset "$podkop_pkg" "https://github.com/19man91-ops/podforkop/releases/download/${version}/${podkop_pkg}"; then
        msg "Failed to download $podkop_pkg. Aborting installation."
        exit 1
    fi

    if download_asset "SHA256SUMS" "https://github.com/19man91-ops/podforkop/releases/download/${version}/SHA256SUMS"; then
        msg "Verifying SHA256 checksums..."
        for pkg_check in "$luci_pkg" "$ru_pkg" "$podkop_pkg"; do
            expected_hash=$(grep "[ /]$pkg_check$" "$DOWNLOAD_DIR/SHA256SUMS" | awk '{print $1}')
            if [ -n "$expected_hash" ] && command -v sha256sum >/dev/null 2>&1; then
                actual_hash=$(sha256sum "$DOWNLOAD_DIR/$pkg_check" | awk '{print $1}')
                if [ "$expected_hash" != "$actual_hash" ]; then
                    msg "SHA256 mismatch for $pkg_check (expected $expected_hash, got $actual_hash)! Aborting."
                    exit 1
                fi
            fi
        done
        msg "SHA256 checksums verified successfully."
    fi

    case "${PODFORCOP_CORE:-forkop}" in
        forkop)
            install_sing_box_forkop "$pkg_ext"
            ;;
        podkop-engine)
            install_podkop_engine "$pkg_ext"
            ;;
        *)
            msg "PODFORCOP_CORE must be 'forkop' or 'podkop-engine'."
            exit 1
            ;;
    esac

    for pkg in podkop luci-app-podkop; do
        file=""
        for f in "$DOWNLOAD_DIR"/"$pkg"*; do
            if [ -f "$f" ]; then
                file=$(basename "$f")
                break
            fi
        done
        if [ -n "$file" ]; then
            msg "Installing $file..."
            pkg_install "$DOWNLOAD_DIR/$file"
            sleep 3
        fi
    done

    ru=""
    for f in "$DOWNLOAD_DIR"/luci-i18n-podkop-ru*; do
        if [ -f "$f" ]; then
            ru=$(basename "$f")
            break
        fi
    done
    if [ -n "$ru" ]; then
        if pkg_is_installed luci-i18n-podkop-ru; then
                msg "Upgrading Russian translation..."
                pkg_remove luci-i18n-podkop-ru
                pkg_install "$DOWNLOAD_DIR/$ru"
        else
            msg "Русский язык интерфейса ставим? y/n (Install the Russian interface language?)"
            while true; do
                read -r -p '' RUS
                case $RUS in
                y)
                    pkg_remove luci-i18n-podkop-ru
                    pkg_install "$DOWNLOAD_DIR/$ru"
                    break
                    ;;
                n)
                    break
                    ;;
                *)
                    echo "Введите y или n"
                    ;;
                esac
            done
        fi
    fi

    find "$DOWNLOAD_DIR" -type f -name '*podkop*' -exec rm {} \;
}

get_package_arch() {
    local arch

    arch=$(sed -n "s/^DISTRIB_ARCH='\([^']*\)'.*/\1/p" /etc/openwrt_release)
    if [ -z "$arch" ] && [ "$PKG_IS_APK" -eq 1 ]; then
        arch=$(apk --print-arch 2>/dev/null)
    elif [ -z "$arch" ]; then
        arch=$(opkg print-architecture | awk '$1 == "arch" && $2 != "all" && $2 != "noarch" { value=$2 } END { print value }')
    fi

    case "$arch" in
        ""|*[!A-Za-z0-9_.-]*) return 1 ;;
    esac
    printf '%s\n' "$arch"
}

install_podkop_engine() {
    local pkg_ext="$1"
    local engine_package installed_engine_package arch asset filename filepath attempt release_data checksum_url checksum_file expected_hash actual_hash

    case "${PODFORCOP_ENGINE_VARIANT:-}" in
        "")
            if pkg_is_installed "podkop-engine-full"; then
                engine_package="podkop-engine-full"
            else
                engine_package="podkop-engine"
            fi
            ;;
        slim) engine_package="podkop-engine" ;;
        full) engine_package="podkop-engine-full" ;;
        *)
            msg "PODFORCOP_ENGINE_VARIANT must be 'slim' or 'full'."
            exit 1
            ;;
    esac

    if pkg_is_installed "podkop-engine-full"; then
        installed_engine_package="podkop-engine-full"
    elif pkg_is_installed "podkop-engine"; then
        installed_engine_package="podkop-engine"
    elif pkg_is_installed "sing-box-forkop"; then
        installed_engine_package="sing-box-forkop"
    fi

    arch=$(get_package_arch) || {
        msg "Could not determine the OpenWrt package architecture for podkop-engine."
        exit 1
    }

    msg "Finding $engine_package package for $arch..."
    checksum_file="$DOWNLOAD_DIR/podkop-engine-SHA256SUMS"
    if ! download_asset "podkop-engine-SHA256SUMS" \
        "https://github.com/19man91-ops/podforkop/releases/download/podkop-engine-current/SHA256SUMS"; then
        msg "Could not download podkop-engine checksums."
        exit 1
    fi

    filename=$(awk -v pkg="$engine_package" -v arch="$arch" -v ext="$pkg_ext" '
        {
            name=$2
            sub(/^\*/, "", name)
            sub(/^\.\//, "", name)
            if (name ~ ("^" pkg "_.*_openwrt_" arch "\\." ext "$")) {
                print name
                exit
            }
        }
    ' "$checksum_file")

    if [ -z "$filename" ]; then
        msg "The PodForCOP podkop-engine mirror has no $pkg_ext package for OpenWrt architecture $arch."
        exit 1
    fi

    expected_hash=$(awk -v filename="$filename" '{ name=$2; sub(/^\*/, "", name); sub(/^\.\//, "", name); if (name == filename) { print $1; exit } }' "$checksum_file")
    filepath="$DOWNLOAD_DIR/$filename"

    if ! download_asset "$filename" \
        "https://github.com/19man91-ops/podforkop/releases/download/podkop-engine-current/$filename"; then
        msg "Failed to download $filename."
        exit 1
    fi

    actual_hash=$(sha256sum "$filepath" | awk '{print $1}')
    if [ -z "$expected_hash" ] || [ "$actual_hash" != "$expected_hash" ]; then
        msg "Checksum verification failed for $filename."
        rm -f "$filepath"
        exit 1
    fi

    service podkop stop >/dev/null 2>&1 || true
    if [ "$PKG_IS_APK" -eq 0 ]; then
        for package in sing-box-forkop sing-box sing-box-tiny podkop-engine podkop-engine-full; do
            if [ "$package" != "$engine_package" ] && pkg_is_installed "$package"; then
                msg "Replacing $package with $engine_package..."
                opkg remove --force-depends "$package" >/dev/null 2>&1 || true
            fi
        done
    fi

    msg "Installing $filename..."
    if [ "$PKG_IS_APK" -eq 1 ]; then
        local apk_conflicts=""
        for package in sing-box-forkop podkop-engine podkop-engine-full; do
            if [ "$package" != "$engine_package" ]; then
                if pkg_is_installed "$package" || ([ -f /etc/apk/world ] && grep -qx "$package" /etc/apk/world 2>/dev/null); then
                    msg "Replacing $package with $engine_package..."
                    apk_conflicts="$apk_conflicts !$package"
                fi
            fi
        done
        # shellcheck disable=SC2086
        if ! apk add --allow-untrusted "$filepath" $apk_conflicts; then
            msg "Retrying $engine_package install with explicit conflict removal..."
            for package in sing-box-forkop podkop-engine podkop-engine-full; do
                [ "$package" = "$engine_package" ] || apk del "$package" >/dev/null 2>&1 || true
            done
            if ! apk add --allow-untrusted "$filepath"; then
                msg "Could not install podkop-engine. Check available flash space and package-manager output."
                exit 1
            fi
        fi
    elif ! pkg_install "$filepath"; then
        msg "Could not install podkop-engine. Check available flash space and package-manager output."
        exit 1
    fi
}

install_sing_box_forkop() {
    local pkg_ext="$1"
    local variant="${PODFORCOP_FORKOP_VARIANT:-}"
    local arch release_data asset filename filepath checksum_url checksum_file expected_hash actual_hash
    local attempt package

    if [ -z "$variant" ] && [ -r /usr/share/sing-box-forkop/variant ]; then
        variant=$(cat /usr/share/sing-box-forkop/variant)
    fi
    [ -n "$variant" ] || variant="base"

    case "$variant" in
        tiny|base|full) ;;
        *)
            msg "PODFORCOP_FORKOP_VARIANT must be 'tiny', 'base', or 'full'."
            exit 1
            ;;
    esac

    arch=$(get_package_arch) || {
        msg "Could not determine the OpenWrt package architecture for sing-box-forkop."
        exit 1
    }

    msg "Finding sing-box-forkop $variant package for $arch..."
    checksum_file="$DOWNLOAD_DIR/sing-box-forkop-SHA256SUMS"
    if ! download_asset "sing-box-forkop-SHA256SUMS" \
        "https://github.com/19man91-ops/podforkop/releases/download/sing-box-forkop-current/SHA256SUMS"; then
        msg "Could not download sing-box-forkop checksums."
        exit 1
    fi

    filename=$(awk -v variant="$variant" -v arch="$arch" -v ext="$pkg_ext" '
        {
            name=$2
            sub(/^\*/, "", name)
            sub(/^\.\//, "", name)
            if (name ~ ("sing-box-forkop_.*_" variant "_" arch "\\." ext "$")) {
                print name
                exit
            }
        }
    ' "$checksum_file")

    if [ -z "$filename" ]; then
        msg "The PodForCOP sing-box-forkop mirror has no $pkg_ext $variant package for OpenWrt architecture $arch."
        exit 1
    fi

    expected_hash=$(awk -v filename="$filename" '{ name=$2; sub(/^\*/, "", name); sub(/^\.\//, "", name); if (name == filename) { print $1; exit } }' "$checksum_file")
    filepath="$DOWNLOAD_DIR/$filename"

    if ! download_asset "$filename" \
        "https://github.com/19man91-ops/podforkop/releases/download/sing-box-forkop-current/$filename"; then
        msg "Failed to download $filename."
        exit 1
    fi

    actual_hash=$(sha256sum "$filepath" | awk '{print $1}')
    if [ -z "$expected_hash" ] || [ "$actual_hash" != "$expected_hash" ]; then
        msg "Checksum verification failed for $filename."
        rm -f "$filepath"
        exit 1
    fi

    service podkop stop >/dev/null 2>&1 || true
    if [ "$PKG_IS_APK" -eq 0 ]; then
        for package in podkop-engine podkop-engine-full sing-box sing-box-tiny sing-box-forkop; do
            if pkg_is_installed "$package"; then
                msg "Replacing $package with sing-box-forkop..."
                pkg_remove "$package" >/dev/null 2>&1 || {
                    msg "Could not remove the previous core package $package."
                    exit 1
                }
            fi
        done
    fi

    msg "Installing $filename..."
    if [ "$PKG_IS_APK" -eq 1 ]; then
        local apk_conflicts=""
        for package in podkop-engine podkop-engine-full; do
            if pkg_is_installed "$package" || ([ -f /etc/apk/world ] && grep -qx "$package" /etc/apk/world 2>/dev/null); then
                msg "Replacing $package with sing-box-forkop..."
                apk_conflicts="$apk_conflicts !$package"
            fi
        done
        # shellcheck disable=SC2086
        if ! apk add --allow-untrusted "$filepath" $apk_conflicts; then
            msg "Retrying sing-box-forkop install with explicit conflict removal..."
            apk del podkop-engine podkop-engine-full >/dev/null 2>&1 || true
            if ! apk add --allow-untrusted "$filepath"; then
                msg "Could not install sing-box-forkop. Check available flash space and package-manager output."
                exit 1
            fi
        fi
    elif ! pkg_install "$filepath"; then
        msg "Could not install sing-box-forkop. Check available flash space and package-manager output."
        exit 1
    fi
}

get_reclaimable_space_kb() {
    local package installed_size reclaimable_space_kb package_control

    reclaimable_space_kb=0
    for package in sing-box sing-box-tiny podkop-engine podkop-engine-full sing-box-forkop; do
        if ! pkg_is_installed "$package"; then
            continue
        fi

        if [ "$PKG_IS_APK" -eq 1 ]; then
            installed_size=$(apk info -s "$package" 2>/dev/null \
                | awk '
                    function to_kib(value, unit) {
                        if (unit == "mib") return value * 1024
                        if (unit == "gib") return value * 1048576
                        if (unit == "kib") return value
                        if (unit == "kb") return value * 1000 / 1024
                        if (unit == "mb") return value * 1000000 / 1024
                        if (unit == "gb") return value * 1000000000 / 1024
                        return int((value + 1023) / 1024)
                    }
                    tolower($0) ~ /installed size:/ {
                        size_line = $0
                        sub(/^.*installed size:[[:space:]]*/, "", size_line)
                        if (size_line == "" && getline > 0) size_line = $0
                        count = split(size_line, size_fields, /[[:space:]]+/)
                        value = size_fields[1]
                        unit = tolower(size_fields[2])
                        if (value ~ /^[0-9]+([.][0-9]+)?$/) {
                            printf "%.0f", to_kib(value, unit)
                            exit
                        }
                    }
                ')
            if [ -z "$installed_size" ]; then
                installed_size=$(du -sk \
                    /overlay/upper/usr/bin/sing-box \
                    /overlay/upper/etc/init.d/sing-box \
                    /overlay/upper/etc/config/sing-box 2>/dev/null \
                    | awk '{ total += $1 } END { if (total) printf "%.0f", total }')
            fi
            case "$installed_size" in
                ''|*[!0-9]*) continue ;;
            esac
            reclaimable_space_kb=$((reclaimable_space_kb + installed_size))
        else
            installed_size=$(opkg status "$package" 2>/dev/null \
                | awk -F ':' '$1 == "Installed-Size" { gsub(/[[:space:]]/, "", $2); print $2; exit }')
            if [ -z "$installed_size" ]; then
                package_control="/usr/lib/opkg/info/$package.control"
                if [ -r "$package_control" ]; then
                    installed_size=$(awk -F ':' '$1 == "Installed-Size" { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$package_control")
                fi
            fi
            if [ -z "$installed_size" ] && pkg_is_installed "$package"; then
                # Some vendor firmware omits Installed-Size from opkg metadata.
                # Count only files that are actually in overlay's writable upperdir.
                installed_size=$(du -sk \
                    /overlay/upper/usr/bin/sing-box \
                    /overlay/upper/etc/init.d/sing-box \
                    /overlay/upper/etc/config/sing-box 2>/dev/null \
                    | awk '{ total += $1 } END { if (total) printf "%.0f", total * 1024 }')
            fi
            case "$installed_size" in
                ''|*[!0-9]*) continue ;;
            esac
            # opkg stores Installed-Size in bytes; df reports available KiB.
            reclaimable_space_kb=$((reclaimable_space_kb + (installed_size + 1023) / 1024))
        fi
    done

    printf '%s\n' "$reclaimable_space_kb"
}

check_system() {
    # Get router model
    MODEL=$(cat /tmp/sysinfo/model)
    msg "Router model: $MODEL"

    # Check OpenWrt version
    openwrt_version=$(cat /etc/openwrt_release | grep DISTRIB_RELEASE | cut -d"'" -f2 | cut -d'.' -f1)
    if [ "$openwrt_version" = "23" ]; then
        msg "OpenWrt 23.05 не поддерживается начиная с podkop 0.5.0"
        msg "Для OpenWrt 23.05 используйте podkop версии 0.4.11 или устанавливайте зависимости и podkop вручную"
        msg "Подробности: https://podkop.net/docs/install/#%d1%83%d1%81%d1%82%d0%b0%d0%bd%d0%be%d0%b2%d0%ba%d0%b0-%d0%bd%d0%b0-2305"
        exit 1
    fi

    # Check available space
    AVAILABLE_SPACE=$(df /overlay | awk 'NR==2 {print $4}')
    RECLAIMABLE_SPACE=$(get_reclaimable_space_kb)
    EFFECTIVE_SPACE=$((AVAILABLE_SPACE + RECLAIMABLE_SPACE))
    REQUIRED_SPACE=25600
    if [ "${PODFORCOP_CORE:-forkop}" = "podkop-engine" ]; then
        if [ "${PODFORCOP_ENGINE_VARIANT:-}" = "full" ] || pkg_is_installed "podkop-engine-full"; then
            REQUIRED_SPACE=46080
        fi
    else
        REQUIRED_SPACE=46080 # sing-box-forkop base package and PodForCOP files
        forkop_variant="${PODFORCOP_FORKOP_VARIANT:-}"
        if [ -z "$forkop_variant" ] && [ -r /usr/share/sing-box-forkop/variant ]; then
            forkop_variant=$(cat /usr/share/sing-box-forkop/variant)
        fi
        [ "$forkop_variant" != "tiny" ] || REQUIRED_SPACE=35840
        [ "$forkop_variant" != "full" ] || REQUIRED_SPACE=56320
    fi

    if [ "$EFFECTIVE_SPACE" -lt "$REQUIRED_SPACE" ]; then
        msg "Error: Insufficient space in flash"
        msg "Available now: $((AVAILABLE_SPACE/1024))MB; space reclaimed from the replaced sing-box package: $((RECLAIMABLE_SPACE/1024))MB"
        msg "Required: $((REQUIRED_SPACE/1024))MB"
        exit 1
    fi

    if ! nslookup google.com >/dev/null 2>&1; then
        msg "DNS is not working."
        exit 1
    fi

    # Check version
    if command -v podkop > /dev/null 2>&1; then
        local version
        version=$(/usr/bin/podkop show_version 2> /dev/null)
        if [ -n "$version" ]; then
            version=$(echo "$version" | sed 's/^v//')
            local major
            local minor
            local patch
            major=$(echo "$version" | cut -d. -f1)
            minor=$(echo "$version" | cut -d. -f2)
            patch=$(echo "$version" | cut -d. -f3)

            # Compare version: must be >= 0.7.0
            if [ "$major" -gt 0 ] ||
                [ "$major" -eq 0 ] && [ "$minor" -gt 7 ] ||
                [ "$major" -eq 0 ] && [ "$minor" -eq 7 ] && [ "$patch" -ge 0 ]; then
                msg "Podkop version >= 0.7.0"
                break
            else
                msg "Podkop version < 0.7.0"
                update_config
            fi
        else
            msg "Unknown podkop version"
            update_config
        fi
    fi

    if pkg_is_installed https-dns-proxy; then
        msg "Conflicting package detected: https-dns-proxy. Remove?"

        while true; do
                read -r -p '' DNSPROXY
                case $DNSPROXY in

                yes|y|Y)
                    pkg_remove luci-app-https-dns-proxy
                    pkg_remove https-dns-proxy
                    pkg_remove luci-i18n-https-dns-proxy*
                    break
                    ;;
                *)
                    msg "Exit"
                    exit 1
                    ;;
        esac
    done
    fi
}

main
