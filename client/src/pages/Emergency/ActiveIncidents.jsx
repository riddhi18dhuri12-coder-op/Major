import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import MapView from '../../components/MapView'
import { Panel, Button, Field, Textarea, StatusBadge, Modal, Loading, Empty, label, timeAgo, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useResponder } from './ResponderContext'

const NEXT = {
    ACKNOWLEDGED: [{ to: 'RESPONDING', text: 'Start response' }],
    RESPONDING: [{ to: 'ON_SITE', text: 'Mark arrival (on site)' }],
    ON_SITE: [{ to: 'RESOLVED', text: 'Mark resolved' }],
}

function Detail({ id, onClose }) {
    const toast = useToast()
    const { reload } = useResponder()
    const d = useLoad(() => api.get(`/responder/incidents/${id}`), [id])
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const i = d.data

    async function move(status) {
        setBusy(true)
        try { await api.put(`/responder/incidents/${id}/status`, { status, note: note || undefined }); setNote(''); toast(`Updated: ${label(status)}`, 'green'); d.reload(); reload() } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
    }

    return (
        <Modal wide title={i ? `${i.incident_code} · ${label(i.type)}` : 'Incident'} onClose={onClose}>
            {!i ? <Loading /> : (
                <div className="space-y-5 text-sm">
                    <div className="flex flex-wrap items-center gap-3"><StatusBadge value={i.status} /><StatusBadge value={i.severity} /></div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
                            <p className="text-xs uppercase text-slate-500">Tourist</p>
                            <p className="font-semibold text-slate-200">{i.tourist.name} <span className="font-normal text-slate-500">({i.tourist.digital_id || i.tourist.tourist_code})</span></p>
                            <p className="text-slate-400">{i.tourist.phone || 'No phone on file'} · {label(i.tourist.tourist_type)}</p>
                            {i.description && <p className="text-slate-300">{i.description}</p>}
                            <p className="pt-2 text-xs uppercase text-slate-500">Emergency contacts</p>
                            {i.emergency_contacts.length === 0 ? <p className="text-slate-500">None on file.</p> : i.emergency_contacts.map((c) => <p key={c.id} className="text-slate-300">{c.name}{c.relationship ? ` (${c.relationship})` : ''} — <a className="text-cyan-400" href={`tel:${c.phone}`}>{c.phone}</a></p>)}
                        </div>
                        {i.latitude != null ? (
                            <div>
                                <MapView height="h-48" incidents={[{ ...i, tourist_name: i.tourist.name }]} focus={{ latitude: i.latitude, longitude: i.longitude }} />
                                <a className="mt-2 block text-center text-cyan-400 hover:text-cyan-300" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${i.latitude},${i.longitude}`}>Open navigation ↗</a>
                            </div>
                        ) : <p className="rounded-lg border border-dashed border-slate-700 p-4 text-slate-500">No location attached. Contact dispatch.</p>}
                    </div>

                    <div>
                        <p className="mb-2 font-medium text-slate-300">Timeline</p>
                        <ol className="space-y-2 border-l border-slate-700 pl-4">{i.updates.map((u, k) => <li key={k} className="text-slate-400"><span className="text-xs text-slate-500">{new Date(u.created_at).toLocaleString()}</span><br />{u.note}</li>)}</ol>
                    </div>

                    {NEXT[i.status] && (
                        <div className="border-t border-slate-800 pt-4">
                            <Field label="Progress note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {NEXT[i.status].map((n) => <Button key={n.to} disabled={busy} onClick={() => move(n.to)}>{n.text}</Button>)}
                                {i.status === 'RESPONDING' && <Button variant="secondary" disabled={busy} onClick={() => move('RESOLVED')}>Resolve without site visit</Button>}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    )
}

export default function ActiveIncidents() {
    const { incidents } = useResponder()
    const [open, setOpen] = useState(null)
    if (!incidents) return <Loading />
    const active = incidents.filter((i) => !['RESOLVED', 'FALSE_ALARM'].includes(i.status))
    const past = incidents.filter((i) => ['RESOLVED', 'FALSE_ALARM'].includes(i.status))

    return (
        <>
            <DashboardHeader portal="Emergency Response" title="Active Incidents" description="Move each incident forward as you respond: start response → arrive → resolve." />
            <Panel className="mt-8" title={`Assigned to you (${active.length})`}>
                {active.length === 0 ? <Empty>No active assignments.</Empty> : (
                    <div className="space-y-3">
                        {active.map((i) => (
                            <button key={i.id} onClick={() => setOpen(i.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-4 text-left transition hover:border-cyan-500/50">
                                <div><h3 className="font-semibold text-slate-200">{i.type === 'SOS' ? 'SOS Emergency' : label(i.type)} <span className="font-normal text-slate-500">· {i.incident_code}</span></h3><p className="mt-1 text-xs text-slate-500">{i.tourist_name} · assigned {timeAgo(i.assigned_at)}</p></div>
                                <StatusBadge value={i.status} />
                            </button>
                        ))}
                    </div>
                )}
            </Panel>
            {past.length > 0 && (
                <Panel className="mt-6" title="Completed">
                    <div className="space-y-2">{past.slice(0, 10).map((i) => <button key={i.id} onClick={() => setOpen(i.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-left text-sm text-slate-400"><span>{i.incident_code} · {i.tourist_name}</span><StatusBadge value={i.status} /></button>)}</div>
                </Panel>
            )}
            {open && <Detail id={open} onClose={() => setOpen(null)} />}
        </>
    )
}
