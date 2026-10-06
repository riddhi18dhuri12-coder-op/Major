import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend } from '../../components/MapView'
import { Panel, Button, Field, Input, StatusBadge, Table, Loading, ErrorNote, Empty, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useTourist } from './TouristContext'

function IndependentTravel() {
    const toast = useToast()
    const t = useTourist()
    const cur = useLoad(() => api.get('/safety/independent-travel/current'))
    const [f, setF] = useState({ destination: '', expected_return: '' })

    async function start(e) {
        e.preventDefault()
        try {
            await api.post('/safety/independent-travel', { destination: f.destination, expected_return: new Date(f.expected_return).toISOString() })
            toast('Independent trip started. Your agency will be alerted if you are late.', 'green')
            setF({ destination: '', expected_return: '' }); cur.reload()
        } catch (err) { toast(err.message, 'red') }
    }
    async function end() {
        try { await api.put(`/safety/independent-travel/${cur.data.id}/end`); toast('Welcome back! Trip ended.', 'green'); cur.reload(); t.reload() } catch (err) { toast(err.message, 'red') }
    }

    if (cur.loading) return <Loading />
    const s = cur.data
    return (
        <Panel title="Independent travel" subtitle="Going off on your own? Tell us when you will be back and we will check on you if you are late.">
            {s ? (
                <div className="space-y-3 text-sm">
                    <p><span className="text-slate-400">Destination:</span> {s.destination || '—'}</p>
                    <p><span className="text-slate-400">Expected back:</span> {new Date(s.expected_return).toLocaleString()} <StatusBadge value={s.status} /></p>
                    {s.status === 'OVERDUE' && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">You are past your expected return time. Your agency has been alerted.</p>}
                    <Button onClick={end}>I'm back safely</Button>
                </div>
            ) : (
                <form onSubmit={start} className="space-y-4">
                    <Field label="Where are you going?"><Input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} placeholder="e.g. Lonavala Fort" /></Field>
                    <Field label="Expected return"><Input required type="datetime-local" value={f.expected_return} onChange={(e) => setF({ ...f, expected_return: e.target.value })} /></Field>
                    <Button type="submit">Start independent trip</Button>
                </form>
            )}
        </Panel>
    )
}

// Pick a start and end on the map; routes come from the public OSRM service, then our server scores them against the safety zones.
function SaferRoute({ zones }) {
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
            if (data.code !== 'Ok') throw new Error('No road route found between those points.')
            const routes = data.routes.slice(0, 3).map((x, i) => ({
                name: `Route ${String.fromCharCode(65 + i)}`, distance_km: +(x.distance / 1000).toFixed(1),
                points: x.geometry.coordinates.filter((_, k, arr) => k % Math.ceil(arr.length / 400) === 0).map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
            }))
            setResult(await api.post('/routes/assess', { routes }))
        } catch (e) { toast(e.message || 'Could not get routes right now.', 'red'); setPts([]) } finally { setBusy(false) }
    }

    return (
        <Panel title="Safer route check" subtitle="Click your start, then your destination. We compare the available roads against safety zones.">
            <MapView zones={zones} onMapClick={pick} fit={false} height="h-72"
                tourists={pts.map((p, i) => ({ id: `p${i}`, name: i === 0 ? 'Start' : 'Destination', tourist_code: '', last_location: p, risk: { level: i === 0 ? 'LOW' : 'MEDIUM' } }))} />
            <ZoneLegend />
            {busy && <Loading text="Checking routes…" />}
            {result && (
                <div className="mt-4 space-y-3">
                    <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">{result.explanation}</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {result.routes.map((r) => (
                            <div key={r.name} className={`rounded-lg border p-4 text-sm ${r.name === result.recommended ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}>
                                <div className="flex items-center justify-between"><b>{r.name}</b><StatusBadge value={r.risk_level} /></div>
                                <p className="mt-2 text-slate-400">{r.distance_km} km</p>
                                <ul className="mt-2 list-disc pl-4 text-xs text-slate-400">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                                {r.name === result.recommended && <p className="mt-2 text-xs font-semibold text-emerald-400">✓ Recommended</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Panel>
    )
}

const ROUTE_BADGE = {
    ON_ROUTE: ['border-emerald-500/30 bg-emerald-500/10 text-emerald-300', 'You are on your planned route'],
    WARNING: ['border-amber-500/30 bg-amber-500/10 text-amber-300', 'You are drifting from your planned route'],
    DEVIATION: ['border-red-500/30 bg-red-500/10 text-red-300', 'You are off your planned route. Your agency has been alerted'],
}

// The agency's planned route for my active trip, with my position and how far off it I am.
function PlannedRoute({ trips, zones }) {
    const t = useTourist()
    const active = (trips || []).find((x) => x.status === 'ACTIVE' && x.planned_route?.point_count >= 2)
    const detail = useLoad(() => (active ? api.get(`/trips/${active.id}`) : Promise.resolve(null)), [active?.id])
    if (!active) return null
    const route = detail.data?.planned_route
    const state = t.live?.route
    const badge = state && ROUTE_BADGE[state.level]
    return (
        <Panel title="Planned route" subtitle={`${active.name}: stay on the highlighted route. Your agency is alerted if you stray far from it.`}>
            {detail.loading ? <Loading /> : (
                <>
                    {badge && <p className={`mb-3 rounded-lg border p-3 text-sm ${badge[0]}`}>{badge[1]}{state.level !== 'ON_ROUTE' ? ` (${state.distance_m} m away)` : ''}.</p>}
                    <MapView zones={zones} height="h-72" me={t.position} lines={route?.points?.length ? [{ id: 'route', points: route.points, name: 'Planned route' }] : []} />
                    {!t.position && <p className="mt-3 text-xs text-slate-500">Turn on location sharing to see how you are doing against the route.</p>}
                </>
            )}
        </Panel>
    )
}

export default function Journey() {
    const trips = useLoad(() => api.get('/trips'))
    const zones = useLoad(() => api.get('/zones'))
    return (
        <>
            <DashboardHeader portal="Tourist Portal" title="My Journey" description="Your trips, independent travel and route safety." />
            <div className="mt-8 space-y-6">
                <Panel title="My trips">
                    {trips.loading ? <Loading /> : trips.error ? <ErrorNote message={trips.error} onRetry={trips.reload} /> : trips.data.length === 0 ? <Empty>Your agency has not added you to a trip yet.</Empty> : (
                        <Table rows={trips.data} columns={[
                            { title: 'Trip', key: 'name' },
                            { title: 'Dates', render: (t) => `${t.start_date || '—'} → ${t.end_date || '—'}` },
                            { title: 'Route', render: (t) => `${t.start_location || '—'} → ${t.end_location || '—'}` },
                            { title: 'Guide', render: (t) => t.guide_name || 'Unassigned' },
                            { title: 'Status', render: (t) => <StatusBadge value={t.status} /> },
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
