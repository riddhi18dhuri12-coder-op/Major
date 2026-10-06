import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Table, Button, Modal, Field, Input, Select, StatusBadge, Loading, ErrorNote, label, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useAuth } from '../../lib/auth'
import RouteEditor from '../../components/RouteEditor'

function NewTrip({ guides, onClose, onDone }) {
    const toast = useToast()
    const [f, setF] = useState({ name: '', start_date: '', end_date: '', start_location: '', end_location: '', guide_id: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    async function submit(e) {
        e.preventDefault()
        try { await api.post('/trips', { ...f, guide_id: f.guide_id || null }); toast('Trip created', 'green'); onDone(); onClose() } catch (err) { toast(err.message, 'red') }
    }
    return (
        <Modal title="New trip" onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <Field label="Trip name"><Input required value={f.name} onChange={set('name')} placeholder="Maharashtra Explorer" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Start date"><Input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
                    <Field label="End date"><Input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
                    <Field label="Start location"><Input value={f.start_location} onChange={set('start_location')} /></Field>
                    <Field label="End location"><Input value={f.end_location} onChange={set('end_location')} /></Field>
                </div>
                <Field label="Guide"><Select value={f.guide_id} onChange={set('guide_id')}><option value="">Unassigned</option>{guides.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
                <Button type="submit" className="w-full">Create trip</Button>
            </form>
        </Modal>
    )
}

export function TripList() {
    const { user } = useAuth()
    const trips = useLoad(() => api.get('/trips'))
    const guides = useLoad(() => (user.role === 'company' ? api.get('/guides') : Promise.resolve([])))
    const [creating, setCreating] = useState(false)
    const navigate = useNavigate()
    return (
        <>
            <DashboardHeader portal="Travel Agency Portal" title="Trips" description={user.role === 'guide' ? 'Trips assigned to you.' : 'Plan trips, assign guides and add tourists.'} />
            <Panel className="mt-8" title={`${trips.data?.length ?? 0} trips`} action={user.role === 'company' && <Button onClick={() => setCreating(true)}>New Trip</Button>}>
                {trips.loading ? <Loading /> : trips.error ? <ErrorNote message={trips.error} onRetry={trips.reload} /> : (
                    <Table rows={trips.data} empty="No trips yet." onRowClick={(t) => navigate(`/agency/trips/${t.id}`)} columns={[
                        { title: 'Trip', render: (t) => <b className="text-slate-200">{t.name}</b> },
                        { title: 'Dates', render: (t) => `${t.start_date || '—'} → ${t.end_date || '—'}` },
                        { title: 'Route', render: (t) => <span>{`${t.start_location || '—'} → ${t.end_location || '—'}`}{t.planned_route?.point_count >= 2 && <span className="ml-2 text-xs text-emerald-400" title="A planned route is set; deviations are monitored">🧭 monitored</span>}</span> },
                        { title: 'Tourists', key: 'tourist_count' },
                        { title: 'Guide', render: (t) => t.guide_name || 'Unassigned' },
                        { title: 'Status', render: (t) => <StatusBadge value={t.status} /> },
                    ]} />
                )}
            </Panel>
            {creating && <NewTrip guides={guides.data || []} onClose={() => setCreating(false)} onDone={trips.reload} />}
        </>
    )
}

export function TripDetail() {
    const { id } = useParams()
    const { user } = useAuth()
    const toast = useToast()
    const trip = useLoad(() => api.get(`/trips/${id}`), [id])
    const guides = useLoad(() => (user.role === 'company' ? api.get('/guides') : Promise.resolve([])))
    const [status, setStatus] = useState(null)
    const [guide, setGuide] = useState(null)

    if (trip.loading) return <Loading />
    if (trip.error) return <ErrorNote message={trip.error} onRetry={trip.reload} />
    const t = trip.data
    const curStatus = status ?? t.status
    const curGuide = guide ?? (t.guide_id || '')

    async function save() {
        try { await api.put(`/trips/${id}`, { status: curStatus, guide_id: curGuide || null }); toast('Trip updated', 'green'); setStatus(null); setGuide(null); trip.reload() } catch (e) { toast(e.message, 'red') }
    }
    async function removeTourist(touristId) {
        try { await api.del(`/trips/${id}/tourists/${touristId}`); trip.reload() } catch (e) { toast(e.message, 'red') }
    }

    return (
        <>
            <Link to="/agency/trips" className="text-sm text-cyan-400 hover:text-cyan-300">← All trips</Link>
            <div className="mt-3"><DashboardHeader portal="Travel Agency Portal" title={t.name} description={`${t.start_location || '—'} → ${t.end_location || '—'} · ${t.start_date || '—'} to ${t.end_date || '—'}`} /></div>

            {user.role === 'company' && (
                <Panel className="mt-8" title="Trip settings" subtitle="Setting a trip ACTIVE starts safety monitoring (check-in reminders, stale-location alerts) for its tourists.">
                    <div className="grid items-end gap-4 sm:grid-cols-3">
                        <Field label="Status"><Select value={curStatus} onChange={(e) => setStatus(e.target.value)}>{['UPCOMING', 'ACTIVE', 'COMPLETED'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
                        <Field label="Guide"><Select value={curGuide} onChange={(e) => setGuide(e.target.value)}><option value="">Unassigned</option>{(guides.data || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
                        <Button onClick={save} disabled={status === null && guide === null}>Save changes</Button>
                    </div>
                </Panel>
            )}

            {(user.role === 'company' || t.planned_route?.point_count >= 2) && <RouteEditor key={t.planned_route?.set_at || 'none'} trip={t} readOnly={user.role !== 'company'} onChanged={trip.reload} />}

            <Panel className="mt-6" title={`Tourists on this trip (${t.tourists.length})`}>
                <Table rows={t.tourists} empty="No tourists yet. Add them from the Tourists page." columns={[
                    { title: 'Tourist', render: (x) => <span><b className="text-slate-200">{x.name}</b><br /><span className="text-xs text-slate-500">{x.tourist_code}</span></span> },
                    { title: 'Verification', render: (x) => <StatusBadge value={x.verification?.status || 'NOT_SUBMITTED'} /> },
                    { title: 'Risk', render: (x) => <StatusBadge value={x.risk?.level || 'LOW'} /> },
                    { title: 'Status', render: (x) => <StatusBadge value={x.status} /> },
                    ...(user.role === 'company' ? [{ title: '', render: (x) => <Button variant="ghost" onClick={() => removeTourist(x.id)}>Remove</Button> }] : []),
                ]} />
            </Panel>
        </>
    )
}
