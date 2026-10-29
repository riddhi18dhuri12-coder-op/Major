import en from '../locales/en.js'
import { translateServerMessage } from './serverMessages.js'

export const humanize = (v) => String(v).replace(/_/g, ' ').toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase())

/** Build the helpers for one language. `dict` falls back to English for any key it does not define. */
export function makeI18n(lang, dict) {
  const raw = (key) => dict[key] ?? en[key] ?? key
  const t = (key, vars) => {
    const s = raw(key)
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s
  }
  const te = (value) => (value == null || value === '' ? '-' : dict[`enum.${value}`] ?? en[`enum.${value}`] ?? humanize(value))
  const locale = lang === 'en' ? undefined : `${lang}-IN`
  return {
    lang, t, te,
    tm: (msg) => translateServerMessage(msg, t, te), // translate a message the server sent in English
    ago: (d) => {
      if (!d) return '-'
      const s = Math.max(0, (Date.now() - new Date(d)) / 1000)
      if (s < 60) return t('time.now')
      if (s < 3600) return t('time.min', { n: Math.floor(s / 60) })
      if (s < 86400) return t('time.hour', { n: Math.floor(s / 3600) })
      return new Date(d).toLocaleDateString(locale)
    },
    date: (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (d ? new Date(d).toLocaleDateString(locale, opts) : null),
    dateTime: (d) => (d ? new Date(d).toLocaleString(locale) : '-'),
  }
}
