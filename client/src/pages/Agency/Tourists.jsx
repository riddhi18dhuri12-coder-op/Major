import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Table, StatusBadge, Button, Modal, Field, Input, Select, Loading, ErrorNote, label, timeAgo, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useAuth } from '../../lib/auth'

function AddTourist({ trips, onClose, onDone }) {
    const toast = useToast()
    const [f, setF] = useState({ trip_id: '', name: '', email: '', phone: '', tourist_type: 'DOMESTIC', nationality: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    const tripId = f.trip_id || trips[0]?.id || '' // default to the first trip even if the list finished loading after this opened
    const [created, setCreated] = useState(null)
    async function submit(e) {
        e.preventDefault()
        try {
            setCreated(await api.post(`/trips/${tripId}/tourists`, { name: f.name, email: f.email, phone: f.phone || undefined, tourist_type: f.tourist_type, nationality: f.nationality || undefined }))
            onDone()
        } catch (err) { toast(err.message, 'red') }
    }
    if (created) {
        return (
            <Modal title="Tourist added" onClose={onClose}>
                <p className="text-sm text-slate-300">Give these details to <b>{created.name}</b> so they can activate their account on the login page (“Tourist activation”):</p>
                <div className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm">
                    <p>Tourist ID: <b className="text-cyan-300">{created.tourist_code}</b></p>
                    <p className="mt-1">Email: <b>{created.email}</b></p>
                </div>
                <Button className="mt-5 w-full" onClick={onClose}>Done</Button>
            </Modal>
        )
    }
    return (
        <Modal title="Add tourist" onClose={onClose}>
            {trips.length === 0 ? <p className="text-sm text-slate-400">Create a trip first — tourists are added to a trip.</p> : (
                <form onSubmit={submit} className="space-y-4">
                    <Field label="Trip"><Select value={tripId} onChange={set('trip_id')}>{trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                    <Field label="Full name"><Input required value={f.name} onChange={set('name')} /></Field>
                    <Field label="Email"><Input required type="email" value={f.email} onChange={set('email')} /></Field>
                    <Field label="Phone (optional)"><Input value={f.phone} onChange={set('phone')} /></Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Type"><Select value={f.tourist_type} onChange={set('tourist_type')}><option value="DOMESTIC">Domestic</option><option value="FOREIGN">Foreign</option></Select></Field>
                        {f.tourist_type === 'FOREIGN' && <Field label="Nationality"><Input required value={f.nationality} onChange={set('nationality')} /></Field>}
                    </div>
                    <Button type="submit" className="w-full">Add tourist</Button>
                </form>
            )}
        </Modal>
    )
}

export default function Tourists() {
    const { user } = useAuth()
    const tourists = useLoad(() => api.get('/tourists'))
    const trips = useLoad(() => api.get('/trips'))
    const [adding, setAdding] = useState(false)
    const [q, setQ] = useState('')

    const rows = (tourists.data || []).filter((t) => `${t.name} ${t.tourist_code} ${t.email}`.toLowerCase().includes(q.toLowerCase()))
    return (
        <>
            <DashboardHeader portal="Travel Agency Portal" title="Tourists" description="Everyone registered through your agency." />
            <Panel className="mt-8" action={user.role === 'company' && <Button onClick={() => setAdding(true)}>Add Tourist</Button>}
                title={`${tourists.data?.length ?? 0} tourists`}>
                <Input placeholder="Search by name, ID or email…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
                {tourists.loading ? <Loading /> : tourists.error ? <ErrorNote message={tourists.error} onRetry={tourists.reload} /> : (
                    <Table rows={rows} columns={[
                        { title: 'Tourist', render: (t) => <span><b className="text-slate-200">{t.name}</b><br /><span className="text-xs text-slate-500">{t.tourist_code} · {t.email}</span></span> },
                        { title: 'Type', render: (t) => label(t.tourist_type) },
                        { title: 'Account', render: (t) => (t.activated ? <StatusBadge value="ACTIVE" /> : <StatusBadge value="PENDING" />) },
                        { title: 'Verification', render: (t) => <StatusBadge value={t.verification?.status || 'NOT_SUBMITTED'} /> },
                        { title: 'Risk', render: (t) => <StatusBadge value={t.risk?.level || 'LOW'} /> },
                        { title: 'Safety', render: (t) => <StatusBadge value={t.status} /> },
                        { title: 'Last seen', render: (t) => timeAgo(t.last_location?.recorded_at) },
                    ]} />
                )}
            </Panel>
            {adding && <AddTourist trips={trips.data || []} onClose={() => setAdding(false)} onDone={tourists.reload} />}
        </>
    )
}
