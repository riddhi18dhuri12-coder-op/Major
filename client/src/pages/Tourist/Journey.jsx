import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend } from '../../components/MapView'
import { Panel, Button, Field, Input, StatusBadge, Table, Loading, ErrorNote, Empty, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useTourist } from './TouristContext'
import { useI18n } from '../../lib/i18n'

function IndependentTravel() {
    const { t: tr, dateTime } = useI18n()
    const toast = useToast()
    const t = useTourist()
    const cur = useLoad(() => api.get('/safety/independent-travel/current'))
    const [f, setF] = useState({ destination: '', expected_return: '' })

    async function start(e) {
        e.preventDefault()
        try {
            await api.post('/safety/independent-travel', { destination: f.destination, expected_return: new Date(f.expected_return).toISOString() })
            toast(tr('j.started'), 'green')
            setF({ destination: '', expected_return: '' }); cur.reload()
        } catch (err) { toast(err.message, 'red') }
    }
    async function end() {
        try { await api.put(`/safety/independent-travel/${cur.data.id}/end`); toast(tr('j.ended'), 'green'); cur.reload(); t.reload() } catch (err) { toast(err.message, 'red') }
    }

    if (cur.loading) return <Loading />
    const s = cur.data
    return (
        <Panel title={tr('j.indep')} subtitle={tr('j.indepSub')}>
            {s ? (
                <div className="space-y-3 text-sm">
                    <p><span className="text-slate-400">{tr('j.destination')}</span> {s.destination || '—'}</p>
                    <p><span className="text-slate-400">{tr('j.expectedBack')}</span> {dateTime(s.expected_return)} <StatusBadge value={s.status} /></p>
                    {s.status === 'OVERDUE' && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{tr('j.overdueMsg')}</p>}
                    <Button onClick={end}>{tr('j.imBack')}</Button>
                </div>
            ) : (
                <form onSubmit={start} className="space-y-4">
                    <Field label={tr('j.where')}><Input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} placeholder={tr('j.wherePh')} /></Field>
                    <Field label={tr('j.expectedReturn')}><Input required type="datetime-local" value={f.expected_return} onChange={(e) => setF({ ...f, expected_return: e.target.value })} /></Field>
                    <Button type="submit">{tr('j.start')}</Button>
                </form>
            )}
        </Panel>
    )
}

// Pick a start and end on the map; routes come from the public OSRM service, then our server scores them against the safety zones.
function SaferRoute({ zones }) {
    const { t: tr } = useI18n()
    const toast = useToast()
    const [pts, setPts] = useState([])
    const [result, setResult] = useState(null)
    const [busy, setBusy] = useState(false)

    async function pick(p) {
        if (pts.length >= 2) { setPts([p]); setResult(null); return }
        const next = [...pts, p]
        setPts(next)
        if (next.length === 2) assess(next)
    }
    async function assess([a, b]) {
        setBusy(true); setResult(null)
        try {
            const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?alternatives=true&overview=full&geometries=geojson`)
            const data = await r.json()
            if (data.code !== 'Ok') throw new Error('NO_ROUTE')
            const routes = data.routes.slice(0, 3).map((x, i) => ({
                name: `Route ${String.fromCharCode(65 + i)}`, distance_km: +(x.distance / 1000).toFixed(1),
                points: x.geometry.coordinates.filter((_, k, arr) => k % Math.ceil(arr.length / 400) === 0).map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
            }))
            setResult(await api.post('/routes/assess', { routes }))
        } catch (e) { toast(e.message === 'NO_ROUTE' ? tr('j.routeFail') : e.message || tr('j.routeFail'), 'red'); setPts([]) } finally { setBusy(false) }
    }

    return (
        <Panel title={tr('j.safer')} subtitle={tr('j.saferSub')}>
            <MapView zones={zones} onMapClick={pick} fit={false} height="h-72"
                tourists={pts.map((p, i) => ({ id: `p${i}`, name: i === 0 ? tr('j.start1') : tr('j.dest'), tourist_code: '', last_location: p, risk: { level: i === 0 ? 'LOW' : 'MEDIUM' } }))} />
            <ZoneLegend />
            {busy && <Loading text={tr('j.checking')} />}
            {result && (
                <div className="mt-4 space-y-3">
                    <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">{result.explanation}</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {result.routes.map((r) => (
                            <div key={r.name} className={`rounded-lg border p-4 text-sm ${r.name === result.recommended ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}>
                                <div className="flex items-center justify-between"><b>{r.name}</b><StatusBadge value={r.risk_level} /></div>
                                <p className="mt-2 text-slate-400">{r.distance_km} km</p>
                                <ul className="mt-2 list-disc pl-4 text-xs text-slate-400">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                                {r.name === result.recommended && <p className="mt-2 text-xs font-semibold text-emerald-400">{tr('j.recommended')}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Panel>
    )
}

const ROUTE_BADGE = {
    ON_ROUTE: ['border-emerald-500/30 bg-emerald-500/10 text-emerald-300', 'j.onRoute'],
    WARNING: ['border-amber-500/30 bg-amber-500/10 text-amber-300', 'j.drifting'],
    DEVIATION: ['border-red-500/30 bg-red-500/10 text-red-300', 'j.offRoute'],
}

// The agency's planned route for my active trip, with my position and how far off it I am.
function PlannedRoute({ trips, zones }) {
    const t = useTourist()
    const { t: tr } = useI18n()
    const active = (trips || []).find((x) => x.status === 'ACTIVE' && x.planned_route?.point_count >= 2)
    const detail = useLoad(() => (active ? api.get(`/trips/${active.id}`) : Promise.resolve(null)), [active?.id])
    if (!active) return null
    const route = detail.data?.planned_route
    const state = t.live?.route
    const badge = state && ROUTE_BADGE[state.level]
    return (
        <Panel title={tr('j.planned')} subtitle={tr('j.plannedSub', { name: active.name })}>
            {detail.loading ? <Loading /> : (
                <>
                    {badge && <p className={`mb-3 rounded-lg border p-3 text-sm ${badge[0]}`}>{tr(badge[1])}{state.level !== 'ON_ROUTE' ? ` ${tr('j.awayBy', { n: state.distance_m })}` : ''}.</p>}
                    <MapView zones={zones} height="h-72" me={t.position} lines={route?.points?.length ? [{ id: 'route', points: route.points, name: tr('j.planned') }] : []} />
                    {!t.position && <p className="mt-3 text-xs text-slate-500">{tr('j.turnOnRoute')}</p>}
                </>
            )}
        </Panel>
    )
}

export default function Journey() {
    const { t: tr, te } = useI18n()
    const trips = useLoad(() => api.get('/trips'))
    const zones = useLoad(() => api.get('/zones'))
    return (
        <>
            <DashboardHeader portal={tr('portal.tourist')} title={tr('nav.journey')} description={tr('j.desc')} />
            <div className="mt-8 space-y-6">
                <Panel title={tr('j.trips')}>
                    {trips.loading ? <Loading /> : trips.error ? <ErrorNote message={trips.error} onRetry={trips.reload} /> : trips.data.length === 0 ? <Empty>{tr('j.noTrips')}</Empty> : (
                        <Table rows={trips.data} columns={[
                            { title: tr('j.col.trip'), key: 'name' },
                            { title: tr('j.col.dates'), render: (t) => `${t.start_date || '—'} → ${t.end_date || '—'}` },
                            { title: tr('j.col.route'), render: (t) => `${t.start_location || '—'} → ${t.end_location || '—'}` },
                            { title: tr('j.col.guide'), render: (t) => t.guide_name || tr('j.unassigned') },
                            { title: tr('common.statusLabel'), render: (t) => <StatusBadge value={t.status} /> },
                        ]} />
                    )}
                </Panel>
                <PlannedRoute trips={trips.data} zones={zones.data || []} />
                <IndependentTravel />
                <SaferRoute zones={zones.data || []} />
            </div>
        </>
    )
}
