# Downloads and expands HTTP(S) proxy subscriptions for selector and URLTest sections.

PODKOP_SUBSCRIPTION_CACHE_DIR="/etc/podkop/subscriptions"
PODKOP_SUBSCRIPTION_INFO_CACHE="${PODKOP_SUBSCRIPTION_CACHE_DIR}/info.json"
# Seconds to wait for a subscription server when collecting subscription-userinfo
PODKOP_SUBSCRIPTION_INFO_TIMEOUT="${PODKOP_SUBSCRIPTION_INFO_TIMEOUT:-10}"

_subscription_cache_file() {
    local section="$1"
    local kind="$2"
    local url="$3"
    local source_hash
    section="$(printf '%s' "$section" | tr -cd '[:alnum:]_-')"
    source_hash="$(printf '%s' "$url" | md5sum | awk '{print $1}')"
    printf '%s/%s_%s_%s.txt' "$PODKOP_SUBSCRIPTION_CACHE_DIR" "$section" "$kind" "$source_hash"
}

_subscription_extract_links() {
    local input_file="$1"
    local output_file="$2"
    local candidate_file="$input_file"
    local decoded_file="$input_file.decoded"
    local parsed_file="$input_file.parsed"
    local encoded remainder

    # 1. Check if Base64 encoded
    if ! grep -Eiq '^[[:space:]]*(vless|vmess|trojan|ss|socks|socks4a?|socks5h?|hysteria2|hy2|hysteria|tuic|http|https|anytls|naive\+(https|quic))://' "$input_file" && \
       ! grep -Eq '^[[:space:]]*[\{\[]' "$input_file" && \
       ! grep -Eq '^[[:space:]]*proxies:' "$input_file"; then
        encoded="$(tr -d '[:space:]' < "$input_file" | tr '_-' '/+')"
        remainder=$((${#encoded} % 4))
        case "$remainder" in
        2) encoded="${encoded}==" ;;
        3) encoded="${encoded}=" ;;
        1)
            rm -f "$decoded_file" "$parsed_file"
            return 1
            ;;
        esac

        if printf '%s' "$encoded" | base64 -d > "$decoded_file" 2>/dev/null; then
            candidate_file="$decoded_file"
        fi
    fi

    rm -f "$parsed_file"

    # 2. Try SIP008 Shadowsocks JSON
    if jq -e '.servers and (.servers | type == "array")' "$candidate_file" >/dev/null 2>&1; then
        jq -r '.servers[]? | select(.server and .server_port and .method and .password) |
            "ss://" + ((.method + ":" + .password) | @base64) + "@" + (.server|tostring) + ":" + (.server_port|tostring) + (if .remarks then ("#" + (.remarks|@uri)) else "" end)' \
            "$candidate_file" >> "$parsed_file" 2>/dev/null
    fi

    # 3. Try sing-box / Xray JSON outbounds
    if [ ! -s "$parsed_file" ] && jq -e '.outbounds and (.outbounds | type == "array")' "$candidate_file" >/dev/null 2>&1; then
        jq -r '.outbounds[]? |
            if .type == "vless" then
                "vless://" + (.uuid // "") + "@" + (.server // "") + ":" + ((.server_port // 443)|tostring) + "?security=" + (if .tls?.enabled then "tls" else "none" end) + (if .tag then "#" + (.tag|@uri) else "" end)
            elif .type == "trojan" then
                "trojan://" + (.password // "") + "@" + (.server // "") + ":" + ((.server_port // 443)|tostring) + "?security=" + (if .tls?.enabled then "tls" else "none" end) + (if .tag then "#" + (.tag|@uri) else "" end)
            elif .type == "shadowsocks" then
                "ss://" + (((.method // "") + ":" + (.password // "")) | @base64) + "@" + (.server // "") + ":" + ((.server_port // 8388)|tostring) + (if .tag then "#" + (.tag|@uri) else "" end)
            elif .type == "hysteria2" then
                "hysteria2://" + (.password // "") + "@" + (.server // "") + ":" + ((.server_port // 443)|tostring) + (if .tag then "#" + (.tag|@uri) else "" end)
            elif .type == "socks" then
                "socks5://" + (if .username then (.username + ":" + (.password // "") + "@") else "" end) + (.server // "") + ":" + ((.server_port // 1080)|tostring) + (if .tag then "#" + (.tag|@uri) else "" end)
            else empty end' "$candidate_file" >> "$parsed_file" 2>/dev/null
    fi

    # 4. Try Clash / Mihomo YAML
    if [ ! -s "$parsed_file" ] && grep -Eq '^[[:space:]]*proxies:' "$candidate_file" 2>/dev/null; then
        awk '
            BEGIN { in_proxies = 0 }
            /^[[:space:]]*proxies:/ { in_proxies = 1; next }
            /^[a-zA-Z0-9_-]+:/ && !/^[[:space:]]*proxies:/ { in_proxies = 0 }
            in_proxies && /^[[:space:]]*-/ {
                if (type != "" && server != "" && port != "") {
                    emit(type, name, server, port, uuid, password, cipher)
                }
                type = ""; name = ""; server = ""; port = ""; uuid = ""; password = ""; cipher = ""
            }
            in_proxies {
                line = $0
                sub(/^[[:space:]]*-[[:space:]]*/, "", line)
                sub(/^[[:space:]]+/, "", line)
                colon = index(line, ":")
                if (colon > 0) {
                    k = substr(line, 1, colon - 1)
                    v = substr(line, colon + 1)
                    sub(/^[[:space:]]+/, "", v)
                    sub(/[[:space:]]+$/, "", v)
                    gsub(/^["'\''"]|["'\''"]$/, "", v)
                    if (k == "name") name = v
                    else if (k == "type") type = tolower(v)
                    else if (k == "server") server = v
                    else if (k == "port") port = v
                    else if (k == "uuid") uuid = v
                    else if (k == "password") password = v
                    else if (k == "cipher") cipher = v
                }
            }
            END {
                if (in_proxies && type != "" && server != "" && port != "") {
                    emit(type, name, server, port, uuid, password, cipher)
                }
            }
            function emit(t, n, s, p, u, pw, c) {
                tag = (n != "" ? "#" n : "")
                if (t == "ss") {
                    print "ss://" c ":" pw "@" s ":" p tag
                } else if (t == "vless") {
                    print "vless://" u "@" s ":" p "?security=tls" tag
                } else if (t == "trojan") {
                    print "trojan://" pw "@" s ":" p "?security=tls" tag
                } else if (t == "hysteria2" || t == "hy2") {
                    print "hysteria2://" pw "@" s ":" p tag
                } else if (t == "socks5" || t == "socks") {
                    print "socks5://" (pw != "" ? pw "@" : "") s ":" p tag
                }
            }
        ' "$candidate_file" >> "$parsed_file" 2>/dev/null
    fi

    # 5. Fallback or Plain links
    if [ -s "$parsed_file" ]; then
        candidate_file="$parsed_file"
    fi

    awk '
        {
            sub(/\r$/, "")
            sub(/^[[:space:]]+/, "")
            sub(/[[:space:]]+$/, "")
            if (tolower($0) ~ /^(vless|vmess|trojan|ss|socks|socks4a?|socks5h?|hysteria2|hy2|hysteria|tuic|http|https|anytls|naive\+(https|quic)):\/\//) {
                separator = index($0, "://")
                print tolower(substr($0, 1, separator - 1)) substr($0, separator)
            }
        }
    ' "$candidate_file" > "$output_file"
    rm -f "$decoded_file" "$parsed_file"
    [ -s "$output_file" ]
}

_subscription_refresh_one() {
    local section="$1"
    local kind="$2"
    local index="$3"
    local url="$4"
    local cache_file temp_base raw_file links_file content_size

    cache_file="$(_subscription_cache_file "$section" "$kind" "$url")"
    mkdir -p "$PODKOP_SUBSCRIPTION_CACHE_DIR"
    chmod 700 "$PODKOP_SUBSCRIPTION_CACHE_DIR"
    temp_base="$cache_file.tmp.$$"
    raw_file="$temp_base.raw"
    links_file="$temp_base.links"
    rm -f "$raw_file" "$links_file"

    case "$url" in
    /*)
        if [ ! -r "$url" ] || ! cp "$url" "$raw_file"; then
            PODKOP_SUBSCRIPTIONS_FAILED=1
            log "Could not read local $kind subscription $index for section $section; leaving the cache unchanged" "warn"
            rm -f "$raw_file" "$links_file"
            return 1
        fi
        ;;
    http://* | https://*)
        if ! curl --fail --location --silent --proto '=http,https' --proto-redir '=http,https' \
            --connect-timeout 10 --max-time 60 --max-filesize 10485760 \
            --output "$raw_file" "$url"; then
            PODKOP_SUBSCRIPTIONS_FAILED=1
            log "Could not download $kind subscription $index for section $section; leaving the cache unchanged" "warn"
            rm -f "$raw_file" "$links_file"
            return 1
        fi
        ;;
    *)
        PODKOP_SUBSCRIPTIONS_FAILED=1
        log "Unsupported source for $kind subscription $index in section $section" "warn"
        rm -f "$raw_file" "$links_file"
        return 1
        ;;
    esac

    content_size="$(wc -c < "$raw_file" | tr -d '[:space:]')"
    if [ "$content_size" -gt 10485760 ]; then
        PODKOP_SUBSCRIPTIONS_FAILED=1
        log "$kind subscription $index for section $section exceeds the 10 MiB limit" "warn"
        rm -f "$raw_file" "$links_file"
        return 1
    fi

    if ! _subscription_extract_links "$raw_file" "$links_file"; then
        PODKOP_SUBSCRIPTIONS_FAILED=1
        log "$kind subscription $index for section $section contains no supported proxy links" "warn"
        rm -f "$raw_file" "$links_file"
        return 1
    fi

    chmod 600 "$links_file"
    if ! cmp -s "$links_file" "$cache_file" 2>/dev/null; then
        mv "$links_file" "$cache_file"
        chmod 600 "$cache_file"
        PODKOP_SUBSCRIPTIONS_CHANGED=1
        log "Updated $kind subscription $index for section $section"
    else
        rm -f "$links_file"
        log "$kind subscription $index for section $section is unchanged" "debug"
    fi
    rm -f "$raw_file"
    return 0
}

_subscription_refresh_list() {
    local section="$1"
    local kind="$2"
    local urls="$3"
    local url index old_noglob

    index=0
    case "$-" in
    *f*) old_noglob=1 ;;
    *) old_noglob=0 ;;
    esac
    set -f
    for url in $urls; do
        index=$((index + 1))
        case "$url" in
        http://* | https://*)
            _subscription_refresh_one "$section" "$kind" "$index" "$url" || true
            ;;
        /*)
            _subscription_refresh_one "$section" "$kind" "$index" "$url" || true
            ;;
        esac
    done
    [ "$old_noglob" = "1" ] || set +f
}

_subscription_refresh_section() {
    local section="$1"
    local selector_subscription_urls urltest_subscription_urls subscription_urls
    if ! section_is_enabled "$section"; then
        return 0
    fi
    config_get selector_subscription_urls "$section" "selector_subscription_urls"
    config_get urltest_subscription_urls "$section" "urltest_subscription_urls"
    config_get subscription_urls "$section" "subscription_urls"
    _subscription_refresh_list "$section" subscription "$subscription_urls"
    _subscription_refresh_list "$section" selector "$selector_subscription_urls"
    _subscription_refresh_list "$section" urltest "$urltest_subscription_urls"
}

subscription_refresh_all() {
    PODKOP_SUBSCRIPTIONS_CHANGED=0
    PODKOP_SUBSCRIPTIONS_FAILED=0
    if sing_box_uses_subscription_providers; then
        log "Proxy subscription parsing and updates are handled by sing-box-forkop" "debug"
        return 0
    fi
    config_foreach _subscription_refresh_section "section"
}

configure_subscription_providers() {
    local section="$1"
    local kind="$2"
    local sources="$3"
    local source index tag hash update_interval old_noglob

    PODKOP_SUBSCRIPTION_PROVIDER_TAGS=""
    index=0
    case "$-" in
    *f*) old_noglob=1 ;;
    *) old_noglob=0 ;;
    esac
    set -f
    for source in $sources; do
        case "$source" in
        http://* | https://* | /*)
            index=$((index + 1))
            hash="$(printf '%s' "$section:$kind:$index:$source" | md5sum | awk '{print $1}')"
            tag="podkop-sub-${hash}"
            case "$source" in
            http://* | https://*)
                config_get update_interval "settings" "update_interval" "1d"
                case "$update_interval" in
                1h) update_interval="1h" ;;
                3h) update_interval="3h" ;;
                12h) update_interval="12h" ;;
                1d) update_interval="24h" ;;
                3d) update_interval="72h" ;;
                *) update_interval="24h" ;;
                esac
                config="$(sing_box_cm_add_remote_subscription_provider "$config" "$tag" "$source" "$update_interval")"
                ;;
            /*)
                if [ -r "$source" ]; then
                    config="$(sing_box_cm_add_local_subscription_provider "$config" "$tag" "$source")"
                else
                    log "Local subscription file for section $section is not readable; skipping it" "warn"
                    continue
                fi
                ;;
            esac
            if [ -n "$PODKOP_SUBSCRIPTION_PROVIDER_TAGS" ]; then
                PODKOP_SUBSCRIPTION_PROVIDER_TAGS="$PODKOP_SUBSCRIPTION_PROVIDER_TAGS,$tag"
            else
                PODKOP_SUBSCRIPTION_PROVIDER_TAGS="$tag"
            fi
            ;;
        *)
            log "Unsupported source for $kind subscription in section $section" "warn"
            ;;
        esac
    done
    [ "$old_noglob" = "1" ] || set +f
    PODKOP_SUBSCRIPTION_PROVIDER_TAGS="$(comma_string_to_json_array "$PODKOP_SUBSCRIPTION_PROVIDER_TAGS")"
}

subscription_cached_links() {
    local section="$1"
    local kind="$2"
    local urls="$3"
    local url index cache_file link old_noglob

    index=0
    case "$-" in
    *f*) old_noglob=1 ;;
    *) old_noglob=0 ;;
    esac
    set -f
    for url in $urls; do
        index=$((index + 1))
        case "$url" in
        http://* | https://*)
            cache_file="$(_subscription_cache_file "$section" "$kind" "$url")"
            if [ -r "$cache_file" ]; then
                while IFS= read -r link || [ -n "$link" ]; do
                    [ -n "$link" ] && printf '%s\n' "$link"
                done < "$cache_file"
            fi
            ;;
        /*)
            cache_file="$(_subscription_cache_file "$section" "$kind" "$url")"
            if [ -r "$cache_file" ]; then
                while IFS= read -r link || [ -n "$link" ]; do
                    [ -n "$link" ] && printf '%s\n' "$link"
                done < "$cache_file"
            fi
            ;;
        esac
    done
    [ "$old_noglob" = "1" ] || set +f
}

#######################################
# Collect subscription traffic/expiry information from the standard
# "subscription-userinfo" HTTP header (Marzban, 3X-UI, Remnawave, V2board,
# X-UI, Mihomo and other panels).
#
# Result is cached in $PODKOP_SUBSCRIPTION_INFO_CACHE and read by the LuCI
# Dashboard ("Subscriptions" cards). Only the host name of a subscription is
# stored, never the full URL (it usually contains a secret token).
#######################################

_SUBSCRIPTION_INFO_URLS=""
_subscription_info_collect_url() {
    [ -n "$1" ] && _SUBSCRIPTION_INFO_URLS="${_SUBSCRIPTION_INFO_URLS:+$_SUBSCRIPTION_INFO_URLS }$1"
}

_subscription_section_urls() {
    local section="$1" option

    _SUBSCRIPTION_INFO_URLS=""
    for option in subscription_urls selector_subscription_urls urltest_subscription_urls; do
        config_list_foreach "$section" "$option" _subscription_info_collect_url
    done
    printf '%s' "$_SUBSCRIPTION_INFO_URLS"
}

_subscription_info_number() {
    case "$1" in
    '' | *[!0-9]*) printf '0' ;;
    *) printf '%s' "$1" ;;
    esac
}

_subscription_info_header_value() {
    printf '%s' "$2" | tr ';' '\n' | awk -F= -v key="$1" '
        {
            name = tolower($1)
            gsub(/^[[:space:]]+/, "", name)
            gsub(/[[:space:]]+$/, "", name)
            if (name == key) {
                value = $2
                gsub(/[^0-9]/, "", value)
                print value
                exit
            }
        }'
}

_subscription_info_parse_headers() {
    local headers_file="$1"
    local header

    SUB_INFO_HEADER=""
    SUB_INFO_UPLOAD="0"
    SUB_INFO_DOWNLOAD="0"
    SUB_INFO_TOTAL="0"
    SUB_INFO_EXPIRE="0"

    header=$(grep -i 'subscription-userinfo:' "$headers_file" 2>/dev/null | tail -n 1 | sed 's/^[^:]*://' | tr -d '\r')
    [ -n "$header" ] || return 0

    SUB_INFO_HEADER="$header"
    SUB_INFO_UPLOAD=$(_subscription_info_number "$(_subscription_info_header_value upload "$header")")
    SUB_INFO_DOWNLOAD=$(_subscription_info_number "$(_subscription_info_header_value download "$header")")
    SUB_INFO_TOTAL=$(_subscription_info_number "$(_subscription_info_header_value total "$header")")
    SUB_INFO_EXPIRE=$(_subscription_info_number "$(_subscription_info_header_value expire "$header")")
}

_subscription_info_fetch() {
    local url="$1"
    local headers_file

    SUB_INFO_STATUS="error"
    SUB_INFO_LABEL=""
    SUB_INFO_UPLOAD="0"
    SUB_INFO_DOWNLOAD="0"
    SUB_INFO_TOTAL="0"
    SUB_INFO_EXPIRE="0"

    case "$url" in
    http://* | https://*)
        SUB_INFO_LABEL=$(url_get_host "$url")
        [ -n "$SUB_INFO_LABEL" ] || SUB_INFO_LABEL="subscription"
        headers_file=$(mktemp)

        if command -v curl >/dev/null 2>&1; then
            if curl -sS -L --max-time "$PODKOP_SUBSCRIPTION_INFO_TIMEOUT" \
                -A "podkop-subscription-info/1.0" \
                -D "$headers_file" -o /dev/null "$url" >/dev/null 2>&1; then
                _subscription_info_parse_headers "$headers_file"
                [ -n "$SUB_INFO_HEADER" ] && SUB_INFO_STATUS="ok"
            fi
        elif command -v wget >/dev/null 2>&1; then
            if wget -q -S -O /dev/null --timeout="$PODKOP_SUBSCRIPTION_INFO_TIMEOUT" \
                "$url" 2>"$headers_file"; then
                _subscription_info_parse_headers "$headers_file"
                [ -n "$SUB_INFO_HEADER" ] && SUB_INFO_STATUS="ok"
            fi
        fi

        rm -f "$headers_file"
        ;;
    /*)
        SUB_INFO_LABEL=$(basename "$url")
        SUB_INFO_STATUS="local-file"
        ;;
    *)
        SUB_INFO_LABEL="subscription"
        SUB_INFO_STATUS="unsupported"
        ;;
    esac
}

_subscription_info_source_json() {
    jq -nc \
        --arg label "$SUB_INFO_LABEL" \
        --arg status "$SUB_INFO_STATUS" \
        --argjson upload "$SUB_INFO_UPLOAD" \
        --argjson download "$SUB_INFO_DOWNLOAD" \
        --argjson total "$SUB_INFO_TOTAL" \
        --argjson expire "$SUB_INFO_EXPIRE" \
        '{label: $label, status: $status, upload: $upload, download: $download, total: $total, expire: $expire}'
}

_subscription_info_section() {
    local section="$1"
    local urls url sources_file section_json now

    section_is_enabled "$section" || return 0

    urls=$(_subscription_section_urls "$section")
    [ -n "$urls" ] || return 0

    now=$(date +%s)
    sources_file=$(mktemp)

    for url in $urls; do
        _subscription_info_fetch "$url"
        _subscription_info_source_json >> "$sources_file"
    done

    section_json=$(jq -sc \
        --arg section "$section" \
        --argjson updated "$now" \
        '
        [ .[] | select(.status == "ok") ] as $ok
        | {
            section: $section,
            updated_at: $updated,
            upload: ([ $ok[] | .upload ] | add // 0),
            download: ([ $ok[] | .download ] | add // 0),
            total: ([ $ok[] | .total ] | add // 0),
            expire: ([ $ok[] | select(.expire > 0) | .expire ] | min // 0),
            status: (
                if ($ok | length) == 0 then "no-data"
                elif ($ok | length) == (length) then "ok"
                else "partial"
                end
            ),
            sources: .
        }' "$sources_file")

    printf '%s\n' "$section_json" >> "$PODKOP_SUBSCRIPTION_INFO_SECTIONS_FILE"
    rm -f "$sources_file"
}

subscription_info_refresh() {
    local sections_file cache_tmp now

    mkdir -p "$PODKOP_SUBSCRIPTION_CACHE_DIR"
    sections_file=$(mktemp)
    PODKOP_SUBSCRIPTION_INFO_SECTIONS_FILE="$sections_file"
    now=$(date +%s)

    config_foreach _subscription_info_section "section"

    cache_tmp=$(mktemp)
    if [ -s "$sections_file" ]; then
        jq -s --argjson updated "$now" '{updated_at: $updated, sections: .}' "$sections_file" > "$cache_tmp"
    else
        jq -n --argjson updated "$now" '{updated_at: $updated, sections: []}' > "$cache_tmp"
    fi
    mv "$cache_tmp" "$PODKOP_SUBSCRIPTION_INFO_CACHE"
    chmod 600 "$PODKOP_SUBSCRIPTION_INFO_CACHE" 2>/dev/null || true
    rm -f "$sections_file"

    if type telegram_notify_expiring_subscriptions >/dev/null 2>&1; then
        telegram_notify_expiring_subscriptions >/dev/null 2>&1 || true
    fi
}

# Prints the cached subscription info; "refresh" as the first argument
# downloads fresh data before printing.
subscription_info_show() {
    local refresh="${1:-}"

    if [ "$refresh" = "refresh" ]; then
        subscription_info_refresh >/dev/null 2>&1 || true
    fi

    if [ -r "$PODKOP_SUBSCRIPTION_INFO_CACHE" ] && jq -e . "$PODKOP_SUBSCRIPTION_INFO_CACHE" >/dev/null 2>&1; then
        cat "$PODKOP_SUBSCRIPTION_INFO_CACHE"
    else
        jq -n '{updated_at: 0, sections: []}'
    fi
}

subscription_update() {
    if sing_box_uses_subscription_providers; then
        log "Updating proxy subscriptions via sing-box-forkop..."
        if ! /etc/init.d/sing-box status >/dev/null 2>&1; then
            log "sing-box service is not running; cannot update proxy subscriptions" "warn"
            return 1
        fi
        if /usr/bin/podkop clash_api update_provider >/dev/null 2>&1 || /etc/init.d/sing-box reload 2>/dev/null; then
            log "Proxy subscriptions updated successfully"
            subscription_info_refresh >/dev/null 2>&1 || true
            type telegram_notify_update_success >/dev/null 2>&1 && telegram_notify_update_success || true
            return 0
        else
            log "Failed to update proxy subscriptions via Clash API / reload" "warn"
            type telegram_notify_update_failure >/dev/null 2>&1 && telegram_notify_update_failure || true
            return 1
        fi
    fi
    subscription_refresh_all
    subscription_info_refresh >/dev/null 2>&1 || true
    if [ "$PODKOP_SUBSCRIPTIONS_FAILED" = "1" ]; then
        log "One or more proxy subscriptions could not be updated; cached data was left unchanged" "warn"
        type telegram_notify_update_failure >/dev/null 2>&1 && telegram_notify_update_failure || true
        return 1
    fi
    if [ "$PODKOP_SUBSCRIPTIONS_CHANGED" = "1" ]; then
        log "Proxy subscriptions changed; reloading Podkop"
        /etc/init.d/podkop reload
    else
        log "Proxy subscriptions are up to date"
    fi
    type telegram_notify_update_success >/dev/null 2>&1 && telegram_notify_update_success || true
    return 0
}
