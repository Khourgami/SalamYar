#!/usr/bin/env node
/**
 * Real-browser QA for phase 2 (DESIGN_SYSTEM §9), driven over the Chrome DevTools
 * Protocol with headless Chrome — no extra dependencies (Node >= 22 WebSocket).
 *
 * Prerequisites: `npm run dev` already running (MSW on) at http://localhost:5173.
 *
 * Per viewport (375, 768, 1024, 1280, 1440), signed in as the evaluator and then the
 * admin:
 *   - every route is probed for horizontal page overflow (§9.1)
 *   - the test banner is checked visible + sticky (§9.2)
 *   - the blindness probe runs on /, the active chat, the completed-unevaluated
 *     session and /history (§9.3): no agent id, model slug or architecture word
 *   - the reveal is checked on the evaluated session
 *   - >=1024 px: the sidebar and the admin nav items; <1024 px: the drawer
 *     (opens, closes on Escape / overlay / navigation, focus returns)
 * Extra at 1280 px: a real login through the MSW-backed /login form, a chat
 * round-trip, the reduced-motion probe (§9.5) and evaluation submit → reveal.
 * Screenshots of the main pages are written to docs/reports/phase-2-screenshots/.
 *
 * Usage: node scripts/qa-browser.mjs [--base http://localhost:5173]
 */
import { spawn } from 'node:child_process'
import { accessSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SHOTS_DIR = join(ROOT, 'docs', 'reports', 'phase-2-screenshots')

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5173'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
]

const SESSION_IDS = {
  active: '11111111-1111-4111-8111-111111111111',
  completed: '22222222-2222-4222-8222-222222222222',
  evaluated: '33333333-3333-4333-8333-333333333333',
}

/** Forbidden before evaluation: the 8 agent ids, 6 model slugs, architecture words. */
const FORBIDDEN = [
  'b-gemini3flash', 'a-sonnet5', 'b-gpt54', 'b-deepseekv4pro', 'a-gpt54',
  'b-sonnet5', 'b-gpt5mini', 'b-gemini31pro',
  'google/gemini-3-flash', 'anthropic/claude-sonnet-5', 'openai/gpt-5.4',
  'deepseek/deepseek-v4-pro', 'openai/gpt-5-mini', 'google/gemini-3.1-pro',
  'structured', 'simple',
]

const DOCTOR = {
  username: 'doctor',
  password: 'doctor123',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    username: 'doctor',
    display_name: 'دکتر آزمایشی',
    role: 'evaluator',
  },
}
const ADMIN = {
  username: 'admin',
  password: 'admin123',
  user: {
    id: '10000000-0000-4000-8000-000000000003',
    username: 'admin',
    display_name: 'مدیر',
    role: 'admin',
  },
}

const VIEWPORTS = [
  { name: '375', width: 375, height: 812, mobile: true },
  { name: '768', width: 768, height: 1024, mobile: false },
  { name: '1024', width: 1024, height: 768, mobile: false },
  { name: '1280', width: 1280, height: 800, mobile: false },
  { name: '1440', width: 1440, height: 900, mobile: false },
]

/* ------------------------------------------------------------------ */
/* CDP plumbing                                                        */
/* ------------------------------------------------------------------ */
async function startChrome() {
  const exe = CHROME_CANDIDATES.find((path) => {
    try { accessSync(path); return true } catch { return false }
  })
  if (!exe) throw new Error('headless Chrome not found')
  const profile = join(tmpdir(), `triage-qa-${Date.now()}`)
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
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
        else resolve(msg.result)
      }
    })
  }

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

/* ------------------------------------------------------------------ */
/* In-page helpers                                                     */
/* ------------------------------------------------------------------ */
/** `page` bundles the browser connection with one target's session id. */
function makePage(browser, sessionId) {
  const evaluate = async (expression) => {
    const result = await browser.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId)
    if (result.exceptionDetails) {
      throw new Error(`page eval failed: ${result.exceptionDetails.text} ${JSON.stringify(result.exceptionDetails.exception?.description ?? '')}`)
    }
    return result.result.value
  }
  return {
    evaluate,
    send: (method, params) => browser.send(method, params, sessionId),
    goto: async (path) => {
      await browser.send('Page.navigate', { url: base + path }, sessionId)
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        if (await evaluate(`document.readyState === 'complete'`)) break
        await sleep(200)
      }
      await sleep(400) // let React commit and the mock data settle
    },
    screenshot: async (name) => {
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      const file = join(SHOTS_DIR, name)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      return file
    },
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Polls an in-page predicate until truthy. */
async function waitFor(page, predicateSource, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.evaluate(`(() => !!(${predicateSource}))()`)) return
    await sleep(200)
  }
  throw new Error(`timeout waiting for ${label}`)
}

/* ---------------------------- probes ------------------------------- */
const overflowProbe = /* js */ `(() => {
  const vw = document.documentElement.clientWidth
  const bad = []
  if (document.documentElement.scrollWidth > vw + 1) {
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect()
      if (rect.right > vw + 1 && rect.width > 1) {
        let clipped = false
        let parent = el.parentElement
        while (parent && parent !== document.body) {
          const style = getComputedStyle(parent)
          if (style.overflowX === 'hidden' || style.clip) { clipped = true; break }
          if (/(auto|scroll)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth) { clipped = true; break }
          parent = parent.parentElement
        }
        if (!clipped) {
          const id = el.dataset && el.dataset.testid ? '#' + el.dataset.testid : ''
          bad.push(el.tagName.toLowerCase() + id)
        }
      }
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, vw, offenders: [...new Set(bad)].slice(0, 5) }
})()`

const bannerProbe = /* js */ `(() => {
  const banner = document.querySelector('[data-testid="top-banner"]')
  if (!banner) return { present: false }
  const rect = banner.getBoundingClientRect()
  return {
    present: true,
    visible: rect.height > 0 && rect.width > 0 && rect.top >= 0 && rect.top < 120,
    sticky: getComputedStyle(banner).position === 'sticky',
    inViewport: rect.bottom > 0,
  }
})()`

const blindnessProbe = /* js */ `(() => {
  const html = document.documentElement.outerHTML
  const forbidden = ${JSON.stringify(FORBIDDEN)}
  return { leaks: forbidden.filter((needle) => html.includes(needle)) }
})()`

const shellProbe = /* js */ `(() => {
  const sidebar = document.querySelector('[data-testid="sidebar"]')
  const menuButton = document.querySelector('button[aria-label="منو"]')
  const menuRect = menuButton?.getBoundingClientRect()
  const navItems = [...document.querySelectorAll('nav a')].map((a) => a.textContent.trim())
  return {
    sidebarVisible: !!sidebar && sidebar.getBoundingClientRect().width > 0,
    hasMenuButton: !!menuButton,
    menuButtonVisible: !!menuRect && menuRect.width > 0 && menuRect.height > 0,
    navItems,
    active: document.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null,
    displayName: document.querySelector('[data-testid="header-display-name"]')?.textContent ?? null,
  }
})()`

const drawerProbe = /* js */ `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const menuButton = document.querySelector('button[aria-label="منو"]')
  if (!menuButton) return { skipped: true }
  const out = {}
  const openDrawer = () => { menuButton.click(); return sleep(400) }
  const isOpen = () => {
    const drawer = document.querySelector('[data-testid="drawer"]')
    return !!drawer && drawer.getBoundingClientRect().width > 0
  }
  await openDrawer()
  out.opens = isOpen()
  out.focusInsideOnOpen = out.opens && document.querySelector('[data-testid="drawer"]').contains(document.activeElement)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(400)
  out.closesOnEscape = !isOpen()
  out.focusReturned = document.activeElement === menuButton
  await openDrawer()
  const overlay = document.querySelector('[data-testid="drawer-overlay"]')
  if (overlay) overlay.click()
  await sleep(400)
  out.closesOnOverlay = !isOpen()
  await openDrawer()
  const link = document.querySelector('[data-testid="drawer"] a')
  if (link) { link.click(); await sleep(500) }
  out.closesOnNavigation = !isOpen()
  return out
})()`

const revealProbe = /* js */ `(() => {
  const reveal = document.querySelector('[data-testid="reveal"]')
  return { present: !!reveal, text: reveal ? reveal.textContent.slice(0, 60) : null }
})()`

const focusRingProbe = /* js */ `(() => {
  // Read-only: the trusted CDP Tab already moved focus. Re-focusing here would
  // clear the :focus-visible match (programmatic focus never matches).
  const el = document.activeElement
  if (!el || el === document.body) return { ok: false, reason: 'nothing focused', hasFocus: document.hasFocus() }
  const style = getComputedStyle(el)
  return {
    ok: true,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').trim().slice(0, 24),
    matches: el.matches(':focus-visible'),
    outline: style.outlineWidth + ' ' + style.outlineStyle,
    minTarget: Math.round(Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)),
  }
})()`

/* ---------------------------- actions ------------------------------ */
async function signIn(page, account) {
  // Real login through the MSW-backed /login form (not a localStorage stub).
  await page.evaluate(`localStorage.clear()`)
  await page.goto('/login')
  await page.evaluate(/* js */ `(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    const username = document.getElementById('username')
    const password = document.getElementById('password')
    setter.call(username, ${JSON.stringify(account.username)})
    username.dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(password, ${JSON.stringify(account.password)})
    password.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await page.evaluate(`document.getElementById('password').closest('form').requestSubmit()`)
  await waitFor(page, `!location.pathname.startsWith('/login')`, 'login redirect')
  await sleep(300)
}

async function seedAuth(page, account) {
  // localStorage is unreachable on about:blank — land on the app first.
  await page.goto('/login')
  await page.evaluate(/* js */ `(() => {
    localStorage.setItem('triage_lab_token', 'mock-token-${account.user.username}');
    localStorage.setItem('triage_lab_user', JSON.stringify(${JSON.stringify(account.user)}));
  })()`)
}

async function chatRoundTrip(page) {
  return page.evaluate(/* js */ `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const composer = document.querySelector('textarea')
    if (!composer) return { skipped: true }
    const before = document.querySelectorAll('li').length
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(composer, 'سلام، شکمم درد می‌کند')
    composer.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(120)
    document.querySelector('button[aria-label="ارسال"]').click()
    await sleep(600)
    const typingShown = !!document.querySelector('[data-testid="typing-indicator"]')
    const disabledWhileTyping = composer.disabled
    const deadline = Date.now() + 30_000
    let replied = false
    while (Date.now() < deadline) {
      await sleep(400)
      if (!document.querySelector('[data-testid="typing-indicator"]')) {
        if (document.querySelectorAll('li').length > before) { replied = true; break }
      }
    }
    return { typingShown, disabledWhileTyping, replied }
  })()`)
}

async function submitEvaluation(page) {
  return page.evaluate(/* js */ `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    const kpiFields = [...document.querySelectorAll('[id^="field-"]')].filter((el) => el.querySelector('input[type="radio"]'))
    if (kpiFields.length < 9) return { error: 'expected 9 KPI fields, found ' + kpiFields.length }
    for (const field of kpiFields) field.querySelector('input[type="radio"]').click()
    await sleep(120)
    const selects = [...document.querySelectorAll('select')]
    if (selects.length < 2) return { error: 'verdict selects missing' }
    for (const select of selects.slice(0, 2)) {
      selectSetter.call(select, select.querySelector('option:nth-child(2)').value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const submit = [...document.querySelectorAll('button[type="submit"]')].pop()
    submit.click()
    return { submitted: true }
  })()`)
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
let failures = 0
const consoleErrors = []
const screenshots = []

function check(label, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const serverUp = await fetch(base).then((r) => r.ok).catch(() => false)
  if (!serverUp) {
    console.error(`[qa-browser] no dev server at ${base} — start \`npm run dev\` first`)
    process.exit(2)
  }
  mkdirSync(SHOTS_DIR, { recursive: true })

  const { child, wsUrl } = await startChrome()
  const browser = await connect(wsUrl)
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  await browser.send('Page.enable', {}, sessionId)
  await browser.send('Runtime.enable', {}, sessionId)
  const page = makePage(browser, sessionId)

  // collect uncaught exceptions via Runtime.enable events on this session
  browser.ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.sessionId !== sessionId) return
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? 'exception').split('\n')[0])
    }
  })

  for (const vp of VIEWPORTS) {
    console.log(`\n=== viewport ${vp.name}px ===`)
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    })

    // ---- evaluator pass over the doctor-visible routes
    await seedAuth(page, DOCTOR)
    // the login page is captured signed-out (banner §4.3 says it appears on /login too)
    if (vp.width === 1280 || vp.width === 375) {
      await page.evaluate(`localStorage.clear()`)
      await page.goto('/login')
      await sleep(400)
      const loginBanner = await page.evaluate(bannerProbe)
      check(`${vp.name}px /login banner visible + sticky`, loginBanner.present && loginBanner.visible && loginBanner.sticky, JSON.stringify(loginBanner))
      screenshots.push(await page.screenshot(`login-${vp.name}.png`))
      await seedAuth(page, DOCTOR)
    }
    const blindnessRoutes = ['/', `/sessions/${SESSION_IDS.active}`, `/sessions/${SESSION_IDS.completed}`, '/history']
    let blindnessClean = true
    let blindnessDetail = ''

    for (const route of ['/', `/sessions/${SESSION_IDS.active}`, `/sessions/${SESSION_IDS.completed}`, `/sessions/${SESSION_IDS.evaluated}`, '/history']) {
      await page.goto(route)
      const overflow = await page.evaluate(overflowProbe)
      const banner = await page.evaluate(bannerProbe)
      check(`${vp.name}px ${route} no horizontal overflow`, overflow.scrollWidth <= overflow.vw + 1,
        overflow.offenders.length ? `offenders: ${overflow.offenders.join(' | ')}` : `scrollWidth ${overflow.scrollWidth}/${overflow.vw}`)
      check(`${vp.name}px ${route} banner visible + sticky`, banner.present && banner.visible && banner.sticky,
        JSON.stringify(banner))

      if (blindnessRoutes.includes(route)) {
        const blind = await page.evaluate(blindnessProbe)
        if (blind.leaks.length) {
          blindnessClean = false
          blindnessDetail += `${route}: ${blind.leaks.join(', ')} `
        }
      }

      if (route === `/sessions/${SESSION_IDS.evaluated}`) {
        const reveal = await page.evaluate(revealProbe)
        check(`${vp.name}px reveal present on evaluated session`, reveal.present, reveal.text ?? 'absent')
      }

      if ((vp.width === 1280 || vp.width === 375) && !route.startsWith('/sessions')) {
        const name = route === '/' ? 'doctors' : route.replaceAll('/', '-').replace(/^-/, '')
        screenshots.push(await page.screenshot(`${name}-${vp.name}.png`))
      }
      if (vp.width === 1280 && route === `/sessions/${SESSION_IDS.active}`) {
        screenshots.push(await page.screenshot('session-active-1280.png'))
      }
      if (vp.width === 375 && route === `/sessions/${SESSION_IDS.active}`) {
        screenshots.push(await page.screenshot('session-active-375.png'))
      }
      if (vp.width === 1280 && route === `/sessions/${SESSION_IDS.completed}`) {
        screenshots.push(await page.screenshot(`session-completed-1280.png`))
      }
      if (vp.width === 375 && route === `/sessions/${SESSION_IDS.completed}`) {
        screenshots.push(await page.screenshot(`session-completed-375.png`))
      }
    }
    check(`${vp.name}px blindness probe (4 routes)`, blindnessClean, blindnessDetail || 'no leaks')

    // ---- shell
    await page.goto('/history')
    const shell = await page.evaluate(shellProbe)
    check(`${vp.name}px aria-current on the active item`, !!shell.active, shell.active ?? 'none')
    check(`${vp.name}px display name shown`, !!shell.displayName, shell.displayName ?? '')

    if (vp.width >= 1024) {
      check(`${vp.name}px sidebar visible`, shell.sidebarVisible)
      check(`${vp.name}px menu button hidden on desktop`, !shell.menuButtonVisible)
    } else {
      check(`${vp.name}px menu button present`, shell.menuButtonVisible)
      const drawer = await page.evaluate(drawerProbe)
      check(`${vp.name}px drawer open/close/Escape/overlay/navigation`, drawer.opens
        && drawer.closesOnEscape && drawer.closesOnOverlay && drawer.closesOnNavigation, JSON.stringify(drawer))
    }

    // ---- admin pass (sidebar must gain the 2 admin items)
    await seedAuth(page, ADMIN)
    for (const route of ['/admin', '/admin/sessions', `/admin/sessions/${SESSION_IDS.evaluated}`]) {
      await page.goto(route)
      const overflow = await page.evaluate(overflowProbe)
      check(`${vp.name}px ${route} no horizontal overflow`, overflow.scrollWidth <= overflow.vw + 1,
        overflow.offenders.length ? `offenders: ${overflow.offenders.join(' | ')}` : `scrollWidth ${overflow.scrollWidth}/${overflow.vw}`)
      if (route === `/admin/sessions/${SESSION_IDS.evaluated}` && (vp.width === 1280 || vp.width === 375)) {
        screenshots.push(await page.screenshot(`admin-detail-${vp.name}.png`))
      }
      if (route === '/admin' && (vp.width === 1280 || vp.width === 375)) {
        screenshots.push(await page.screenshot(`admin-dashboard-${vp.name}.png`))
      }
      if (route === '/admin/sessions' && (vp.width === 1280 || vp.width === 375)) {
        screenshots.push(await page.screenshot(`admin-sessions-${vp.name}.png`))
      }
    }
    const adminShell = await page.evaluate(shellProbe)
    const adminItems = adminShell.navItems.filter((item) => item.includes('داشبورد') || item.includes('همه جلسات'))
    check(`${vp.name}px admin nav items for admin`, adminItems.length === 2, adminItems.join(' / ') || 'none')

    // back to the evaluator for the next viewport
    await seedAuth(page, DOCTOR)
  }

  /* ---------------- 1280 px deep checks ---------------- */
  console.log('\n=== 1280px deep checks ===')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })

  await signIn(page, DOCTOR)
  check('real login via the /login form (MSW)', true, 'redirected away from /login')

  await page.goto(`/sessions/${SESSION_IDS.active}`)
  const chat = await chatRoundTrip(page)
  check('chat round-trip: typing bubble, disabled input, reply', !chat.skipped && chat.typingShown && chat.replied, JSON.stringify(chat))

  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await page.goto(`/sessions/${SESSION_IDS.active}`)
  // send a message so the typing bubble (and its animated dots) is actually on screen
  await page.evaluate(/* js */ `(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    const composer = document.querySelector('textarea')
    setter.call(composer, 'آزمایش حرکت کاهش‌یافته')
    composer.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await page.evaluate(`document.querySelector('button[aria-label="ارسال"]').click()`)
  await waitFor(page, `!!document.querySelector('[data-testid="typing-indicator"] span')`, 'typing bubble under reduced motion')
  const reduced = await page.evaluate(/* js */ `(() => {
    const el = document.querySelector('[data-testid="typing-indicator"] span')
    const style = getComputedStyle(el)
    return { found: true, duration: style.animationDuration, iteration: style.animationIterationCount }
  })()`)
  check('prefers-reduced-motion disables the typing animation',
    parseFloat(reduced.duration) < 0.05 && reduced.iteration === '1', JSON.stringify(reduced))
  await page.send('Emulation.setEmulatedMedia', { features: [] })

  // §9.5: a trusted CDP Tab press is the only reliable way to trigger
  // :focus-visible (programmatic focus() never matches, so the probe must only
  // read). Input dispatch degrades in a long-lived session, so this check runs
  // in a fresh tab of the same profile (the auth survives in localStorage).
  const { targetId: ringTarget } = await browser.send('Target.createTarget', { url: `${base}/` })
  const { sessionId: ringSession } = await browser.send('Target.attachToTarget', { targetId: ringTarget, flatten: true })
  await browser.send('Page.enable', {}, ringSession)
  await waitFor(page, `!!document.querySelector('nav a, button, a')`, 'a focusable element')
  let ring = { ok: false }
  for (let attempt = 0; attempt < 8 && !(ring.ok && ring.matches === true && ring.outline === '2px solid'); attempt++) {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, ringSession)
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, ringSession)
    await sleep(300)
    const probe = await browser.send('Runtime.evaluate', { expression: focusRingProbe, returnByValue: true }, ringSession)
    ring = probe.result?.value ?? { ok: false }
  }
  check('focus-visible outline on keyboard focus (§9.5)',
    ring.ok && ring.matches === true && ring.outline === '2px solid', JSON.stringify(ring))
  await browser.send('Target.closeTarget', { targetId: ringTarget }).catch(() => {})

  // ---- full evaluation submit → reveal on the completed-unevaluated fixture
  await page.goto(`/sessions/${SESSION_IDS.completed}`)
  const submit = await submitEvaluation(page)
  if (submit.error) {
    check('evaluation submit', false, submit.error)
  } else {
    try {
      await waitFor(page, `!!document.querySelector('[data-testid="reveal"]')`, 'reveal after submit', 25_000)
      const reveal = await page.evaluate(revealProbe)
      check('evaluation submit → reveal appears', true, reveal.text ?? '')
      screenshots.push(await page.screenshot('session-revealed-1280.png'))
    } catch (error) {
      check('evaluation submit → reveal appears', false, String(error).slice(0, 120))
    }
  }

  /* ---------------- summary ---------------- */
  console.log(`\nscreenshots: ${screenshots.length} written to docs/reports/phase-2-screenshots/`)
  const uniqueErrors = [...new Set(consoleErrors.filter((line) => line && !line.includes('favicon')))]
  console.log(uniqueErrors.length ? `console errors:\n  ${uniqueErrors.slice(0, 8).join('\n  ')}` : 'console errors: none')

  await browser.send('Target.closeTarget', { targetId }).catch(() => {})
  child.kill()
  if (failures > 0) {
    console.error(`\n[qa-browser] FAIL — ${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('\n[qa-browser] OK — all checks passed')
  process.exit(0)
}

main().catch((error) => {
  console.error('[qa-browser] crashed:', error)
  process.exit(1)
})
