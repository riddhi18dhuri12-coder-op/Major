import MapView, { ServiceLegend } from './MapView'
import { Panel, Loading } from './ui'
import { useI18n } from '../lib/i18n'
import { directionsUrl } from '../lib/nearby'

const KINDS = ['hospital', 'police']
const km = (m) => (m / 1000).toFixed(1)

/** Marks the nearest hospital and police station so the maps can highlight them. */
// eslint-disable-next-line react-refresh/only-export-components
export function markNearest(services) {
  const first = {}
  return services.map((s) => (first[s.kind] ? s : (first[s.kind] = true, { ...s, nearest: true })))
}

/** Nearby hospitals (red cross) and police stations (blue shield), with distance and directions. */
export default function NearbyHelp({ position, nearby, zones = [], showMap = true }) {
  const { t } = useI18n()
  const services = markNearest(nearby.services)
  return (
    <Panel title={t('near.title')} subtitle={t('near.sub')}>
      {!position ? <p className="text-sm text-slate-500">{t('near.needGps')}</p> : nearby.loading && !services.length ? <Loading /> : nearby.error && !services.length ? <p className="text-sm text-amber-400">{t('near.fail')}</p> : (
        <>
          {showMap && <><MapView zones={zones} me={position} services={services} height="h-72" /><ServiceLegend /></>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {KINDS.map((k) => {
              const list = services.filter((s) => s.kind === k).slice(0, 3)
              return (
                <div key={k}>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                    {k === 'hospital'
                      ? <i className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-red-600 bg-[#fff] text-xs font-black leading-none text-red-600">+</i>
                      : <i className="inline-block h-5 w-5 rounded-full border-2 border-blue-900 bg-blue-700" />}
                    {t(`near.${k}`)}
                  </p>
                  {list.length === 0 && <p className="text-sm text-slate-500">{t('near.none')}</p>}
                  <div className="space-y-2">
                    {list.map((s, i) => (
                      <a key={s.id} href={directionsUrl(s)} target="_blank" rel="noreferrer" aria-label={`${t('near.directions')}: ${s.name || t(`near.${k}`)}`}
                        className={`block rounded-lg border bg-slate-950 p-3 text-sm transition hover:border-cyan-500 ${i === 0 ? 'border-yellow-400/70' : 'border-slate-800'}`}>
                        <span className="font-medium text-slate-200">{s.name || t(`near.${k}`)}</span>
                        <span className="mt-0.5 flex justify-between text-xs text-slate-400"><span>{t('near.away', { d: km(s.distance_m) })}</span><span className="text-cyan-400">{t('near.directions')} →</span></span>
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}
