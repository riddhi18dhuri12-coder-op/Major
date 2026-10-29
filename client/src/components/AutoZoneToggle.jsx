import { useI18n } from '../lib/i18n'

/** Switch + summary for the automatic zones layer. */
export default function AutoZoneToggle({ on, onChange, auto }) {
  const { t, te } = useI18n()
  const counts = {}
  for (const z of auto.zones) counts[z.type] = (counts[z.type] || 0) + 1
  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
      <div className="flex items-start gap-3">
        <button type="button" role="switch" aria-checked={on} aria-label={t('zones.auto')} onClick={() => onChange(!on)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${on ? 'border-cyan-500 bg-cyan-500' : 'border-slate-600 bg-slate-700'}`}>
          <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
        <div>
          <p className="font-medium text-slate-200">{t('zones.auto')}</p>
          <p className="text-xs leading-5 text-slate-400">{t('zones.autoSub')}</p>
          {on && auto.zones.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
              <span>{t('zones.autoCount', { n: auto.zones.length })}:</span>
              {Object.entries(counts).map(([k, n]) => <span key={k} className="rounded-full border border-slate-700 px-2 py-0.5">{te(k)} · {n}</span>)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
