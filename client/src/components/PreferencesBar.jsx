import { useI18n } from '../lib/i18n'
import { useTextSize } from '../lib/textSize'
import { useTheme } from '../lib/theme'

const btn = 'rounded-md border border-slate-700 px-2.5 py-1.5 font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40'

/** Language picker + text size controls (A− / 100% / A+). Remembered between visits. */
export default function PreferencesBar({ className = '' }) {
  const { t, lang, setLang, languages } = useI18n()
  const size = useTextSize()
  const { theme, toggle } = useTheme()
  const label = t(theme === 'light' ? 'pref.toDark' : 'pref.toLight')
  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${className}`}>
      <select aria-label={t('pref.language')} value={lang} onChange={(e) => setLang(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400">
        {languages.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
      </select>
      <div role="group" aria-label={t('pref.textSize')} className="flex items-center gap-1">
        <button type="button" className={`${btn} text-xs`} aria-label={t('pref.smaller')} title={t('pref.smaller')} disabled={!size.canSmaller} onClick={size.smaller}>A−</button>
        <button type="button" className={`${btn} min-w-[3.25rem] text-xs`} aria-label={t('pref.reset')} title={t('pref.reset')} onClick={size.reset}>{size.percent}%</button>
        <button type="button" className={`${btn} text-base leading-none`} aria-label={t('pref.larger')} title={t('pref.larger')} disabled={!size.canBigger} onClick={size.bigger}>A+</button>
      </div>
      <button type="button" className={`${btn} text-base leading-none`} aria-label={label} title={label} onClick={toggle}>{theme === 'light' ? '🌙' : '☀️'}</button>
    </div>
  )
}
