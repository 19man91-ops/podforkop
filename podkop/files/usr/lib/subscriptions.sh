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

    if ! curl --fail --location --silent --proto '=http,https' --proto-redir '=http,https' \
        --connect-timeout 10 --max-time 60 --max-filesize 10485760 \
        --output "$raw_file" "$url"; then
        PODKOP_SUBSCRIPTIONS_FAILED=1
        log "Could not download $kind subscription $index for section $section; leaving the cache unchanged" "warn"
        rm -f "$raw_file" "$links_file"
        return 1
    fi

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
        esac
    done
    [ "$old_noglob" = "1" ] || set +f
}

_subscription_refresh_section() {
    local section="$1"
    local selector_subscription_urls urltest_subscription_urls
    config_get selector_subscription_urls "$section" "selector_subscription_urls"
    config_get urltest_subscription_urls "$section" "urltest_subscription_urls"
    _subscription_refresh_list "$section" selector "$selector_subscription_urls"
    _subscription_refresh_list "$section" urltest "$urltest_subscription_urls"
}

subscription_refresh_all() {
    PODKOP_SUBSCRIPTIONS_CHANGED=0
    PODKOP_SUBSCRIPTIONS_FAILED=0
    config_foreach _subscription_refresh_section "section"
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
        esac
    done
    [ "$old_noglob" = "1" ] || set +f
}

subscription_update() {
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
