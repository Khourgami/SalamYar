#!/usr/bin/env node
/**
 * WCAG 2.1 contrast check over the DESIGN_SYSTEM §1.1/§2 token pairs that the
 * components actually use (survey with:
 *   grep -rhoE '(text|bg)-(primary|accent|ink|line|surface|canvas|disabled|neutral|success|warning|danger|info)-?[a-z0-9]*' src --include='*.tsx'
 * ).
 *
 * Rules (DESIGN_SYSTEM.md §1.1 note and §9):
 *   - text pairs must be >= 4.5:1 (WCAG 1.4.3 AA) — this is the phase's hard criterion
 *   - placeholders (ink-400 per §1.1) are held to >= 3:1
 *   - icons / bars / borders in the -600 tokens are reported against 3:1 (WCAG 1.4.11)
 *     as WARNINGS, not failures: §1.1 prescribes exactly these token roles, and every
 *     such icon is redundant with an adjacent Persian label, so the combination never
 *     carries meaning by colour alone (see W-040 in docs/decisions.md)
 *   - disabled controls are exempt (WCAG 1.4.3 exception) but are reported
 *   - pure decoration (logo pulse, typing dots — aria-hidden, no meaning) is exempt
 *
 * The script also scans the ts/tsx sources for `text-` / `bg-` token classes
 * and fails if a used token is missing from the pair table below, so the table
 * cannot silently go stale when components change.
 *
 * Usage: node scripts/check-contrast.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

/* ------------------------------------------------------------------ */
/* Token hex values — must mirror src/index.css (DESIGN_SYSTEM §2).    */
/* ------------------------------------------------------------------ */
const TOKENS = {
  'primary-900': '#123B66',
  'primary-700': '#1B55A6',
  'primary-600': '#246BCE',
  'primary-100': '#EAF3FF',
  'accent-500': '#4DB7D8',
  'ink-900': '#152536',
  'ink-700': '#334155',
  'ink-500': '#5F6F82',
  'ink-400': '#6B7C93',
  line: '#D9E3EE',
  surface: '#FFFFFF',
  canvas: '#F7FAFC',
  'disabled-bg': '#E8EEF5',
  'disabled-text': '#8A98A8',
  'neutral-700': '#475569',
  'neutral-100': '#F1F5F9',
  'success-700': '#13704A',
  'success-600': '#1F9D67',
  'success-100': '#EAF8F1',
  'warning-700': '#8A5A0B',
  'warning-600': '#C98A1A',
  'warning-100': '#FFF7E6',
  'danger-700': '#B42318',
  'danger-600': '#D64545',
  'danger-100': '#FFF0F0',
  'info-600': '#3478C7',
  'info-100': '#EEF6FF',
  white: '#FFFFFF',
}

/* ------------------------------------------------------------------ */
/* The pairs actually used by the components.                          */
/* kind: 'text' (>=4.5, hard failure) | 'placeholder' (>=3, hard failure)
 *       | 'icon' (>=3, warning — see the header note)
 *       | 'decor' (exempt: aria-hidden, carries no meaning)
 *       | 'disabled' (WCAG 1.4.3 exception, reported only)            */
/* ------------------------------------------------------------------ */
const PAIRS = [
  // Core text on the two page backgrounds and on cards
  ['ink-900', 'surface', 'text'],
  ['ink-900', 'canvas', 'text'],
  ['ink-900', 'primary-100', 'text'],
  ['ink-900', 'neutral-100', 'text'],
  ['ink-900', 'success-100', 'text'],
  ['ink-900', 'warning-100', 'text'],
  ['ink-900', 'danger-100', 'text'],
  ['ink-900', 'info-100', 'text'],
  ['ink-700', 'surface', 'text'],
  ['ink-700', 'canvas', 'text'],
  ['ink-700', 'primary-100', 'text'],
  ['ink-700', 'neutral-100', 'text'],
  ['ink-700', 'info-100', 'text'],
  ['ink-500', 'surface', 'text'],
  ['ink-500', 'canvas', 'text'],
  ['ink-500', 'primary-100', 'text'],
  ['ink-500', 'neutral-100', 'text'],
  ['ink-500', 'success-100', 'text'],
  ['ink-500', 'warning-100', 'text'],
  ['ink-500', 'danger-100', 'text'],
  ['ink-500', 'info-100', 'text'],
  // Placeholders and input icons (§1.1: ink-400 is the placeholder token)
  ['ink-400', 'surface', 'placeholder'],
  ['ink-400', 'canvas', 'placeholder'],
  ['ink-400', 'disabled-bg', 'placeholder'],
  // Primary family
  ['primary-900', 'surface', 'text'],
  ['primary-900', 'canvas', 'text'],
  ['primary-900', 'primary-100', 'text'],
  ['primary-700', 'surface', 'text'],
  ['primary-700', 'canvas', 'text'],
  ['primary-700', 'primary-100', 'text'],
  ['primary-700', 'warning-100', 'text'],
  ['primary-700', 'info-100', 'text'],
  ['primary-600', 'surface', 'icon'],
  ['primary-600', 'canvas', 'icon'],
  ['primary-600', 'primary-100', 'icon'],
  // §1.2 badge text (the -700 "strong" tokens on their soft backgrounds)
  ['danger-700', 'surface', 'text'],
  ['danger-700', 'canvas', 'text'],
  ['danger-700', 'danger-100', 'text'],
  ['danger-700', 'neutral-100', 'text'],
  ['warning-700', 'surface', 'text'],
  ['warning-700', 'canvas', 'text'],
  ['warning-700', 'warning-100', 'text'],
  ['success-700', 'surface', 'text'],
  ['success-700', 'success-100', 'text'],
  ['neutral-700', 'surface', 'text'],
  ['neutral-700', 'canvas', 'text'],
  ['neutral-700', 'neutral-100', 'text'],
  // §1.1: -600 for icons/bars/borders only (never small text on soft backgrounds)
  ['danger-600', 'surface', 'icon'],
  ['danger-600', 'danger-100', 'icon'],
  ['warning-600', 'surface', 'icon'],
  ['warning-600', 'warning-100', 'icon'],
  ['success-600', 'surface', 'icon'],
  ['success-600', 'success-100', 'icon'],
  ['info-600', 'surface', 'icon'],
  ['info-600', 'info-100', 'icon'],
  // Probability bar fill on its neutral track (§6.4)
  ['danger-600', 'neutral-100', 'icon'],
  ['warning-600', 'neutral-100', 'icon'],
  ['primary-600', 'neutral-100', 'icon'],
  // Buttons, sidebar, toast, checked rating box (solid white on colour)
  ['white', 'primary-600', 'text'],
  ['white', 'primary-900', 'text'],
  ['white', 'danger-700', 'text'],
  // Sidebar idle text / banner icon (alpha over the base colour)
  ['white/0.78', 'primary-900', 'text'],
  ['white/0.70', 'primary-900', 'icon'],
  ['white/0.70', 'danger-700', 'icon'],
  // Disabled controls (WCAG 1.4.3 exception; §5.1 prescribes exactly this pair)
  ['disabled-text', 'disabled-bg', 'disabled'],
  ['disabled-text', 'surface', 'disabled'],
  // Typing-dots decoration and accent (logo pulse) — aria-hidden, no meaning
  ['ink-400', 'neutral-100', 'decor'],
  ['accent-500', 'surface', 'decor'],
  ['accent-500', 'primary-900', 'decor'],
]

/* ------------------------------------------------------------------ */
/* WCAG 2.1 relative luminance and contrast ratio                      */
/* ------------------------------------------------------------------ */
function hexToRgb(hex) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
}

function channel(channelValue) {
  const c = channelValue / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Blends an `rgb(r,g,b,a)` colour over an opaque hex background. */
function blendOver(fgHex, alpha, bgHex) {
  const fg = hexToRgb(fgHex)
  const bg = hexToRgb(bgHex)
  const out = fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)))
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function ratio(fgHex, bgHex) {
  const l1 = luminance(fgHex)
  const l2 = luminance(bgHex)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/* ------------------------------------------------------------------ */
/* Check every declared pair                                           */
/* ------------------------------------------------------------------ */
const THRESHOLD = { text: 4.5, placeholder: 3, icon: 3 }

let failures = 0
let warnings = 0
const rows = []

for (const [fgName, bgName, kind] of PAIRS) {
  // Alpha foregrounds ("white/0.78") resolve to their base token.
  const baseFgName = fgName.split('/')[0]
  const fgHex = TOKENS[baseFgName]
  const bgHex = TOKENS[bgName]
  if (!fgHex || !bgHex) {
    console.error(`[check-contrast] unknown token in pair table: ${baseFgName} / ${bgName}`)
    failures += 1
    continue
  }

  // Alpha foregrounds ("white/0.78") blend over the background first.
  const alphaMatch = fgName.match(/^white\/(0\.\d+)$/)
  const effectiveFg = alphaMatch ? blendOver('#FFFFFF', Number(alphaMatch[1]), bgHex) : fgHex

  const value = ratio(effectiveFg, bgHex)
  const isExempt = kind === 'disabled' || kind === 'decor'
  const threshold = THRESHOLD[kind] ?? 4.5
  const pass = value >= threshold
  if (!pass && !isExempt && kind !== 'icon') failures += 1
  if (!pass && kind === 'icon') warnings += 1
  rows.push({ fgName, bgName, kind, value, pass, isExempt, threshold })
}

/* ------------------------------------------------------------------ */
/* Scan src/ for token classes so the pair table cannot go stale       */
/* ------------------------------------------------------------------ */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.(ts|tsx)$/.test(entry)) yield path
  }
}

const usedFg = new Set()
const usedBg = new Set()
for (const file of walk(SRC)) {
  const content = readFileSync(file, 'utf8')
  const isTest = /\.test\./.test(file)
  if (isTest) continue
  for (const match of content.matchAll(/text-([a-z0-9-]+)/g)) usedFg.add(match[1])
  for (const match of content.matchAll(/bg-([a-z0-9-]+)/g)) usedBg.add(match[1])
}
const tableTokens = new Set()
for (const [fg, bg] of PAIRS) {
  tableTokens.add(fg.split('/')[0])
  tableTokens.add(bg)
}
for (const token of usedFg) {
  if (TOKENS[token] && !tableTokens.has(token)) {
    console.error(`[check-contrast] text-${token} is used in src/ but has no pair in the table`)
    failures += 1
  }
}
for (const token of usedBg) {
  if (TOKENS[token] && !tableTokens.has(token)) {
    console.error(`[check-contrast] bg-${token} is used in src/ but has no pair in the table`)
    failures += 1
  }
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */
console.log('WCAG contrast over the DESIGN_SYSTEM §1.1 token pairs in use\n')
console.log('foreground            background      kind          ratio   required  result')
console.log('-'.repeat(84))
for (const row of rows.sort((a, b) => a.value - b.value)) {
  const result = row.isExempt
    ? 'EXEMPT'
    : row.pass
      ? 'PASS'
      : row.kind === 'icon'
        ? 'WARN'
        : 'FAIL'
  console.log(
    row.fgName.padEnd(20)
      + row.bgName.padEnd(16)
      + row.kind.padEnd(14)
      + `${row.value.toFixed(2)}:1`.padEnd(8)
      + (row.isExempt ? 'n/a'.padEnd(10) : `${row.threshold}:1`.padEnd(10))
      + result,
  )
}
console.log('-'.repeat(84))
console.log(
  `${rows.length} pairs checked: `
    + `${rows.filter((r) => r.pass).length} pass, `
    + `${warnings} icon warning(s) (redundant with adjacent text — see the header note), `
    + `${rows.filter((r) => r.isExempt).length} exempt (disabled controls, decoration), `
    + `${failures} failure(s)`,
)

if (failures > 0) {
  console.error('\n[check-contrast] FAIL — text pairs below 4.5:1 (or icon pairs below 3:1)')
  process.exit(1)
}
console.log('\n[check-contrast] OK — every text pair is at least 4.5:1')
