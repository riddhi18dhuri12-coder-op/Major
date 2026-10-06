import { useState } from 'react'
import MapView from './MapView'
import { Panel, Button, Field, Input, Loading, useToast } from './ui'
import { api } from '../lib/api'
import { useLoad } from '../hooks/useLoad'

const MAX_POINTS = 800

/** Keep the shape of a long road geometry but cap the number of points we store. */
function thin(points) {
  if (points.length <= MAX_POINTS) return points
  const step = Math.ceil(points.length / MAX_POINTS)
  const out = points.filter((_, i) => i % step === 0)
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1])
  return out
}

// Road route from the public OSRM service (the same one the tourist "safer route" check uses).
async function roadRoute(a, b) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=full&geometries=geojson`, { signal: ctl.signal })
    const data = await r.json()
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('no route')
    const x = data.routes[0]
    return { points: thin(x.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))), distance_km: +(x.distance / 1000).toFixed(1), source: 'OSRM' }
  } finally { clearTimeout(timer) }
}

/**
 * Planned route for a trip. Click a start and a destination on the map; the road route is fetched and drawn.
 * While the trip is ACTIVE, tourists who stray from this line trigger warnings and a route-deviation incident.
 */
export default function RouteEditor({ trip, readOnly = false, onChanged }) {
  const toast = useToast()
  const zones = useLoad(() => api.get('/zones').catch(() => []))
  const saved = trip.planned_route?.points?.length >= 2 ? trip.planned_route : null
  const [picks, setPicks] = useState([])
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState(trip.deviation?.warn_m ?? 200)
  const [alertM, setAlertM] = useState(trip.deviation?.alert_m ?? 500)

  async function pick(p) {
    if (readOnly || busy) return
    if (picks.length >= 2) { setPicks([p]); setDraft(null); return }
    const next = [...picks, p]
    setPicks(next)
    if (next.length < 2) return
    setBusy(true)
    try {
      setDraft(await roadRoute(next[0], next[1]))
    } catch {
      // routing service unreachable: fall back to a straight line so the agency can still set a route
      setDraft({ points: next, source: 'STRAIGHT' })
      toast('Could not get the road route, so a straight line was used. Add more points or retry later for a road route.', 'amber')
    } finally { setBusy(false) }
  }

  async function save() {
    if (!draft) return
    try {
      await api.put(`/trips/${trip.id}/route`, { points: draft.points, distance_km: draft.distance_km, source: draft.source, warn_m: Number(warn), alert_m: Number(alertM) })
      toast('Planned route saved. Route monitoring is on while the trip is ACTIVE.', 'green')
      setPicks([]); setDraft(null); onChanged?.()
    } catch (e) { toast(e.message, 'red') }
  }
  async function clear() {
    try { await api.del(`/trips/${trip.id}/route`); toast('Planned route removed.', 'amber'); onChanged?.() } catch (e) { toast(e.message, 'red') }
  }

  const lines = [
    ...(saved ? [{ id: 'saved', points: saved.points, color: draft ? '#64748b' : '#22d3ee', dashed: !!draft, name: 'Current planned route' }] : []),
    ...(draft ? [{ id: 'draft', points: draft.points, color: '#10b981', name: 'New route (not saved yet)' }] : []),
  ]
  const markers = picks.map((p, i) => ({ id: `pick${i}`, ...p, emoji: i === 0 ? '🟢' : '🏁', label: i === 0 ? 'Start' : 'Destination' }))
  const invalid = !(Number(warn) >= 50 && Number(alertM) > Number(warn))

  return (
    <Panel
      className="mt-6"
      title="Planned route"
      subtitle={readOnly ? 'Tourists who stray from this route while the trip is active are flagged.' : 'Click the start, then the destination. While the trip is ACTIVE, tourists who stray from this route get a warning and the agency and authority are alerted.'}
      action={saved && !readOnly && <Button variant="ghost" onClick={clear}>Remove route</Button>}
    >
      <MapView zones={zones.data || []} lines={lines} markers={markers} onMapClick={readOnly ? undefined : pick} height="h-80" />
      {busy && <Loading text="Finding the road route…" />}
      <p className="mt-3 text-xs text-slate-500">
        {saved ? `Current route: ${saved.distance_km ? `${saved.distance_km} km, ` : ''}${saved.point_count} points (${(saved.source || 'MANUAL').toLowerCase()}). Warning at ${trip.deviation?.warn_m ?? 200} m, deviation alert at ${trip.deviation?.alert_m ?? 500} m.` : 'No planned route yet, so route deviation is not monitored for this trip.'}
      </p>
      {!readOnly && draft && (
        <div className="mt-4 grid items-end gap-4 sm:grid-cols-3">
          <Field label="Warn tourist at (metres off route)"><Input type="number" min="50" max="5000" value={warn} onChange={(e) => setWarn(e.target.value)} /></Field>
          <Field label="Alert agency at (metres off route)" hint="Must be larger than the warning distance."><Input type="number" min="100" max="10000" value={alertM} onChange={(e) => setAlertM(e.target.value)} /></Field>
          <Button onClick={save} disabled={invalid}>Save planned route{draft.distance_km ? ` (${draft.distance_km} km)` : ''}</Button>
        </div>
      )}
    </Panel>
  )
}
