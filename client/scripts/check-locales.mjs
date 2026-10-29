// npm run check:i18n  — every language must define exactly the English keys with the same {placeholders},
// and every key used in the source must exist in English.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import en from '../src/locales/en.js'
import { compareLocale, usedKeys } from '../src/lib/localeCheck.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src')
const problems = []

const files = fs.readdirSync(path.join(root, 'locales')).filter((f) => f.endsWith('.js') && f !== 'en.js')
for (const f of files) problems.push(...compareLocale(f.replace('.js', ''), (await import(pathToFileURL(path.join(root, 'locales', f)))).default, en))

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'test' ? [] : walk(path.join(d, e.name))) : /\.(jsx?|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []))
const keys = Object.keys(en)
for (const file of walk(root)) {
  if (file.includes('/locales/') || file.endsWith('localeCheck.js')) continue
  const { exact, prefixes } = usedKeys(fs.readFileSync(file, 'utf8'))
  for (const k of exact) if (!(k in en)) problems.push(`${path.relative(root, file)}: uses unknown key "${k}"`)
  for (const p of prefixes) if (!keys.some((k) => k.startsWith(p))) problems.push(`${path.relative(root, file)}: no keys start with "${p}"`)
}

console.log(`${files.length} languages + English, ${keys.length} keys each.`)
if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} problem(s)`); process.exit(1) }
console.log('All translation files are consistent.')
