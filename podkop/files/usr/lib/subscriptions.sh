# Downloads and expands HTTP(S) proxy subscriptions for selector and URLTest sections.

PODKOP_SUBSCRIPTION_CACHE_DIR="/etc/podkop/subscriptions"

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
    local encoded remainder

    if ! grep -Eiq '^[[:space:]]*(vless|vmess|trojan|ss|socks|socks4a?|socks5h?|hysteria2|hy2|hysteria|tuic|http|https|anytls|naive\+(https|quic))://' "$input_file"; then
        encoded="$(tr -d '[:space:]' < "$input_file" | tr '_-' '/+')"
        remainder=$((${#encoded} % 4))
        case "$remainder" in
        2) encoded="${encoded}==" ;;
        3) encoded="${encoded}=" ;;
        1)
            rm -f "$decoded_file"
            return 1
            ;;
        esac

        if ! printf '%s' "$encoded" | base64 -d > "$decoded_file" 2>/dev/null; then
            rm -f "$decoded_file"
            return 1
        fi
        candidate_file="$decoded_file"
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
    rm -f "$decoded_file"
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

subscription_update() {
    if sing_box_uses_subscription_providers; then
        log "Updating proxy subscriptions via sing-box-forkop..."
        if /etc/init.d/sing-box status >/dev/null 2>&1; then
            /usr/bin/podkop clash_api update_provider >/dev/null 2>&1 || /etc/init.d/sing-box reload 2>/dev/null || /etc/init.d/sing-box restart
        fi
        log "Proxy subscriptions updated"
        return 0
    fi
    subscription_refresh_all
    if [ "$PODKOP_SUBSCRIPTIONS_CHANGED" = "1" ]; then
        log "Proxy subscriptions changed; reloading Podkop"
        /etc/init.d/podkop reload
    elif [ "$PODKOP_SUBSCRIPTIONS_FAILED" = "1" ]; then
        log "One or more proxy subscriptions could not be updated; cached data was left unchanged" "warn"
    else
        log "Proxy subscriptions are up to date"
    fi
}
