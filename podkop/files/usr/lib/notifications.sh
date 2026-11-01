# Telegram notifications and notification helpers.
#
# Settings (UCI /etc/config/podkop, section "settings"):
#   telegram_notifications_enabled  0/1
#   telegram_bot_token              bot token from @BotFather
#   telegram_chat_id                target chat/user id
#
# All network calls are best-effort and must never break the caller.

PODKOP_TELEGRAM_STATE_FILE="/tmp/podkop-telegram.state"
PODKOP_TELEGRAM_TIMEOUT="${PODKOP_TELEGRAM_TIMEOUT:-10}"

# Sends one message to Telegram. Arguments: message text.
telegram_send_message() {
    local message="$1"
    local enabled token chat_id

    config_get_bool enabled "settings" "telegram_notifications_enabled" 0
    [ "$enabled" -eq 1 ] || return 1

    config_get token "settings" "telegram_bot_token"
    config_get chat_id "settings" "telegram_chat_id"
    [ -n "$token" ] && [ -n "$chat_id" ] || return 1

    if command -v curl >/dev/null 2>&1; then
        curl -fsS --max-time "$PODKOP_TELEGRAM_TIMEOUT" \
            -X POST "https://api.telegram.org/bot${token}/sendMessage" \
            --data-urlencode "chat_id=${chat_id}" \
            --data-urlencode "text=${message}" \
            --data-urlencode "disable_web_page_preview=true" >/dev/null 2>&1
        return $?
    fi

    return 1
}

# Sends a notification at most once per interval (seconds) for the given event key.
# Arguments: key, interval seconds, message.
telegram_notify_limited() {
    local key="$1"
    local interval="$2"
    local message="$3"
    local now last

    now=$(date +%s)
    last=0
    if [ -r "$PODKOP_TELEGRAM_STATE_FILE" ]; then
        last=$(awk -F'|' -v k="$key" '$1 == k { print $2 }' "$PODKOP_TELEGRAM_STATE_FILE" 2>/dev/null | tail -n 1)
    fi
    case "$last" in
    '' | *[!0-9]*) last=0 ;;
    esac

    [ $((now - last)) -lt "$interval" ] && return 0

    telegram_send_message "$message" || return 1

    {
        touch "$PODKOP_TELEGRAM_STATE_FILE" 2>/dev/null || true
        awk -F'|' -v k="$key" '$1 != k' "$PODKOP_TELEGRAM_STATE_FILE" 2>/dev/null > "$PODKOP_TELEGRAM_STATE_FILE.tmp" || true
        mv "$PODKOP_TELEGRAM_STATE_FILE.tmp" "$PODKOP_TELEGRAM_STATE_FILE" 2>/dev/null || true
        printf '%s|%s\n' "$key" "$now" >> "$PODKOP_TELEGRAM_STATE_FILE" 2>/dev/null || true
    }
}

telegram_notify_update_success() {
    telegram_notify_limited "subscriptions_updated" 3600 \
        "✅ Podkop: списки и подписки успешно обновлены."
}

telegram_notify_update_failure() {
    telegram_notify_limited "subscriptions_failed" 1800 \
        "🔴 Podkop: не удалось обновить подписки. Проверьте логи: logread -e podkop"
}

telegram_notify_proxies_down() {
    telegram_notify_limited "proxies_down" 3600 \
        "🔴 Podkop: проверка прокси не удалась — возможно, все серверы недоступны."
}

# Sends warnings for subscriptions that expire soon (or already expired).
# Reads the cache written by subscription_info_refresh.
telegram_notify_expiring_subscriptions() {
    local cache="$PODKOP_SUBSCRIPTION_INFO_CACHE"
    local now section days

    [ -r "$cache" ] || return 0
    now=$(date +%s)

    for section in $(jq -r '.sections[]? | select(.expire > 0) | .section' "$cache" 2>/dev/null); do
        days=$(jq -r --arg section "$section" --argjson now "$now" '
            .sections[]? | select(.section == $section) | ((.expire - $now) / 86400 | floor)
        ' "$cache" 2>/dev/null | head -n 1)
        case "$days" in
        '' | *[!0-9-]*) continue ;;
        esac

        if [ "$days" -lt 0 ]; then
            telegram_notify_limited "expired_${section}" 86400 \
                "🔴 Podkop: срок действия подписки в секции «${section}» истёк."
        elif [ "$days" -le 3 ]; then
            telegram_notify_limited "expiring_${section}" 86400 \
                "⚠️ Podkop: подписка в секции «${section}» заканчивается через ${days} дн."
        fi
    done
}
