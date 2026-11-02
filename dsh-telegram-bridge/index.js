/**
 * Telegram Bridge — a Host-only DeepSeek Harness plugin that connects Sessions
 * to Telegram chats.
 *
 * Direction 1 (Harness -> Telegram): every durable message of an ordinary
 * (non-subagent) Session is forwarded to the Telegram chat linked to it. In a
 * forum supergroup each Session gets its own topic, so the Telegram topic list
 * mirrors the list of chats created in the Harness Web GUI.
 *
 * Direction 2 (Telegram -> Harness): a Telegram message is admitted as a user
 * prompt in the Session selected for that chat (or in the Session owning the
 * topic), through `ctx.sessionController.prompt()`. The Agent then runs exactly
 * as if the prompt came from the Web GUI, and its reply is mirrored back.
 *
 * Transport: Telegram Bot API long polling through the global `fetch` of the
 * Host process. The bot token is read from a local file on every poll cycle, so
 * it can be configured without restarting the Harness.
 *
 * The plugin deliberately imports only Node builtins: a profile-installed
 * workspace bundle resolves no Harness peer dependency at runtime.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Services the bridge needs before it can activate. */
export const inject = ['sessionController', 'sessionQuery', 'workingDirectory']

const VERSION = '1.0.0'
const MAX_MESSAGE_CHARS = 3500
const LOG_LIMIT_BYTES = 1_000_000
const TYPING_INTERVAL_MS = 4500
const REQUEST_PREFIX = 'tg:'

const BOT_COMMANDS = [
  { command: 'chats', description: 'Список чатов DSH' },
  { command: 'new', description: 'Создать новый чат' },
  { command: 'status', description: 'Статус моста' },
  { command: 'stop', description: 'Остановить текущий ход' },
  { command: 'title', description: 'Переименовать чат' },
  { command: 'mirror', description: 'Режим зеркала: all или active' },
  { command: 'id', description: 'Идентификаторы чата' },
  { command: 'help', description: 'Справка' },
]

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Await a delay, resolving early when the signal aborts. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

/** Escape text for Telegram's HTML parse mode. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Remove HTML tags for the plain-text fallback. */
function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '')
}

/** Truncate by code points. */
function truncate(value, max) {
  const text = String(value ?? '')
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max - 1)).join('') + '…'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** Short, human-recognizable session suffix. */
function shortSessionId(sessionId) {
  const text = String(sessionId ?? '')
  return text.length <= 8 ? text : text.slice(0, 8)
}

/** Extract the visible text of a durable message's content blocks. */
function extractText(message) {
  if (!message || !Array.isArray(message.content)) return ''
  const parts = []
  for (const block of message.content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n\n').trim()
}

/** Human-readable error text for logs. */
function describeError(error) {
  if (!error) return 'unknown error'
  if (error.network) return `network: ${error.message}`
  if (error.httpStatus) return `${error.message}`
  return error.message || String(error)
}

/** Human-readable error text for a Telegram reply. */
function humanError(error) {
  const code = error?.code
  if (code === 'session/not-found') return 'Чат не найден — возможно, он удалён.'
  if (code === 'session/agent-busy') return 'Чат занят другим процессом.'
  if (code === 'session/writer-held') return 'Чат заблокирован другим процессом.'
  if (error?.network) return 'Нет связи с Telegram API.'
  if (error?.httpStatus === 401) return 'Неверный токен бота.'
  return truncate(error?.message || String(error), 300)
}

/** Convert a Markdown chunk into the subset of Telegram HTML we support. */
function renderMarkdown(markdown) {
  const source = String(markdown ?? '')
  const parts = []
  const fence = /```([^\n`]*)\n?([\s\S]*?)```/g
  let last = 0
  let match
  while ((match = fence.exec(source)) !== null) {
    if (match.index > last) parts.push({ code: false, text: source.slice(last, match.index) })
    parts.push({ code: true, lang: (match[1] || '').trim(), text: match[2] })
    last = match.index + match[0].length
  }
  if (last < source.length) parts.push({ code: false, text: source.slice(last) })
  return parts
    .map((part) => {
      if (part.code) {
        const lang = part.lang.replace(/[^A-Za-z0-9_+-]/g, '')
        const open = lang ? `<pre><code class="language-${lang}">` : '<pre><code>'
        return `${open}${escapeHtml(part.text)}</code></pre>`
      }
      return renderInline(part.text)
    })
    .join('')
}

/** Inline Markdown subset for Telegram HTML. */
function renderInline(text) {
  let out = escapeHtml(text)
  out = out.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
  return out
}

/** Split a Markdown document into chunks that fit one Telegram message. */
function splitMarkdown(markdown, maxChars) {
  const text = String(markdown ?? '')
  if (text.length <= maxChars) return [text]
  const chunks = []
  let current = ''
  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 <= maxChars) {
      current += (current ? '\n' : '') + line
      continue
    }
    if (current) chunks.push(current)
    current = ''
    let rest = line
    while (rest.length > maxChars) {
      chunks.push(rest.slice(0, maxChars))
      rest = rest.slice(maxChars)
    }
    current = rest
  }
  if (current) chunks.push(current)
  return chunks.length ? chunks : ['']
}

/** Fresh persisted bridge state. */
function createState() {
  return { version: 2, offset: 0, primaryChatId: null, boundUserIds: [], chats: {} }
}

/** Validate and normalize persisted state. */
function normalizeState(raw) {
  const state = createState()
  if (!raw || typeof raw !== 'object') return state
  state.offset = Number.isInteger(raw.offset) && raw.offset >= 0 ? raw.offset : 0
  state.primaryChatId = raw.primaryChatId != null ? String(raw.primaryChatId) : null
  state.boundUserIds = Array.isArray(raw.boundUserIds) ? raw.boundUserIds.map(String) : []
  if (raw.chats && typeof raw.chats === 'object') {
    for (const [chatId, chat] of Object.entries(raw.chats)) {
      if (!chat || typeof chat !== 'object') continue
      const entry = {
        type: typeof chat.type === 'string' ? chat.type : 'private',
        isForum: chat.isForum === true,
        activeSessionId: chat.activeSessionId ? String(chat.activeSessionId) : null,
        mirrorMode: chat.mirrorMode === 'active' ? 'active' : 'all',
        topicDisabled: chat.topicDisabled === true,
        sessions: {},
      }
      if (chat.sessions && typeof chat.sessions === 'object') {
        for (const [sessionId, map] of Object.entries(chat.sessions)) {
          if (!map || typeof map !== 'object') continue
          entry.sessions[sessionId] = {
            threadId: Number.isInteger(map.threadId) ? map.threadId : null,
            lastSeq: Number.isInteger(map.lastSeq) && map.lastSeq > 0 ? map.lastSeq : 0,
            title: typeof map.title === 'string' ? map.title : null,
            topicTitle: typeof map.topicTitle === 'string' ? map.topicTitle : null,
          }
        }
      }
      state.chats[String(chatId)] = entry
    }
  }
  return state
}

/** Resolve the runtime configuration (patch `config` object). */
function resolveConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const home = homedir()
  const dir = typeof source.stateDir === 'string' && source.stateDir ? source.stateDir : join(home, '.dsh', 'telegram-bridge')
  return {
    dir,
    tokenFile:
      typeof source.tokenFile === 'string' && source.tokenFile ? source.tokenFile : join(dir, 'token.txt'),
    stateFile:
      typeof source.stateFile === 'string' && source.stateFile ? source.stateFile : join(dir, 'state.json'),
    logFile: typeof source.logFile === 'string' && source.logFile ? source.logFile : join(dir, 'bridge.log'),
    pairingCode: typeof source.pairingCode === 'string' ? source.pairingCode.trim() : '',
    mirrorMode: source.mirrorMode === 'active' ? 'active' : 'all',
    autoLink: source.autoLink !== false,
    mirrorUserMessages: source.mirrorUserMessages !== false,
    defaultCwd: typeof source.defaultCwd === 'string' && source.defaultCwd ? source.defaultCwd : null,
    token: typeof source.token === 'string' && source.token.trim() ? source.token.trim() : null,
    apiBase:
      typeof source.apiBase === 'string' && source.apiBase
        ? source.apiBase.replace(/\/+$/, '')
        : 'https://api.telegram.org',
    pollTimeout: Number.isInteger(source.pollTimeout) ? clamp(source.pollTimeout, 1, 60) : 30,
    debug: source.debug === true,
  }
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

class Bridge {
  /** @param {object} ctx plugin context. @param {object} cfg resolved config. */
  constructor(ctx, cfg) {
    this.ctx = ctx
    this.cfg = cfg
    this.abort = new AbortController()
    this.disposed = false
    this.state = createState()
    this.logSeq = 0
    this.polling = false
    this.lastToken = null
    this.botUsername = null
    this.typing = new Map()
    this.queues = new Map()
    this.linkInflight = new Map()
    this.titleCache = new Map()
    this.ownRequestIds = new Set()
    this.saveTimer = null
    this.loggedMissingToken = false
    this.topicFailures = new Set()
  }

  get signal() {
    return this.abort.signal
  }

  // -- lifecycle ------------------------------------------------------------

  async start() {
    this.ensureDirs()
    this.state = normalizeState(this.readJson(this.cfg.stateFile))
    this.log(
      `start v${VERSION}; tokenFile=${this.cfg.tokenFile}; stateFile=${this.cfg.stateFile}; ` +
        `primaryChat=${this.state.primaryChatId}; boundUsers=${this.state.boundUserIds.length}`,
    )
    await this.pollLoop()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.abort.abort(new Error('telegram bridge disposed'))
    for (const timer of this.typing.values()) clearInterval(timer)
    this.typing.clear()
    this.saveStateNow()
    this.log('disposed')
  }

  ensureDirs() {
    try {
      mkdirSync(this.cfg.dir, { recursive: true })
    } catch (error) {
      console.error(`[telegram-bridge] cannot create state dir ${this.cfg.dir}: ${describeError(error)}`)
    }
  }

  // -- logging --------------------------------------------------------------

  log(line) {
    try {
      const payload = `[${new Date().toISOString()}] ${line}\n`
      appendFileSync(this.cfg.logFile, payload)
      this.rotateLog()
    } catch {
      /* logging must never break the bridge */
    }
    if (this.cfg.debug) console.log(`[telegram-bridge] ${line}`)
  }

  rotateLog() {
    try {
      if (statSync(this.cfg.logFile).size > LOG_LIMIT_BYTES) {
        const raw = readFileSync(this.cfg.logFile, 'utf8')
        writeFileSync(this.cfg.logFile, raw.slice(-Math.floor(LOG_LIMIT_BYTES / 2)))
      }
    } catch {
      /* best effort */
    }
  }

  // -- persistence ----------------------------------------------------------

  readJson(path) {
    try {
      if (!existsSync(path)) return null
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      this.log(`cannot read ${path}: ${describeError(error)}`)
      return null
    }
  }

  writeJsonAtomic(path, value) {
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2))
    renameSync(tmp, path)
  }

  saveStateSoon() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveStateNow()
    }, 400)
    if (typeof this.saveTimer.unref === 'function') this.saveTimer.unref()
  }

  saveStateNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      this.ensureDirs()
      this.writeJsonAtomic(this.cfg.stateFile, this.state)
    } catch (error) {
      this.log(`cannot save state: ${describeError(error)}`)
    }
  }

  // -- HTTP ----------------------------------------------------------------

  readToken() {
    try {
      if (existsSync(this.cfg.tokenFile)) {
        for (const line of readFileSync(this.cfg.tokenFile, 'utf8').split(/\r?\n/)) {
          const value = line.trim()
          if (!value || value.startsWith('#')) continue
          return value
        }
      }
    } catch (error) {
      this.log(`cannot read token file: ${describeError(error)}`)
    }
    if (this.cfg.token) return this.cfg.token
    const fromEnv = process.env.DSH_TELEGRAM_BOT_TOKEN
    return fromEnv && fromEnv.trim() ? fromEnv.trim() : null
  }

  async fetchJson(url, options, timeoutMs) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
    const onAbort = () => controller.abort(new Error('disposed'))
    this.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      const text = await response.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        /* keep null */
      }
      return { response, json, text }
    } finally {
      clearTimeout(timer)
      this.signal.removeEventListener('abort', onAbort)
    }
  }

  async apiOnce(method, payload, timeoutMs) {
    const token = this.readToken()
    if (!token) {
      const error = new Error(`токен бота не найден: создай файл ${this.cfg.tokenFile}`)
      error.noToken = true
      throw error
    }
    let result
    try {
      result = await this.fetchJson(
        `${this.cfg.apiBase}/bot${token}/${method}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
        },
        timeoutMs,
      )
    } catch (cause) {
      const error = new Error(`${method}: ${cause?.message || cause}`)
      error.network = true
      throw error
    }
    const { response, json } = result
    if (!json || json.ok !== true) {
      const error = new Error(`${method}: ${json?.description || `HTTP ${response.status}`}`)
      error.httpStatus = response.status
      error.description = json?.description
      error.retryAfter = json?.parameters?.retry_after
      throw error
    }
    return json.result
  }

  async api(method, payload, timeoutMs = 20000) {
    try {
      return await this.apiOnce(method, payload, timeoutMs)
    } catch (error) {
      if (error.retryAfter) {
        await sleep(Math.min(error.retryAfter * 1000, 15000), this.signal)
        if (!this.signal.aborted) return this.apiOnce(method, payload, timeoutMs)
      }
      throw error
    }
  }

  // -- polling --------------------------------------------------------------

  async pollLoop() {
    this.polling = true
    let backoff = 3000
    while (!this.signal.aborted) {
      const token = this.readToken()
      if (!token) {
        if (!this.loggedMissingToken) {
          this.loggedMissingToken = true
          this.log(`waiting for bot token in ${this.cfg.tokenFile}`)
        }
        await sleep(3000, this.signal)
        continue
      }
      this.loggedMissingToken = false
      if (token !== this.lastToken) {
        this.lastToken = token
        await this.probe(token)
      }
      try {
        const updates = await this.api(
          'getUpdates',
          {
            offset: this.state.offset || 0,
            timeout: this.cfg.pollTimeout,
            allowed_updates: ['message', 'callback_query'],
          },
          (this.cfg.pollTimeout + 20) * 1000,
        )
        backoff = 3000
        for (const update of Array.isArray(updates) ? updates : []) {
          this.state.offset = update.update_id + 1
          try {
            await this.handleUpdate(update)
          } catch (error) {
            this.log(`update ${update.update_id} failed: ${describeError(error)}`)
          }
        }
        this.saveStateSoon()
      } catch (error) {
        if (this.signal.aborted) return
        this.log(`poll failed: ${describeError(error)}`)
        if (error.noToken) {
          this.lastToken = null
          await sleep(3000, this.signal)
          continue
        }
        if (error.httpStatus === 401 || error.httpStatus === 404) {
          this.lastToken = null
          await sleep(20000, this.signal)
          continue
        }
        if (error.httpStatus === 409) {
          // A webhook is installed for this bot; drop it and retry at once.
          try {
            await this.api('deleteWebhook', { drop_pending_updates: false }, 10000)
          } catch (inner) {
            this.log(`deleteWebhook failed: ${describeError(inner)}`)
          }
          await sleep(2000, this.signal)
          continue
        }
        await sleep(backoff, this.signal)
        backoff = Math.min(backoff * 2, 60000)
      }
    }
  }

  async probe(token) {
    try {
      const me = await this.apiOnce('getMe', {}, 15000)
      this.botUsername = me?.username || null
      this.log(`getMe ok: @${this.botUsername || 'unknown'}`)
      try {
        await this.apiOnce('deleteWebhook', { drop_pending_updates: false }, 10000)
      } catch (error) {
        this.log(`deleteWebhook failed: ${describeError(error)}`)
      }
      try {
        await this.apiOnce('setMyCommands', { commands: BOT_COMMANDS }, 10000)
        this.log('setMyCommands ok')
      } catch (error) {
        this.log(`setMyCommands failed: ${describeError(error)}`)
      }
      if (!this.state.primaryChatId && this.state.boundUserIds.length === 0) {
        this.log('no paired chat yet: waiting for /start <pairing code>')
      }
    } catch (error) {
      this.log(`probe failed: ${describeError(error)}`)
    }
  }

  // -- model-facing session APIs -------------------------------------------

  /** All visible ordinary Session rows, newest activity first, with titles. */
  async listSessions() {
    const result = await this.ctx.sessionController.list({}, this.signal)
    const items = Array.isArray(result?.items) ? result.items : []
    const ordinary = items
      .filter((item) => item && !item.parentSessionId && item.origin !== 'subagent')
      .filter((item) => item.blank !== true || item.running === true)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const titles = await Promise.all(ordinary.map((item) => this.titleFor(item.sessionId)))
    return ordinary.map((item, index) => ({
      sessionId: String(item.sessionId),
      title: titles[index] || null,
      running: item.running === true,
      updatedAt: item.updatedAt || 0,
    }))
  }

  /** Latest title of one session, with a small cache. */
  async titleFor(sessionId) {
    const cached = this.titleCache.get(sessionId)
    if (cached && Date.now() - cached.at < 60000) return cached.title
    let title = null
    try {
      const snapshot = await this.ctx.sessionQuery.readTitle(sessionId, this.signal)
      title = typeof snapshot?.title === 'string' && snapshot.title ? snapshot.title : null
    } catch (error) {
      this.log(`readTitle ${sessionId} failed: ${describeError(error)}`)
    }
    this.titleCache.set(sessionId, { title, at: Date.now() })
    return title
  }

  topicName(title, sessionId) {
    const base = title && title.trim() ? title.trim() : `Чат ${shortSessionId(sessionId)}`
    return truncate(base, 120)
  }

  defaultCwd() {
    try {
      const fromService = this.ctx.workingDirectory?.defaultDirectory
      if (typeof fromService === 'string' && fromService) return fromService
    } catch {
      /* ignore */
    }
    return process.cwd()
  }

  async promptSession(sessionId, text, chatId, messageId, threadId) {
    const requestId = `${REQUEST_PREFIX}${chatId}:${messageId ?? 0}:${Math.random().toString(36).slice(2, 8)}`
    this.ownRequestIds.add(requestId)
    if (this.ownRequestIds.size > 500) {
      const oldest = this.ownRequestIds.values().next().value
      this.ownRequestIds.delete(oldest)
    }
    await this.ctx.sessionController.prompt(
      {
        requestId,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
      },
      this.signal,
    )
    this.startTyping(chatId, threadId)
  }

  // -- chat bookkeeping -----------------------------------------------------

  ensureChat(chat) {
    const chatId = String(chat.id)
    let entry = this.state.chats[chatId]
    if (!entry) {
      entry = this.state.chats[chatId] = {
        type: chat.type,
        isForum: chat.type === 'supergroup' && chat.is_forum === true,
        activeSessionId: null,
        mirrorMode: this.cfg.mirrorMode,
        topicDisabled: false,
        sessions: {},
      }
    } else {
      entry.type = chat.type
      entry.isForum = chat.type === 'supergroup' && chat.is_forum === true
      if (!entry.sessions) entry.sessions = {}
    }
    return entry
  }

  isBound(userId) {
    return this.state.boundUserIds.includes(String(userId))
  }

  isTopics(chatEntry) {
    return chatEntry?.isForum === true
  }

  sessionByThread(chatEntry, threadId) {
    if (!chatEntry || threadId == null) return null
    for (const [sessionId, map] of Object.entries(chatEntry.sessions)) {
      if (map.threadId === threadId) return sessionId
    }
    return null
  }

  sessionForMessage(chatEntry, message) {
    if (!chatEntry) return null
    if (message.message_thread_id != null) {
      const byThread = this.sessionByThread(chatEntry, message.message_thread_id)
      if (byThread) return byThread
      // In a forum group a foreign topic must never fall back to the active chat.
      if (chatEntry.isForum) return null
    }
    return chatEntry.activeSessionId || null
  }

  /** Link a session to a chat, creating a forum topic when needed. */
  async ensureLink(chatId, chatEntry, sessionId) {
    const existing = chatEntry.sessions[sessionId]
    if (existing) return existing
    const key = `${chatId}:${sessionId}`
    const inflight = this.linkInflight.get(key)
    if (inflight) return inflight
    const task = (async () => {
      const title = await this.titleFor(sessionId)
      let threadId = null
      if (this.isTopics(chatEntry) && !chatEntry.topicDisabled) {
        try {
          const created = await this.api('createForumTopic', {
            chat_id: chatId,
            name: this.topicName(title, sessionId),
          })
          threadId = created?.message_thread_id ?? null
        } catch (error) {
          this.log(`createForumTopic failed for chat ${chatId}: ${describeError(error)}`)
          if (error.httpStatus === 400 || error.httpStatus === 403) {
            chatEntry.topicDisabled = true
            this.log(`topics disabled for chat ${chatId}; falling back to the general chat`)
          }
        }
      }
      const map = { threadId, lastSeq: 0, title: title || null, topicTitle: title || null }
      chatEntry.sessions[sessionId] = map
      if (chatEntry.activeSessionId == null) chatEntry.activeSessionId = sessionId
      this.saveStateSoon()
      this.log(`linked session ${sessionId} -> chat ${chatId} thread ${threadId}`)
      return map
    })()
    this.linkInflight.set(key, task)
    try {
      return await task
    } finally {
      this.linkInflight.delete(key)
    }
  }

  /** Every Telegram target that should receive events of one session. */
  async targetsForSession(sessionId) {
    const targets = []
    for (const [chatId, chatEntry] of Object.entries(this.state.chats)) {
      const map = chatEntry.sessions[sessionId]
      if (map) {
        targets.push({ chatId, chatEntry, map })
        continue
      }
      if (!this.cfg.autoLink) continue
      if (String(this.state.primaryChatId) !== chatId) continue
      const created = await this.ensureLink(chatId, chatEntry, sessionId)
      if (created) targets.push({ chatId, chatEntry, map: created })
    }
    return targets
  }

  // -- Telegram sending -----------------------------------------------------

  async sendMessage(chatId, threadId, htmlText, extra = {}) {
    const payload = {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...extra,
    }
    if (threadId != null) payload.message_thread_id = threadId
    try {
      return await this.api('sendMessage', payload)
    } catch (error) {
      const description = String(error.description || '')
      if (error.httpStatus === 400 && /entit|parse/i.test(description)) {
        const fallback = { ...payload, text: stripHtml(htmlText) }
        delete fallback.parse_mode
        return this.api('sendMessage', fallback)
      }
      throw error
    }
  }

  async reply(msg, htmlText, extra = {}) {
    return this.sendMessage(
      String(msg.chat.id),
      msg.message_thread_id ?? null,
      htmlText,
      extra,
    )
  }

  /** Send Markdown content split into Telegram-sized chunks. */
  async sendMarkdown(chatId, threadId, markdown, headerHtml = '') {
    const chunks = splitMarkdown(markdown, MAX_MESSAGE_CHARS)
    for (let index = 0; index < chunks.length; index += 1) {
      const prefix = index === 0 ? headerHtml : ''
      const html = `${prefix}${renderMarkdown(chunks[index])}`
      try {
        await this.sendMessage(chatId, threadId, html)
      } catch (error) {
        if (error.httpStatus === 400) {
          await this.sendMessage(chatId, threadId, `${prefix}${chunks[index]}`, {
            parse_mode: undefined,
          })
        } else {
          throw error
        }
      }
      if (index < chunks.length - 1) await sleep(300, this.signal)
    }
  }

  async sendNotice(chatId, threadId, htmlText, extra = {}) {
    try {
      await this.sendMessage(chatId, threadId, htmlText, extra)
    } catch (error) {
      this.log(`notice failed: ${describeError(error)}`)
    }
  }

  // -- typing indicator -----------------------------------------------------

  startTyping(chatId, threadId) {
    const key = `${chatId}:${threadId ?? ''}`
    if (this.typing.has(key)) return
    const tick = () => {
      this.api(
        'sendChatAction',
        {
          chat_id: chatId,
          action: 'typing',
          ...(threadId != null ? { message_thread_id: threadId } : {}),
        },
        10000,
      ).catch(() => {})
    }
    tick()
    const timer = setInterval(tick, TYPING_INTERVAL_MS)
    if (typeof timer.unref === 'function') timer.unref()
    this.typing.set(key, timer)
  }

  stopTyping(chatId, threadId) {
    const key = `${chatId}:${threadId ?? ''}`
    const timer = this.typing.get(key)
    if (timer) {
      clearInterval(timer)
      this.typing.delete(key)
    }
  }

  stopAllTyping() {
    for (const timer of this.typing.values()) clearInterval(timer)
    this.typing.clear()
  }

  // -- updates --------------------------------------------------------------

  async handleUpdate(update) {
    if (update.message) await this.onMessage(update.message)
    else if (update.callback_query) await this.onCallback(update.callback_query)
  }

  async onMessage(msg) {
    const user = msg.from
    const chat = msg.chat
    if (!user || user.is_bot || !chat) return
    if (chat.type === 'channel') return
    const chatEntry = this.ensureChat(chat)
    const raw = (msg.text || msg.caption || '').trim()
    if (raw.startsWith('/')) {
      await this.onCommand(msg, chatEntry, raw)
      return
    }
    if (!this.isBound(user.id)) {
      await this.reply(msg, '🔒 Бот не привязан. Отправь <code>/start КОД</code> с кодом привязки из настроек DeepSeek Harness.')
      return
    }
    if (msg.photo || msg.document || msg.voice || msg.audio || msg.video || msg.video_note || msg.sticker) {
      await this.reply(msg, '📎 Пока принимаю только текст — вложения из Telegram ещё не поддержаны.')
      return
    }
    if (!raw) {
      await this.reply(msg, 'Пустое сообщение. Напиши текст или используй /chats.')
      return
    }
    const sessionId = this.sessionForMessage(chatEntry, msg)
    if (!sessionId) {
      await this.reply(
        msg,
        'Сначала выбери чат: <code>/chats</code> — список чатов, <code>/new</code> — новый чат.',
      )
      return
    }
    try {
      await this.promptSession(sessionId, raw, String(chat.id), msg.message_id, msg.message_thread_id ?? null)
      if (msg.message_thread_id == null) {
        chatEntry.activeSessionId = sessionId
        this.saveStateSoon()
      }
    } catch (error) {
      this.log(`prompt to ${sessionId} failed: ${describeError(error)}`)
      await this.reply(msg, `❌ ${escapeHtml(humanError(error))}`)
    }
  }

  async onCommand(msg, chatEntry, raw) {
    const match = raw.match(/^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/)
    if (!match) return
    const command = match[1].toLowerCase()
    const args = (match[2] || '').trim()
    const user = msg.from

    if (command === 'start' || command === 'pair') {
      await this.cmdStart(msg, chatEntry, args)
      return
    }
    if (command === 'help') {
      await this.cmdHelp(msg)
      return
    }
    if (command === 'id') {
      await this.cmdId(msg, chatEntry)
      return
    }
    if (!this.isBound(user.id)) {
      await this.reply(msg, '🔒 Бот не привязан к твоему аккаунту. Отправь <code>/start КОД</code>.')
      return
    }
    switch (command) {
      case 'chats':
        await this.cmdChats(msg, chatEntry, args)
        break
      case 'new':
        await this.cmdNew(msg, chatEntry, args)
        break
      case 'status':
        await this.cmdStatus(msg, chatEntry)
        break
      case 'stop':
        await this.cmdStop(msg, chatEntry)
        break
      case 'title':
      case 'rename':
        await this.cmdTitle(msg, chatEntry, args)
        break
      case 'mirror':
        await this.cmdMirror(msg, chatEntry, args)
        break
      default:
        await this.reply(msg, `Неизвестная команда <code>/${escapeHtml(command)}</code>. Смотри /help.`)
    }
  }

  // -- commands -------------------------------------------------------------

  async cmdStart(msg, chatEntry, args) {
    const user = msg.from
    if (this.isBound(user.id)) {
      this.state.primaryChatId = String(msg.chat.id)
      this.saveStateSoon()
      const where = this.isTopics(chatEntry)
        ? 'это форум-группа: каждый чат DSH будет открываться отдельным топиком'
        : 'каждый чат DSH будет появляться здесь с заголовком'
      await this.reply(
        msg,
        `✅ Готово, привязка активна.\n\n` +
          `Этот чат — основной для моста; ${where}.\n\n` +
          `<b>Команды</b>\n` +
          `/chats — список чатов DSH\n` +
          `/new — новый чат\n` +
          `/status — состояние моста\n` +
          `/stop — остановить текущий ход\n` +
          `/title &lt;текст&gt; — переименовать активный чат\n` +
          `/mirror all|active — что зеркалить\n` +
          `/help — справка`,
      )
      return
    }
    if (!this.cfg.pairingCode) {
      await this.reply(
        msg,
        '🔒 Привязка не настроена: в конфигурации плагина нет <code>pairingCode</code>. ' +
          'Задай код и перезапусти плагин.',
      )
      return
    }
    const code = args.trim()
    if (!code) {
      await this.reply(
        msg,
        '🔒 Этот бот ещё не привязан к аккаунту.\n\n' +
          `Отправь <code>/start КОД</code>, где КОД — код привязки из настроек DeepSeek Harness.`,
      )
      return
    }
    if (code !== this.cfg.pairingCode) {
      this.log(`pairing rejected for user ${user.id} (@${user.username || 'no-username'}): wrong code`)
      await this.reply(msg, '❌ Неверный код привязки.')
      return
    }
    this.state.boundUserIds.push(String(user.id))
    this.state.primaryChatId = String(msg.chat.id)
    this.saveStateNow()
    this.log(`paired user ${user.id} (@${user.username || 'no-username'}) in chat ${msg.chat.id}`)
    await this.reply(
      msg,
      '✅ Привязано! Теперь мы на связи.\n\n' +
        'Напиши сообщение — оно уйдёт в активный чат DSH, а ответ появится здесь.\n' +
        'Список чатов: /chats, новый чат: /new, справка: /help.',
    )
  }

  async cmdHelp(msg) {
    await this.reply(
      msg,
      `<b>Telegram-мост DeepSeek Harness</b> v${VERSION}\n\n` +
        'Сообщение без команды уходит в выбранный чат DSH, ответ агента приходит сюда.\n\n' +
        '<b>Команды</b>\n' +
        '/chats — чаты DSH (нажми, чтобы выбрать или открыть топик)\n' +
        '/new [название] — новый чат DSH\n' +
        '/status — состояние моста\n' +
        '/stop — остановить текущий ход\n' +
        '/title &lt;текст&gt; — переименовать активный чат\n' +
        '/mirror all|active — зеркалить все чаты или только активный\n' +
        '/id — id чата и пользователя\n' +
        '/help — эта справка\n\n' +
        'Совет: в форум-группе каждый чат DSH получает отдельный топик — так список чатов виден прямо в Telegram.',
    )
  }

  async cmdId(msg, chatEntry) {
    const sessionId = this.sessionForMessage(chatEntry, msg)
    await this.reply(
      msg,
      `<b>Идентификаторы</b>\n` +
        `chat_id: <code>${escapeHtml(msg.chat.id)}</code>\n` +
        `user_id: <code>${escapeHtml(msg.from.id)}</code>\n` +
        `thread_id: <code>${escapeHtml(msg.message_thread_id ?? '—')}</code>\n` +
        `session: <code>${escapeHtml(sessionId || '—')}</code>\n` +
        `forum: ${chatEntry.isForum ? 'да' : 'нет'}`,
    )
  }

  async cmdChats(msg, chatEntry, args) {
    let sessions
    try {
      sessions = await this.listSessions()
    } catch (error) {
      this.log(`listSessions failed: ${describeError(error)}`)
      await this.reply(msg, `❌ Не удалось прочитать список чатов: ${escapeHtml(humanError(error))}`)
      return
    }
    if (!sessions.length) {
      await this.reply(msg, 'Чатов DSH пока нет. Создай первый: <code>/new</code>.')
      return
    }
    const perPage = 8
    const pages = Math.max(1, Math.ceil(sessions.length / perPage))
    const requested = Number.parseInt(args, 10)
    const page = clamp(Number.isFinite(requested) ? requested - 1 : 0, 0, pages - 1)
    const slice = sessions.slice(page * perPage, page * perPage + perPage)
    const rows = slice.map((session) => {
      const marks = []
      marks.push(session.running ? '⚡' : '💬')
      if (chatEntry.activeSessionId === session.sessionId) marks.push('▶')
      const label = `${marks.join('')} ${session.title || 'Новый чат'} · ${shortSessionId(session.sessionId)}`
      return [{ text: truncate(label, 60), callback_data: `u:${session.sessionId}` }]
    })
    if (pages > 1) {
      rows.push([
        { text: '‹', callback_data: `l:${Math.max(0, page - 1)}` },
        { text: `${page + 1}/${pages}`, callback_data: 'noop' },
        { text: '›', callback_data: `l:${Math.min(pages - 1, page + 1)}` },
      ])
    }
    const text = this.isTopics(chatEntry)
      ? '💬 <b>Чаты DSH</b>\nНажми чат — открою для него отдельный топик.'
      : '💬 <b>Чаты DSH</b>\nНажми чат, чтобы сделать его активным.'
    await this.reply(msg, text, { reply_markup: { inline_keyboard: rows } })
  }

  async cmdNew(msg, chatEntry, args) {
    const request = {}
    const cwd = this.cfg.defaultCwd || this.defaultCwd()
    if (cwd) request.cwd = cwd
    let created
    try {
      created = await this.ctx.sessionController.create(request)
    } catch (error) {
      this.log(`create session failed: ${describeError(error)}`)
      await this.reply(msg, `❌ Не удалось создать чат: ${escapeHtml(humanError(error))}`)
      return
    }
    const sessionId = String(created.sessionId)
    if (args) {
      try {
        await this.ctx.sessionController.rename({ sessionId, title: args })
      } catch (error) {
        this.log(`rename after create failed: ${describeError(error)}`)
      }
    }
    const map = await this.ensureLink(String(msg.chat.id), chatEntry, sessionId)
    chatEntry.activeSessionId = sessionId
    this.saveStateSoon()
    const title = args || 'Новый чат'
    if (this.isTopics(chatEntry) && map?.threadId != null) {
      await this.sendNotice(
        String(msg.chat.id),
        map.threadId,
        `✅ Создан новый чат DSH: <b>${escapeHtml(title)}</b>\nНапиши сюда сообщение — начнём.`,
      )
      await this.reply(msg, `✅ Создан новый чат: <b>${escapeHtml(title)}</b> — он открыт отдельным топиком выше.`)
    } else {
      await this.reply(
        msg,
        `✅ Создан новый чат: <b>${escapeHtml(title)}</b>\nТеперь пиши сюда — сообщения уйдут в него.`,
      )
    }
  }

  async cmdStatus(msg, chatEntry) {
    const token = this.readToken()
    const sessionId = this.sessionForMessage(chatEntry, msg)
    let title = null
    if (sessionId) title = await this.titleFor(sessionId)
    const linked = Object.values(this.state.chats).reduce(
      (sum, chat) => sum + Object.keys(chat.sessions || {}).length,
      0,
    )
    await this.reply(
      msg,
      `<b>🛰 Telegram Bridge</b> v${VERSION}\n` +
        `бот: ${this.botUsername ? '@' + escapeHtml(this.botUsername) : '—'}\n` +
        `токен: ${token ? 'найден' : 'НЕТ (создай ' + escapeHtml(this.cfg.tokenFile) + ')'}\n` +
        `опрос: ${this.polling ? 'запущен' : 'остановлен'}\n` +
        `привязка: ${this.state.boundUserIds.length} польз.\n` +
        `основной чат: <code>${escapeHtml(this.state.primaryChatId ?? '—')}</code>\n` +
        `автозеркало: ${this.cfg.autoLink ? 'вкл' : 'выкл'} · режим: ${chatEntry.mirrorMode}\n` +
        `активный чат: ${sessionId ? `<b>${escapeHtml(title || 'Новый чат')}</b> · <code>${escapeHtml(shortSessionId(sessionId))}</code>` : '—'}\n` +
        `связок чат↔сессия: ${linked}`,
    )
  }

  async cmdStop(msg, chatEntry) {
    const sessionId = this.sessionForMessage(chatEntry, msg)
    if (!sessionId) {
      await this.reply(msg, 'Не выбран чат. /chats — выбрать.')
      return
    }
    try {
      this.ctx.sessionController.cancel({ sessionId })
      await this.reply(msg, '⏹ Остановка текущего хода запрошена.')
    } catch (error) {
      this.log(`cancel failed: ${describeError(error)}`)
      await this.reply(msg, `❌ ${escapeHtml(humanError(error))}`)
    }
  }

  async cmdTitle(msg, chatEntry, args) {
    const sessionId = this.sessionForMessage(chatEntry, msg)
    if (!sessionId) {
      await this.reply(msg, 'Не выбран чат. /chats — выбрать.')
      return
    }
    if (!args) {
      const current = await this.titleFor(sessionId)
      await this.reply(msg, `Текущее название: <b>${escapeHtml(current || 'Новый чат')}</b>\nИспользование: <code>/title Новое название</code>`)
      return
    }
    try {
      const result = await this.ctx.sessionController.rename({ sessionId, title: args })
      this.titleCache.set(sessionId, { title: result?.title || args, at: Date.now() })
      await this.reply(msg, `✏️ Переименовано: <b>${escapeHtml(result?.title || args)}</b>`)
    } catch (error) {
      this.log(`rename failed: ${describeError(error)}`)
      await this.reply(msg, `❌ Не удалось переименовать: ${escapeHtml(humanError(error))}`)
    }
  }

  async cmdMirror(msg, chatEntry, args) {
    const value = args.trim().toLowerCase()
    if (value !== 'all' && value !== 'active') {
      await this.reply(
        msg,
        `Режим зеркала: <b>${chatEntry.mirrorMode}</b>\n<code>/mirror all</code> — все чаты (с заголовком), <code>/mirror active</code> — только активный.`,
      )
      return
    }
    chatEntry.mirrorMode = value
    this.saveStateSoon()
    await this.reply(
      msg,
      value === 'all'
        ? '🌐 Зеркалю все чаты DSH: у каждого сообщения будет заголовок чата.'
        : '🎯 Зеркалю только активный чат.',
    )
  }

  // -- callback queries -----------------------------------------------------

  async onCallback(query) {
    const user = query.from
    const message = query.message
    try {
      await this.api('answerCallbackQuery', { callback_query_id: query.id }, 10000)
    } catch {
      /* the toast is optional */
    }
    if (!user || !message || !message.chat) return
    if (!this.isBound(user.id)) return
    const chatEntry = this.ensureChat(message.chat)
    const chatId = String(message.chat.id)
    const data = String(query.data || '')
    if (data === 'noop') return
    if (data.startsWith('u:')) {
      const sessionId = data.slice(2)
      const map = await this.ensureLink(chatId, chatEntry, sessionId)
      chatEntry.activeSessionId = sessionId
      this.saveStateSoon()
      const title = await this.titleFor(sessionId)
      if (this.isTopics(chatEntry) && map?.threadId != null) {
        await this.sendNotice(
          chatId,
          map.threadId,
          `▶ <b>${escapeHtml(title || 'Новый чат')}</b>\nПиши сюда — сообщения идут в этот чат DSH.`,
        )
      } else {
        await this.sendNotice(chatId, null, `▶ Активный чат: <b>${escapeHtml(title || 'Новый чат')}</b>`)
      }
      return
    }
    if (data.startsWith('l:')) {
      const page = Number.parseInt(data.slice(2), 10)
      if (!Number.isFinite(page)) return
      const sessions = await this.listSessions().catch(() => [])
      if (!sessions.length) return
      const perPage = 8
      const pages = Math.max(1, Math.ceil(sessions.length / perPage))
      const clamped = clamp(page, 0, pages - 1)
      const slice = sessions.slice(clamped * perPage, clamped * perPage + perPage)
      const rows = slice.map((session) => {
        const marks = [session.running ? '⚡' : '💬']
        if (chatEntry.activeSessionId === session.sessionId) marks.push('▶')
        return [
          {
            text: truncate(
              `${marks.join('')} ${session.title || 'Новый чат'} · ${shortSessionId(session.sessionId)}`,
              60,
            ),
            callback_data: `u:${session.sessionId}`,
          },
        ]
      })
      if (pages > 1) {
        rows.push([
          { text: '‹', callback_data: `l:${Math.max(0, clamped - 1)}` },
          { text: `${clamped + 1}/${pages}`, callback_data: 'noop' },
          { text: '›', callback_data: `l:${Math.min(pages - 1, clamped + 1)}` },
        ])
      }
      try {
        await this.api('editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: message.message_id,
          reply_markup: { inline_keyboard: rows },
        })
      } catch (error) {
        this.log(`pagination edit failed: ${describeError(error)}`)
      }
    }
  }

  // -- session event forwarding --------------------------------------------

  onSessionEvent(session, event) {
    try {
      if (this.disposed) return
      const header = session?.header
      if (!header) return
      if (header.parentSession || header.origin === 'subagent') return
      const sessionId = String(session.id)
      switch (event?.type) {
        case 'user/message':
          this.enqueue(sessionId, () => this.handleUserMessage(sessionId, event))
          break
        case 'assistant/message':
          this.enqueue(sessionId, () => this.handleAssistantMessage(sessionId, event))
          break
        case 'turn/start':
          this.enqueue(sessionId, () => this.handleTurnStart(sessionId))
          break
        case 'turn/end':
          this.enqueue(sessionId, () => this.handleTurnEnd(sessionId, event))
          break
        case 'session/title':
          this.enqueue(sessionId, () => this.handleTitle(sessionId, event))
          break
        default:
          break
      }
    } catch (error) {
      this.log(`session event handler failed: ${describeError(error)}`)
    }
  }

  enqueue(sessionId, task) {
    const previous = this.queues.get(sessionId) || Promise.resolve()
    const next = previous
      .then(task)
      .catch((error) => this.log(`session task for ${sessionId} failed: ${describeError(error)}`))
    this.queues.set(sessionId, next)
    next.then(() => {
      if (this.queues.get(sessionId) === next) this.queues.delete(sessionId)
    })
  }

  headerFor(chatEntry, target, icon, title) {
    if (this.isTopics(chatEntry) && target.map?.threadId != null) return ''
    const label = title || '---'
    return `<i>${icon} ${escapeHtml(label)}</i>\n\n`
  }

  async handleUserMessage(sessionId, event) {
    const data = event.data || {}
    const source = data.source || {}
    const rpcId = source.rpcId ?? data.rpcId ?? null
    if (typeof rpcId === 'string' && (rpcId.startsWith(REQUEST_PREFIX) || this.ownRequestIds.has(rpcId))) return
    if (!this.cfg.mirrorUserMessages) return
    const text = extractText(data)
    if (!text) return
    const targets = await this.targetsForSession(sessionId)
    if (!targets.length) return
    const title = await this.titleFor(sessionId)
    for (const target of targets) {
      if (target.chatEntry.mirrorMode === 'active' && target.chatEntry.activeSessionId !== sessionId) continue
      const header = this.headerFor(target.chatEntry, target, '👤', title)
      try {
        await this.sendMarkdown(target.chatId, target.map.threadId, text, header)
      } catch (error) {
        this.log(`forward user message failed: ${describeError(error)}`)
      }
      target.map.lastSeq = Math.max(target.map.lastSeq || 0, event.seq || 0)
    }
    this.saveStateSoon()
  }

  async handleAssistantMessage(sessionId, event) {
    const data = event.data || {}
    const text = extractText(data)
    if (!text) return
    const targets = await this.targetsForSession(sessionId)
    if (!targets.length) return
    const title = await this.titleFor(sessionId)
    for (const target of targets) {
      if (target.chatEntry.mirrorMode === 'active' && target.chatEntry.activeSessionId !== sessionId) continue
      const header = this.headerFor(target.chatEntry, target, '🤖', title)
      const suffix = data.interrupted === true ? '\n\n<i>(прервано)</i>' : ''
      try {
        await this.sendMarkdown(target.chatId, target.map.threadId, text + suffix, header)
      } catch (error) {
        this.log(`forward assistant message failed: ${describeError(error)}`)
      }
      target.map.lastSeq = Math.max(target.map.lastSeq || 0, event.seq || 0)
      this.stopTyping(target.chatId, target.map.threadId ?? null)
    }
    this.saveStateSoon()
  }

  async handleTurnStart(sessionId) {
    const targets = await this.targetsForSession(sessionId)
    for (const target of targets) {
      if (target.chatEntry.mirrorMode === 'active' && target.chatEntry.activeSessionId !== sessionId) continue
      this.startTyping(target.chatId, target.map.threadId ?? null)
    }
  }

  async handleTurnEnd(sessionId, event) {
    const targets = await this.targetsForSession(sessionId)
    if (!targets.length) return
    const reason = event.data?.reason
    const kind = reason?.kind
    for (const target of targets) {
      this.stopTyping(target.chatId, target.map.threadId ?? null)
      if (kind === 'error') {
        const failure = reason?.error
        await this.sendNotice(
          target.chatId,
          target.map.threadId ?? null,
          `⚠️ Ошибка: ${escapeHtml(truncate(failure?.message || 'неизвестная ошибка', 500))}`,
        )
      } else if (kind === 'aborted' || kind === 'interrupted') {
        await this.sendNotice(target.chatId, target.map.threadId ?? null, '⏹ Ход остановлен.')
      }
    }
  }

  async handleTitle(sessionId, event) {
    const title = event.data?.title
    if (typeof title !== 'string' || !title) return
    this.titleCache.set(sessionId, { title, at: Date.now() })
    for (const [chatId, chatEntry] of Object.entries(this.state.chats)) {
      const map = chatEntry.sessions[sessionId]
      if (!map || map.threadId == null || !chatEntry.isForum) continue
      const name = this.topicName(title, sessionId)
      if (map.topicTitle === title) continue
      try {
        await this.api('editForumTopic', {
          chat_id: chatId,
          message_thread_id: map.threadId,
          name,
        })
        map.topicTitle = title
        this.saveStateSoon()
      } catch (error) {
        this.log(`editForumTopic failed for ${sessionId}: ${describeError(error)}`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

/**
 * Plugin entry point.
 * @param {object} ctx plugin context with Session services injected.
 * @param {object} [config] patch entry configuration.
 */
export function apply(ctx, config) {
  const bridge = new Bridge(ctx, resolveConfig(config))
  ctx.on('session/event', (session, event) => bridge.onSessionEvent(session, event))
  ctx.on('session/disposed', (session) => {
    const sessionId = String(session?.id ?? '')
    if (sessionId) bridge.queues.delete(sessionId)
  })
  ctx.effect(() => {
    bridge.start().catch((error) => bridge.log(`fatal poll loop error: ${describeError(error)}`))
    return () => bridge.dispose()
  })
}
