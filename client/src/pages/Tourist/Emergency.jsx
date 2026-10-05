import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Button, Field, Input, Select, Textarea, StatusBadge, Table, Modal, Loading, ErrorNote, Empty, label, timeAgo, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'
import { useTourist } from './TouristContext'
import { SosButton } from './TouristDashboard'

const TYPES = ['MEDICAL', 'ACCIDENT', 'LOST', 'THEFT', 'HARASSMENT', 'UNSAFE', 'TRANSPORT', 'OTHER']

function ReportForm({ onDone }) {
    const t = useTourist()
    const toast = useToast()
    const [f, setF] = useState({ type: 'MEDICAL', severity: 'MEDIUM', description: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    async function submit(e) {
        e.preventDefault()
        try {
            await api.post('/incidents', { ...f, description: f.description || undefined, ...(t.position && { latitude: t.position.latitude, longitude: t.position.longitude }) })
            toast('Report sent to your agency and the authorities.', 'green')
            setF({ type: 'MEDICAL', severity: 'MEDIUM', description: '' }); onDone()
        } catch (err) { toast(err.message, 'red') }
    }
    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="What happened?"><Select value={f.type} onChange={set('type')}>{TYPES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
                <Field label="How serious?"><Select value={f.severity} onChange={set('severity')}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
            </div>
            <Field label="Details" hint={t.position ? 'Your current location will be attached.' : 'Turn on location sharing to attach where you are.'}>
                <Textarea value={f.description} onChange={set('description')} maxLength={2000} placeholder="Describe the situation…" />
            </Field>
            <Button type="submit">Send report</Button>
        </form>
    )
}

function Contacts() {
    const toast = useToast()
    const c = useLoad(() => api.get('/me/contacts'))
    const [f, setF] = useState({ name: '', relationship: '', phone: '' })
    async function add(e) {
        e.preventDefault()
        try { await api.post('/me/contacts', { name: f.name, relationship: f.relationship || undefined, phone: f.phone }); setF({ name: '', relationship: '', phone: '' }); c.reload() } catch (err) { toast(err.message, 'red') }
    }
    async function remove(id) { try { await api.del(`/me/contacts/${id}`); c.reload() } catch (err) { toast(err.message, 'red') } }
    return (
        <Panel title="Emergency contacts" subtitle="Shared with the response team when you raise an SOS.">
            {c.loading ? <Loading /> : (
                <div className="space-y-2">
                    {c.data.length === 0 && <Empty>No emergency contacts yet. Please add at least one.</Empty>}
                    {c.data.map((x) => (
                        <div key={x.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                            <span><b className="text-slate-200">{x.name}</b> {x.relationship && <span className="text-slate-500">· {x.relationship}</span>}<br /><span className="text-slate-400">{x.phone}</span></span>
                            <Button variant="ghost" onClick={() => remove(x.id)}>Remove</Button>
                        </div>
                    ))}
                </div>
            )}
            <form onSubmit={add} className="mt-5 grid gap-3 sm:grid-cols-4">
                <Input required placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <Input placeholder="Relationship" value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} />
                <Input required placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                <Button type="submit">Add</Button>
            </form>
        </Panel>
    )
}

export default function Emergency() {
    const toast = useToast()
    const list = useLoad(() => api.get('/incidents'))
    const [open, setOpen] = useState(null)
    const detail = useLoad(() => (open ? api.get(`/incidents/${open}`) : Promise.resolve(null)), [open])

    useSocket({ 'incident:updated': () => { list.reload(); if (open) detail.reload() } })
    const active = (list.data || []).filter((i) => !['RESOLVED', 'FALSE_ALARM'].includes(i.status))

    return (
        <>
            <DashboardHeader portal="Tourist Portal" title="Emergency / SOS" description="Get help quickly and follow the status of your reports." status={active.length ? `${active.length} active report${active.length > 1 ? 's' : ''}` : 'No active emergencies'} statusColor={active.length ? 'amber' : 'emerald'} />
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <Panel title="Emergency SOS" className="border-red-500/30">
                    <p className="text-sm leading-6 text-slate-400">Use only in a real emergency. Responders receive your location and emergency contacts.</p>
                    <div className="mt-6"><SosButton /></div>
                </Panel>
                <Panel className="lg:col-span-2" title="Report a problem" subtitle="For issues that are not life-threatening."><ReportForm onDone={list.reload} /></Panel>
            </div>

            <Panel className="mt-6" title="My reports">
                {list.loading ? <Loading /> : list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : (
                    <Table rows={list.data} empty="You have not reported anything." onRowClick={(r) => setOpen(r.id)} columns={[
                        { title: 'Case', key: 'incident_code' },
                        { title: 'Type', render: (r) => label(r.type) },
                        { title: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                        { title: 'Reported', render: (r) => timeAgo(r.created_at) },
                    ]} />
                )}
            </Panel>

            <div className="mt-6"><Contacts /></div>

            {open && (
                <Modal title={detail.data ? `${detail.data.incident_code} · ${label(detail.data.type)}` : 'Report'} onClose={() => setOpen(null)}>
                    {!detail.data ? <Loading /> : (
                        <div className="space-y-4 text-sm">
                            <p>Status: <StatusBadge value={detail.data.status} /></p>
                            {detail.data.description && <p className="text-slate-300">{detail.data.description}</p>}
                            <div>
                                <p className="mb-2 font-medium text-slate-300">Progress</p>
                                <ol className="space-y-2 border-l border-slate-700 pl-4">
                                    {detail.data.updates.map((u, i) => <li key={i} className="text-slate-400"><span className="text-slate-500">{new Date(u.created_at).toLocaleString()}</span><br />{u.note}</li>)}
                                </ol>
                            </div>
                        </div>
                    )}
                </Modal>
            )}
        </>
    )
}
