#!/usr/bin/env node
/**
 * Phase 3 browser end-to-end pass (T3) against the **real backend** dev server.
 *
 * Prerequisites:
 *   - backend: `cd ../backend && uv run python -m app.dev_server --seed --delay-ms 800`
 *   - web:     `VITE_USE_MOCKS=false npm run dev` (default http://localhost:5174 here,
 *              because another thread often owns 5173)
 *
 * Drives headless Chrome over the DevTools Protocol (no dependencies, Node >= 22 WebSocket).
 * At 1280 px and 375 px it runs the 8 T3 steps:
 *   1. doctor: login → pick a doctor → chat to completion (typing + disabled input) → result +
 *      backstage sanity → feedback → evaluation (empty submit → errors + focus, then complete) →
 *      summary + reveal
 *   2. another doctor ended with the finish button + confirm dialog
 *   3. «خطا» → error bubble → ارسال دوباره → no duplicated patient bubble
 *   4. 409: two tabs on the same active session → toast + text restored
 *   5. 401: garbage token → redirect to /login
 *   6. 403: doctor2 on doctor's session → «دسترسی ندارید»
 *   7. admin: dashboard, group-by, CSV download, reload toast, sessions list + detail
 *   8. blindness: real agent ids + model slugs fetched through the admin API are absent from the
 *      DOM of /, an active chat, a completed-unevaluated session and /history
 * One screenshot per step per width is written to docs/reports/phase-3-screenshots/.
 *
 * Usage: node scripts/qa-browser-phase3.mjs [--base http://localhost:5174]
 */
import { spawn } from 'node:child_process'
import { accessSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SHOTS = join(ROOT, 'docs', 'reports', 'phase-3-screenshots')
const DOWNLOADS = join(tmpdir(), `triage-p3-downloads-${Date.now()}`)

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5174'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
]

const WIDTHS = [
  { name: '1280', width: 1280, height: 800, mobile: false },
  { name: '375', width: 375, height: 812, mobile: true },
]

const DOCTOR = { username: 'doctor', password: 'doctor123' }
const DOCTOR2 = { username: 'doctor2', password: 'doctor123' }
const ADMIN = { username: 'admin', password: 'admin123' }

const T = {
  greeting: 'سلام',
  error: 'این پیام شامل خطا است و باید شکست بخورد.',
  concurrent1: 'پیام همزمان اول برای آزمون ۴۰۹',
  concurrent2: 'پیام همزمان دوم برای آزمون ۴۰۹',
  chat: [
    'دو روز است دل‌درد دارم و حالت تهوع دارم.',
    'درد در ناحیه بالای شکم است و با غذا بدتر می‌شود.',
    'تب یا اسهال نداشته‌ام، دارویی هم مصرف نمی‌کنم.',
    'سابقه بیماری خاصی ندارم.',
    'چیز دیگری به ذهنم نمی‌رسد.',
  ],
}

/* ------------------------------------------------------------------ */
/* CDP plumbing                                                        */
/* ------------------------------------------------------------------ */
async function startChrome() {
  const exe = CHROME_CANDIDATES.find((path) => {
    try { accessSync(path); return true } catch { return false }
  })
  if (!exe) throw new Error('headless Chrome not found')
  const profile = join(tmpdir(), `triage-p3-${Date.now()}`)
  const child = spawn(exe, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('Chrome did not expose a DevTools socket')), 20_000)
    child.stderr.on('data', (chunk) => {
      buffer += String(chunk)
      const match = buffer.match(/ws:\/\/[^\s]+/)
      if (match) { clearTimeout(timer); resolve(match[0]) }
    })
    child.on('exit', () => { clearTimeout(timer); reject(new Error('Chrome exited early:\n' + buffer)) })
  })
  return { child, wsUrl }
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.listeners = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
        else resolve(msg.result)
        return
      }
      for (const listener of this.listeners) listener(msg)
    })
  }

  onMessage(listener) { this.listeners.push(listener) }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(payload))
    })
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('WS connect failed')))
  })
  return new Cdp(ws)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function openPage(browser) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  await browser.send('Page.enable', {}, sessionId)
  await browser.send('Runtime.enable', {}, sessionId)

  const evaluate = async (expression) => {
    const result = await browser.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    }, sessionId)
    if (result.exceptionDetails) {
      throw new Error(`page eval failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`)
    }
    return result.result.value
  }

  const page = {
    targetId,
    sessionId,
    evaluate,
    send: (method, params) => browser.send(method, params, sessionId),
    goto: async (path, { settle = 500 } = {}) => {
      await browser.send('Page.navigate', { url: base + path }, sessionId)
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        if (await evaluate(`document.readyState === 'complete'`)) break
        await sleep(150)
      }
      await sleep(settle)
    },
    url: () => evaluate('location.pathname + location.search'),
    screenshot: async (name) => {
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      const file = join(SHOTS, name)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      return file
    },
    setViewport: (vp) =>
      browser.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
      }, sessionId),
    close: () => browser.send('Target.closeTarget', { targetId }).catch(() => {}),
  }
  return page
}

async function waitFor(page, predicateSource, label, timeoutMs = 30_000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await page.evaluate(`(() => !!(${predicateSource}))()`)
    if (last) return
    await sleep(intervalMs)
  }
  throw new Error(`timeout waiting for ${label}`)
}

/* ------------------------------------------------------------------ */
/* In-page snippets                                                    */
/* ------------------------------------------------------------------ */
const setInputValue = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) throw new Error('missing element: ' + ${JSON.stringify(selector)})
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})()`

const clickButtonByText = (text, scope = 'document') => `(() => {
  const root = ${scope === 'document' ? 'document' : scope}
  const button = [...root.querySelectorAll('button')].find((b) => (b.textContent || '').includes(${JSON.stringify(text)}))
  if (!button) return false
  button.click()
  return true
})()`

const saneProbe = `(() => {
  const html = document.documentElement.outerHTML
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => (h.textContent || '').trim())
  return {
    objectObject: html.includes('[object Object]'),
    emptyHeadings: headings.filter((text) => text === '').length,
    headingCount: headings.length,
    undefinedText: (document.body.innerText || '').includes('undefined'),
  }
})()`

const blindnessProbe = (needles) => `(() => {
  const html = document.documentElement.outerHTML
  return { leaks: ${JSON.stringify(needles)}.filter((needle) => html.includes(needle)) }
})()`

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */
async function login(page, { username, password }) {
  // localStorage is unreachable on about:blank — land on the origin first.
  await page.goto('/login')
  await page.evaluate('localStorage.clear()')
  await page.goto('/login')
  await page.evaluate(setInputValue('#username', username))
  await page.evaluate(setInputValue('#password', password))
  await page.evaluate(`document.getElementById('password').closest('form').requestSubmit()`)
  await waitFor(page, `!location.pathname.startsWith('/login')`, `login ${username}`)
  await sleep(300)
}

async function startSession(page) {
  await page.goto('/')
  await waitFor(page, `!!document.querySelector('[data-testid="doctor-avatar"]')`, 'doctors list')
  const started = await page.evaluate(clickButtonByText('شروع گفتگو'))
  if (!started) throw new Error('no شروع گفتگو button found')
  await waitFor(page, `/^\\/sessions\\/[0-9a-f-]+$/.test(location.pathname)`, 'session route')
  await waitFor(page, `!!document.querySelector('[data-testid="chat-panel"]')`, 'chat panel')
  return page.evaluate('location.pathname.split("/").pop()')
}

async function sendChat(page, text) {
  await page.evaluate(`(() => {
    const composer = document.querySelector('[data-testid="chat-panel"] textarea')
    if (!composer) throw new Error('no composer')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(composer, ${JSON.stringify(text)})
    composer.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(120)
  return page.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="ارسال"]')
    if (!button) throw new Error('no send button')
    button.click()
    return true
  })()`)
}

/** Send one message and report whether the typing bubble showed and the composer was disabled. */
async function sendChatObserved(page, text) {
  await sendChat(page, text)
  await sleep(120)
  const observed = await page.evaluate(`(() => ({
    typingShown: !!document.querySelector('[data-testid="typing-indicator"]'),
    composerDisabled: !!document.querySelector('[data-testid="chat-panel"] textarea')?.disabled,
  }))()`)
  await waitFor(page, `!document.querySelector('[data-testid="typing-indicator"]')`, 'typing bubble to finish', 60_000)
  return observed
}

async function chatToCompletion(page) {
  let observed = { typingShown: false, composerDisabled: false }
  for (let i = 0; i < T.chat.length; i += 1) {
    observed = await sendChatObserved(page, T.chat[i])
    if (await page.evaluate(`!!document.querySelector('[data-testid="result-card"]')`)) return observed
  }
  return observed
}

async function fillEvaluation(page) {
  return page.evaluate(`(() => {
    const kpiFields = [...document.querySelectorAll('[id^="field-"]')].filter((el) => el.querySelector('input[type="radio"]'))
    for (const field of kpiFields) field.querySelector('input[type="radio"]').click()
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    for (const id of ['verdict-triage', 'verdict-specialty']) {
      const select = document.getElementById(id)
      const option = [...select.options].find((o) => o.value !== '')
      selectSetter.call(select, option.value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const submit = document.querySelector('[data-testid="evaluation-form"] button[type="submit"]')
    submit.click()
    return { kpiCount: kpiFields.length }
  })()`)
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */
let failures = 0
const consoleErrors = []
function check(label, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

async function fetchNeedles(page) {
  return page.evaluate(`(async () => {
    const token = localStorage.getItem('triage_lab_token')
    const get = (path) => fetch(path, { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.json())
    const [agents, sessions, metrics] = await Promise.all([
      get('/api/v1/agents'),
      get('/api/v1/admin/sessions?limit=50'),
      get('/api/v1/admin/metrics?group_by=model'),
    ])
    const needles = new Set(['simple', 'structured'])
    for (const agent of agents) needles.add(agent.id)
    for (const item of sessions.items) needles.add(item.agent_reveal.model)
    for (const row of metrics.rows) {
      if (row.model) needles.add(row.model)
      if (row.architecture) needles.add(row.architecture)
    }
    return [...needles]
  })()`)
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
async function runViewport(browser, vp, shared) {
  console.log(`\n=== viewport ${vp.name}px ===`)
  const page = await openPage(browser)
  await page.setViewport(vp)

  // ---- step 1: doctor login → chat → feedback → evaluation ----
  try {
    await login(page, DOCTOR)
    const sessionId = await startSession(page)
    shared.doctorSessionId = sessionId
    const observed = await chatToCompletion(page)
    check(`${vp.name} step1 typing bubble visible`, observed.typingShown)
    check(`${vp.name} step1 input disabled during turn`, observed.composerDisabled)

    await waitFor(page, `!!document.querySelector('[data-testid="result-card"]')`, 'result card')
    await waitFor(page, `!!document.querySelector('[data-testid="backstage-panel"]')`, 'backstage panel')
    const sane = await page.evaluate(saneProbe)
    check(`${vp.name} step1 no [object Object]`, !sane.objectObject)
    check(`${vp.name} step1 no empty headings`, sane.emptyHeadings === 0, `headings=${sane.headingCount}`)
    check(`${vp.name} step1 no literal "undefined"`, !sane.undefinedText)
    const backstageTurns = await page.evaluate(`document.querySelectorAll('[data-testid="backstage-turn"]').length`)
    check(`${vp.name} step1 backstage has turns`, backstageTurns > 0, `turns=${backstageTurns}`)
    await page.screenshot(`step1-result-${vp.name}.png`)

    // feedback on the first agent message
    const feedbackClicked = await page.evaluate(`(() => {
      const button = document.querySelector('button[aria-label="بازخورد مثبت"]')
      if (!button) return false
      button.click()
      return true
    })()`)
    check(`${vp.name} step1 feedback button present`, feedbackClicked)
    await sleep(900)
    const feedbackPressed = await page.evaluate(`document.querySelector('button[aria-label="بازخورد مثبت"]')?.getAttribute('aria-pressed')`)
    check(`${vp.name} step1 feedback saved`, feedbackPressed === 'true', String(feedbackPressed))

    // evaluation: empty submit → errors + focus
    await waitFor(page, `!!document.querySelector('[data-testid="evaluation-form"]')`, 'evaluation form')
    await page.evaluate(`document.querySelector('[data-testid="evaluation-form"] button[type="submit"]').click()`)
    await sleep(400)
    const emptySubmit = await page.evaluate(`(() => ({
      errors: ((document.body.innerText || '').match(/لطفاً این مورد را کامل کنید/g) || []).length,
      focusedInField: !!document.activeElement && !!document.activeElement.closest('[id^="field-"]'),
    }))()`)
    check(`${vp.name} step1 empty submit shows errors`, emptySubmit.errors >= 9, `errors=${emptySubmit.errors}`)
    check(`${vp.name} step1 empty submit focuses a field`, emptySubmit.focusedInField)
    await page.screenshot(`step1-evaluation-errors-${vp.name}.png`)

    const filled = await fillEvaluation(page)
    check(`${vp.name} step1 nine KPI fields`, filled.kpiCount === 9, `found=${filled.kpiCount}`)
    await waitFor(page, `!!document.querySelector('[data-testid="evaluation-summary"]')`, 'evaluation summary', 40_000)
    await waitFor(page, `!!document.querySelector('[data-testid="reveal"]')`, 'reveal')
    check(`${vp.name} step1 summary + reveal shown`, true)
    await page.screenshot(`step1-summary-reveal-${vp.name}.png`)
  } catch (error) {
    check(`${vp.name} step1 doctor flow`, false, String(error).slice(0, 160))
  }

  // ---- step 2: finish button + confirm dialog ----
  try {
    await page.goto('/')
    await waitFor(page, `!!document.querySelector('[data-testid="doctor-avatar"]')`, 'doctors list')
    await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('[data-testid="doctor-avatar"]')].map((n) => n.closest('div'))
      const buttons = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').includes('شروع گفتگو'))
      buttons[buttons.length - 1].click()
    })()`)
    await waitFor(page, `/^\\/sessions\\/[0-9a-f-]+$/.test(location.pathname)`, 'session route')
    await waitFor(page, `!!document.querySelector('[data-testid="chat-panel"]')`, 'chat panel')
    await sendChat(page, T.chat[0])
    await waitFor(page, `!document.querySelector('[data-testid="typing-indicator"]')`, 'first reply', 60_000)
    await page.evaluate(clickButtonByText('پایان گفتگو و دریافت نتیجه'))
    await waitFor(page, `!!document.querySelector('[data-testid="confirm-dialog"]')`, 'confirm dialog')
    await page.evaluate(`(() => {
      const dialog = document.querySelector('[data-testid="confirm-dialog"]')
      const confirm = [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'بله')
      confirm.click()
    })()`)
    await waitFor(page, `!!document.querySelector('[data-testid="result-card"]')`, 'result after finish', 60_000)
    shared.completedUnevaluatedId = await page.evaluate('location.pathname.split("/").pop()')
    check(`${vp.name} step2 finish → result`, true)
    await page.screenshot(`step2-finish-${vp.name}.png`)
  } catch (error) {
    check(`${vp.name} step2 finish flow`, false, String(error).slice(0, 160))
  }

  // ---- step 3: «خطا» → error bubble → resend ----
  try {
    await startSession(page)
    await sendChat(page, T.error)
    await waitFor(page, `!!document.querySelector('[data-testid="message-error"]')`, 'error bubble', 60_000)
    const errorBubble = await page.evaluate(`(() => {
      const bubble = document.querySelector('[data-testid="message-error"]')
      return { hasResend: [...bubble.querySelectorAll('button')].some((b) => (b.textContent || '').includes('ارسال دوباره')) }
    })()`)
    check(`${vp.name} step3 error bubble offers ارسال دوباره`, errorBubble.hasResend)
    const before = await page.evaluate(`[...document.querySelectorAll('[data-testid="message-text"]')].filter((n) => n.textContent.includes(${JSON.stringify(T.error)})).length`)
    check(`${vp.name} step3 one patient bubble before resend`, before === 1, `count=${before}`)
    const repliesBefore = await page.evaluate(`document.querySelectorAll('[data-testid="message-question"],[data-testid="message-result"]').length`)
    await page.evaluate(clickButtonByText('ارسال دوباره'))
    await waitFor(
      page,
      `document.querySelectorAll('[data-testid="message-question"],[data-testid="message-result"]').length > ${repliesBefore}`,
      'resend reply',
      60_000,
    )
    const after = await page.evaluate(`[...document.querySelectorAll('[data-testid="message-text"]')].filter((n) => n.textContent.includes(${JSON.stringify(T.error)})).length`)
    check(`${vp.name} step3 no duplicated patient bubble`, after === 1, `count=${after}`)
    check(`${vp.name} step3 resend succeeded`, true)
    await page.screenshot(`step3-resend-${vp.name}.png`)
  } catch (error) {
    check(`${vp.name} step3 خطا/resend`, false, String(error).slice(0, 160))
  }

  // ---- step 4: 409 in two tabs ----
  try {
    const sessionId = await startSession(page)
    shared.activeSessionId = sessionId
    const tab2 = await openPage(browser)
    await tab2.setViewport(vp)
    // share the auth (same profile/origin) and land on the same session
    await tab2.goto('/')
    await tab2.goto(`/sessions/${sessionId}`)
    await waitFor(tab2, `!!document.querySelector('[data-testid="chat-panel"] textarea')`, 'tab2 composer')

    await sendChat(page, T.concurrent1) // tab 1 starts the (slow) turn
    await sleep(200)
    await sendChat(tab2, T.concurrent2) // tab 2 collides
    await waitFor(
      tab2,
      `(() => { const t = document.querySelector('[data-testid="toast"]'); return !!t && t.textContent.includes('پیام قبلی هنوز در حال پردازش است.') })()`,
      'tab2 409 toast',
      20_000,
    )
    const restored = await tab2.evaluate(`document.querySelector('[data-testid="chat-panel"] textarea').value`)
    check(`${vp.name} step4 409 toast shown`, true)
    check(`${vp.name} step4 rejected text restored`, restored === T.concurrent2, restored)
    await tab2.screenshot(`step4-409-toast-${vp.name}.png`)
    await waitFor(page, `!document.querySelector('[data-testid="typing-indicator"]')`, 'tab1 reply', 60_000)
    await tab2.close()
  } catch (error) {
    check(`${vp.name} step4 409 two tabs`, false, String(error).slice(0, 160))
  }

  // ---- step 5: 401 redirect ----
  try {
    await page.goto('/')
    await page.evaluate(`localStorage.setItem('triage_lab_token', 'garbage-token-does-not-decode')`)
    await page.goto('/')
    await waitFor(page, `location.pathname === '/login'`, 'redirect to /login', 20_000)
    check(`${vp.name} step5 401 → /login`, true)
    await page.screenshot(`step5-401-login-${vp.name}.png`)
  } catch (error) {
    check(`${vp.name} step5 401 redirect`, false, String(error).slice(0, 160))
  }

  // ---- step 6: 403 as doctor2 ----
  try {
    await login(page, DOCTOR2)
    await page.goto(`/sessions/${shared.doctorSessionId}`)
    await waitFor(page, `!!document.querySelector('[data-testid="session-forbidden"]')`, '403 state', 20_000)
    const forbiddenText = await page.evaluate(`document.querySelector('[data-testid="session-forbidden"]').textContent`)
    check(`${vp.name} step6 «دسترسی ندارید»`, forbiddenText.includes('دسترسی ندارید'))
    await page.screenshot(`step6-403-${vp.name}.png`)
  } catch (error) {
    check(`${vp.name} step6 403`, false, String(error).slice(0, 160))
  }

  // ---- step 7: admin ----
  try {
    await login(page, ADMIN)
    await page.goto('/admin')
    await waitFor(page, `!!document.querySelector('[data-testid="metrics-table"]')`, 'metrics table', 30_000)
    const adminBits = await page.evaluate(`(() => ({
      cards: ['summary-total-sessions','summary-evaluated','summary-safety-flags','summary-safety-floor'].filter((id) => !!document.querySelector('[data-testid="' + id + '"]')).length,
      chart: !!document.querySelector('[data-testid="triage-chart"]'),
      chartImg: document.querySelector('[data-testid="triage-chart"] svg[role="img"], [data-testid="triage-chart"] [role="img"]') !== null,
      recent: !!document.querySelector('[data-testid="recent-sessions"]'),
      table: !!document.querySelector('[data-testid="metrics-table"]'),
    }))()`)
    check(`${vp.name} step7 four summary cards`, adminBits.cards === 4)
    check(`${vp.name} step7 chart`, adminBits.chart, `img=${adminBits.chartImg}`)
    check(`${vp.name} step7 recent sessions + table`, adminBits.recent && adminBits.table)
    await page.screenshot(`step7-dashboard-${vp.name}.png`)

    // group-by switch
    const switched = await page.evaluate(clickButtonByText('بر اساس معماری'))
    await sleep(900)
    const groupByActive = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('بر اساس معماری'))
      return button?.getAttribute('aria-pressed')
    })()`)
    check(`${vp.name} step7 group-by switch`, switched && groupByActive === 'true')

    // CSV download
    rmSync(DOWNLOADS, { recursive: true, force: true })
    mkdirSync(DOWNLOADS, { recursive: true })
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS })
    await page.evaluate(clickButtonByText('دریافت CSV'))
    let csv = null
    for (let i = 0; i < 30 && !csv; i += 1) {
      await sleep(300)
      try { csv = readdirSync(DOWNLOADS).find((name) => name.endsWith('.csv')) } catch { /* dir missing */ }
    }
    check(`${vp.name} step7 CSV downloaded`, !!csv, csv ?? 'no file')

    // reload toast
    await page.evaluate(clickButtonByText('بارگذاری مجدد تنظیمات'))
    await waitFor(
      page,
      `(() => { const t = document.querySelector('[data-testid="toast"]'); return !!t && t.textContent.includes('بارگذاری شد') })()`,
      'reload toast',
      20_000,
    )
    check(`${vp.name} step7 reload toast`, true)

    // admin sessions list + filters
    await page.goto('/admin/sessions')
    await waitFor(page, `!!document.querySelector('[data-testid="admin-sessions-table"]')`, 'admin sessions table', 30_000)
    const filters = await page.evaluate(`document.querySelectorAll('select').length`)
    check(`${vp.name} step7 admin sessions filters`, filters >= 3, `selects=${filters}`)
    await page.screenshot(`step7-admin-sessions-${vp.name}.png`)

    // filter to evaluated sessions, then open the first one: reveal + read-only feedback
    await page.evaluate(`(() => {
      const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'true'))
      if (!select) throw new Error('evaluated filter not found')
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(select, 'true')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await sleep(900)
    await page.evaluate(`document.querySelector('[data-testid="admin-session-row"]').click()`)
    await waitFor(page, `/^\\/admin\\/sessions\\/[0-9a-f-]+$/.test(location.pathname)`, 'admin session detail')
    await waitFor(page, `!!document.querySelector('[data-testid="reveal"]')`, 'admin reveal', 30_000)
    const readOnlyFeedback = await page.evaluate(`(document.body.innerText || '').includes('بازخورد پس از ثبت ارزیابی قابل تغییر نیست.')`)
    check(`${vp.name} step7 detail reveal + read-only feedback`, readOnlyFeedback)
    await page.screenshot(`step7-admin-detail-${vp.name}.png`)

    // ---- step 8: blindness (fetch needles as admin, then probe as doctor) ----
    const needles = await fetchNeedles(page)
    shared.needles = needles
    await login(page, DOCTOR)
    const routes = ['/', `/sessions/${shared.activeSessionId}`, `/sessions/${shared.completedUnevaluatedId}`, '/history']
    const leaks = []
    for (const route of routes) {
      await page.goto(route)
      const probe = await page.evaluate(blindnessProbe(needles))
      if (probe.leaks.length) leaks.push(`${route}: ${probe.leaks.join(', ')}`)
    }
    check(`${vp.name} step8 blindness (${needles.length} needles, 4 routes)`, leaks.length === 0, leaks.join(' | ') || 'no leaks')
    await page.goto('/history')
    await page.screenshot(`step8-blindness-${vp.name}.png`)
  } catch (error) {
    check(`${vp.name} step7/8 admin + blindness`, false, String(error).slice(0, 160))
  }

  await page.close()
}

async function main() {
  const serverUp = await fetch(base).then((r) => r.ok).catch(() => false)
  if (!serverUp) {
    console.error(`[qa-browser-phase3] no dev server at ${base} — start 'VITE_USE_MOCKS=false npm run dev' first`)
    process.exit(2)
  }
  mkdirSync(SHOTS, { recursive: true })
  mkdirSync(DOWNLOADS, { recursive: true })

  const { child, wsUrl } = await startChrome()
  const browser = await connect(wsUrl)
  browser.onMessage((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const text = String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? 'exception').split('\n')[0]
      if (text && !text.includes('favicon')) consoleErrors.push(text)
    }
  })

  const shared = {}
  for (const vp of WIDTHS) {
    await runViewport(browser, vp, shared)
  }

  console.log(`\n[qa-browser-phase3] screenshots → docs/reports/phase-3-screenshots/`)
  const unique = [...new Set(consoleErrors)]
  console.log(unique.length ? `console errors:\n  ${unique.slice(0, 8).join('\n  ')}` : 'console errors: none')

  child.kill()
  if (failures > 0) {
    console.error(`\n[qa-browser-phase3] FAIL — ${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('\n[qa-browser-phase3] OK — all checks passed')
  process.exit(0)
}

main().catch((error) => {
  console.error('[qa-browser-phase3] crashed:', error)
  process.exit(1)
})
