#!/bin/sh
# shellcheck shell=dash

REPO="https://api.github.com/repos/19man91-ops/podforkop/releases/latest"
ENGINE_REPO="https://api.github.com/repos/19man91-ops/podforkop/releases/tags/podkop-engine-current"
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

pkg_is_installed () {
    local pkg_name="$1"

    if [ "$PKG_IS_APK" -eq 1 ]; then
        # grep -q should work without change based on example from documentation
        # apk list --installed --providers dnsmasq
        # <dnsmasq> dnsmasq-full-2.90-r3 x86_64 {feeds/base/package/network/services/dnsmasq} (GPL-2.0) [installed]
        apk list --installed | grep -q "$pkg_name"
    else
        opkg list-installed | grep -q "$pkg_name"
    fi
}

pkg_remove() {
    local pkg_name="$1"

    if [ "$PKG_IS_APK" -eq 1 ]; then
        # TODO: check --force-depends flag
        # Nothing here: https://openwrt.org/docs/guide-user/additional-software/opkg-to-apk-cheatsheet
        apk del "$pkg_name"
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

    if command -v curl >/dev/null 2>&1; then
        check_response=$(curl -s "https://api.github.com/repos/19man91-ops/podforkop/releases/latest")

        if echo "$check_response" | grep -q 'API rate limit '; then
            msg "You've reached the GitHub rate limit. Repeat in five minutes."
            exit 1
        fi
    fi

    local pkg_ext
    if [ "$PKG_IS_APK" -eq 1 ]; then
        pkg_ext=apk
    else
        pkg_ext=ipk
    fi

    # Download assets through api.github.com, not browser_download_url: the 302 from
    # github.com carries a ~9KB Content-Security-Policy header and uclient-fetch
    # (/usr/bin/wget) stalls until timeout on header lines over its 4KB read buffer
    wget -qO- "$REPO" | tr '{' '\n' \
        | sed -n "s|.*\"url\":\"\([^\"]*/releases/assets/[0-9]*\)\".*\"name\":\"\([^\"]*\.$pkg_ext\)\".*|\1 \2|p" \
        | while read -r url filename; do
        filepath="$DOWNLOAD_DIR/$filename"

        attempt=0
        while [ $attempt -lt $COUNT ]; do
            msg "Download $filename (count $((attempt+1)))..."
            if wget -q --header="Accept: application/octet-stream" -O "$filepath" "$url"; then
                if [ -s "$filepath" ]; then
                    msg "$filename successfully downloaded"
                    break
                fi
            fi
            msg "Download error for $filename. Retrying..."
            rm -f "$filepath"
            attempt=$((attempt+1))
        done

        if [ $attempt -eq $COUNT ]; then
            msg "Failed to download $filename after $COUNT attempts"
        fi
    done

    # Check if any files were downloaded
    if ! ls "$DOWNLOAD_DIR"/*podkop* >/dev/null 2>&1; then
        msg "No packages were downloaded successfully"
        exit 1
    fi

    install_podkop_engine "$pkg_ext"

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
                pkg_remove luci-i18n-podkop*
                pkg_install "$DOWNLOAD_DIR/$ru"
        else
            msg "Русский язык интерфейса ставим? y/n (Install the Russian interface language?)"
            while true; do
                read -r -p '' RUS
                case $RUS in
                y)
                    pkg_remove luci-i18n-podkop*
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

    if [ "$PKG_IS_APK" -eq 1 ]; then
        arch=$(apk --print-arch 2>/dev/null)
    else
        arch=$(sed -n "s/^DISTRIB_ARCH='\([^']*\)'.*/\1/p" /etc/openwrt_release)
        if [ -z "$arch" ]; then
            arch=$(opkg print-architecture | awk '$1 == "arch" && $2 != "all" && $2 != "noarch" { value=$2 } END { print value }')
        fi
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
    fi

    arch=$(get_package_arch) || {
        msg "Could not determine the OpenWrt package architecture for podkop-engine."
        exit 1
    }

    msg "Finding $engine_package package for $arch..."
    release_data="$DOWNLOAD_DIR/podkop-engine-release.json"
    if ! wget -q -O "$release_data" "$ENGINE_REPO"; then
        msg "Could not read the podkop-engine package mirror from the PodForCOP repository."
        exit 1
    fi

    asset=$(tr '{' '\n' < "$release_data" \
        | sed -n "s|.*\"url\":\"\([^\"]*/releases/assets/[0-9]*\)\".*\"name\":\"\(${engine_package}_[^\"]*_openwrt_${arch}\.${pkg_ext}\)\".*|\1 \2|p" \
        | head -n 1)
    if [ -z "$asset" ]; then
        msg "The PodForCOP podkop-engine mirror has no $pkg_ext package for OpenWrt architecture $arch."
        exit 1
    fi

    checksum_url=$(tr '{' '\n' < "$release_data" \
        | sed -n 's|.*"url":"\([^"]*/releases/assets/[0-9]*\)".*"name":"SHA256SUMS".*|\1|p' \
        | head -n 1)
    if [ -z "$checksum_url" ]; then
        msg "The podkop-engine mirror has no SHA256SUMS asset."
        exit 1
    fi
    checksum_file="$DOWNLOAD_DIR/podkop-engine-SHA256SUMS"
    if ! wget -q --header="Accept: application/octet-stream" -O "$checksum_file" "$checksum_url" \
        || [ ! -s "$checksum_file" ]; then
        msg "Could not download podkop-engine checksums."
        exit 1
    fi

    filename=${asset#* }
    filepath="$DOWNLOAD_DIR/$filename"
    attempt=0
    while [ "$attempt" -lt "$COUNT" ]; do
        msg "Downloading $filename (attempt $((attempt + 1)))..."
        if wget -q --header="Accept: application/octet-stream" -O "$filepath" "${asset%% *}" \
            && [ -s "$filepath" ]; then
            break
        fi
        rm -f "$filepath"
        attempt=$((attempt + 1))
    done
    if [ "$attempt" -eq "$COUNT" ]; then
        msg "Failed to download $filename after $COUNT attempts."
        exit 1
    fi

    expected_hash=$(awk -v filename="$filename" '{ name=$2; sub(/^\*/, "", name); sub(/^\.\//, "", name); if (name == filename) { print $1; exit } }' "$checksum_file")
    actual_hash=$(sha256sum "$filepath" | awk '{print $1}')
    if [ -z "$expected_hash" ] || [ "$actual_hash" != "$expected_hash" ]; then
        msg "Checksum verification failed for $filename."
        rm -f "$filepath"
        exit 1
    fi

    if [ "$PKG_IS_APK" -eq 0 ]; then
        if [ -n "$installed_engine_package" ] && [ "$installed_engine_package" != "$engine_package" ]; then
            msg "Switching from $installed_engine_package to $engine_package..."
            service podkop stop >/dev/null 2>&1 || true
            opkg remove --force-depends "$installed_engine_package" || {
                msg "Could not remove the previous podkop-engine package."
                exit 1
            }
        elif [ -z "$installed_engine_package" ]; then
            msg "Replacing the OpenWrt sing-box package with $engine_package..."
            service podkop stop >/dev/null 2>&1 || true
            opkg remove --force-depends sing-box sing-box-tiny >/dev/null 2>&1 || true
        fi
    fi

    msg "Installing $filename..."
    if [ "$PKG_IS_APK" -eq 1 ] && [ -n "$installed_engine_package" ] \
        && [ "$installed_engine_package" != "$engine_package" ]; then
        if ! apk add --allow-untrusted "$filepath" "!$installed_engine_package"; then
            msg "Could not install podkop-engine. Check available flash space and package-manager output."
            exit 1
        fi
    elif ! pkg_install "$filepath"; then
        msg "Could not install podkop-engine. Check available flash space and package-manager output."
        exit 1
    fi
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
    REQUIRED_SPACE=25600 # 25MB in KB; includes the podkop-engine core

    if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
        msg "Error: Insufficient space in flash"
        msg "Available: $((AVAILABLE_SPACE/1024))MB"
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
