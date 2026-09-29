#!/usr/bin/env node
/**
 * Phase-2 T1 — prove that a production build ships no MSW code.
 *
 * Usage:
 *   VITE_USE_MOCKS=false npm run build && node scripts/check-no-msw.mjs
 *
 * Scans every file under `dist/` (default) for a case-insensitive `msw` reference and exits
 * non-zero if one is found.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? 'dist'
const pattern = /msw/i

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files = files.concat(walk(full))
    else files.push(full)
  }
  return files
}

let files
try {
  files = walk(root)
} catch (error) {
  console.error(`[check-no-msw] cannot read ${root}: ${error.message}`)
  process.exit(2)
}

const offenders = files.filter((file) => {
  if (!/\.(js|mjs|cjs|css|html|json|map|txt|svg)$/i.test(file)) return false
  return pattern.test(readFileSync(file, 'utf8'))
})

if (offenders.length > 0) {
  console.error(`[check-no-msw] FAIL — ${offenders.length} file(s) mention "msw":`)
  for (const file of offenders) console.error(`  - ${file}`)
  process.exit(1)
}

console.log(`[check-no-msw] OK — scanned ${files.length} file(s) under ${root}`, {
  noMswReferences: true,
})
