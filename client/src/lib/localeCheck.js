// Consistency checks for translation files. Pure functions: used by `npm run check:i18n` and by the test-suite.
const PH = /\{(\w+)\}/g
const placeholders = (s) => [...String(s).matchAll(PH)].map((m) => m[1]).sort().join(',')

/** Compare one language against English. Returns a list of human-readable problems (empty = fine). */
export function compareLocale(code, dict, en) {
  const problems = []
  for (const k of Object.keys(en)) {
    if (!(k in dict)) { problems.push(`${code}: missing "${k}"`); continue }
    if (typeof dict[k] !== 'string' || !dict[k].trim()) problems.push(`${code}: "${k}" is empty`)
    else if (placeholders(dict[k]) !== placeholders(en[k])) problems.push(`${code}: "${k}" placeholders differ (${placeholders(dict[k]) || 'none'} vs ${placeholders(en[k]) || 'none'})`)
    else if (dict[k] === en[k] && /[a-z]{4,}/i.test(en[k]) && !/^(app\.name)$/.test(k) && !k.startsWith('enum.')) problems.push(`${code}: "${k}" is identical to English (untranslated?)`)
  }
  for (const k of Object.keys(dict)) if (!(k in en)) problems.push(`${code}: unknown key "${k}"`)
  return problems
}

/** Find translation keys used in source text: t('a.b'), tr("a.b"), te... Template keys (t(`a.${x}`)) are returned as prefixes. */
export function usedKeys(source) {
  const exact = new Set(), prefixes = new Set()
  for (const m of source.matchAll(/\b(?:t|tr)\(\s*(['"])([a-zA-Z0-9_.]+)\1/g)) exact.add(m[2])
  for (const m of source.matchAll(/\b(?:t|tr)\(\s*`([a-zA-Z0-9_.]+)\$\{/g)) prefixes.add(m[1])
  return { exact, prefixes }
}
