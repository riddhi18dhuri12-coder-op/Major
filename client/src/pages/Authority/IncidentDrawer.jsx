import { useState } from 'react'
import { Modal, Button, Field, Textarea, StatusBadge, Loading, label, timeAgo, useToast } from '../../components/ui'
import MapView from '../../components/MapView'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'

const STEPS = ['NEW', 'ACKNOWLEDGED', 'RESPONDING', 'ON_SITE', 'RESOLVED']

function Progress({ status }) {
    const idx = status === 'FALSE_ALARM' ? -1 : STEPS.indexOf(status)
    return (
        <div className="flex items-center gap-1 text-[11px]">
            {STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 flex-col items-center gap-1">
                    <div className={`h-1.5 w-full rounded ${i <= idx ? 'bg-cyan-400' : 'bg-slate-700'}`} />
                    <span className={i <= idx ? 'text-cyan-300' : 'text-slate-500'}>{label(s)}</span>
                </div>
            ))}
        </div>
    )
}

/** Incident detail for authorities: timeline, map, nearest available units, dispatch, status. */
export default function IncidentDrawer({ id, onClose, onChanged }) {
    const toast = useToast()
    const inc = useLoad(() => api.get(`/incidents/${id}`), [id])
    const open = inc.data && !['RESOLVED', 'FALSE_ALARM'].includes(inc.data.status)
    const units = useLoad(() => (open ? api.get(`/authority/incidents/${id}/nearby-units`) : Promise.resolve([])), [id, open])
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)

    useSocket({ 'incident:updated': (u) => { if (u.id === id) { inc.reload(); units.reload() } } })

    async function act(fn, ok) {
        setBusy(true)
        try { await fn(); toast(ok, 'green'); setNote(''); inc.reload(); units.reload(); onChanged?.() } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
    }
    const setStatus = (status) => act(() => api.put(`/incidents/${id}/status`, { status, note: note || undefined }), `Marked ${label(status)}`)
    const assign = (u) => act(() => api.put(`/authority/incidents/${id}/assign`, { unit_id: u.id }), `Dispatched ${u.name}`)

    const i = inc.data
    return (
        <Modal wide title={i ? `${i.incident_code} · ${label(i.type)}` : 'Incident'} onClose={onClose}>
            {!i ? <Loading /> : (
                <div className="space-y-5 text-sm">
                    <div className="flex flex-wrap items-center gap-3"><StatusBadge value={i.status} /><StatusBadge value={i.severity} /><span className="text-slate-500">{timeAgo(i.created_at)}</span></div>
                    <Progress status={i.status} />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                            <p className="text-xs uppercase text-slate-500">Tourist</p>
                            <p className="mt-1 font-semibold text-slate-200">{i.tourist?.name}</p>
                            <p className="text-slate-400">{i.tourist?.tourist_code} · {i.tourist?.phone || i.tourist?.email}</p>
                            {i.description && <p className="mt-3 text-slate-300">{i.description}</p>}
                        </div>
                        {i.latitude != null ? <MapView height="h-40" incidents={[{ ...i, tourist_name: i.tourist?.name }]} focus={{ latitude: i.latitude, longitude: i.longitude }} /> : <p className="rounded-lg border border-dashed border-slate-700 p-4 text-slate-500">No location was attached to this report.</p>}
                    </div>

                    {open && (
                        <div>
                            <p className="mb-2 font-medium text-slate-300">Dispatch a response unit {i.assigned_unit_id && <span className="font-normal text-slate-500">(reassigning replaces the current unit)</span>}</p>
                            {units.loading ? <Loading /> : units.data.length === 0 ? <p className="text-slate-500">No units are available right now.</p> : (
                                <div className="space-y-2">
                                    {units.data.map((u) => (
                                        <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
                                            <span><b className="text-slate-200">{u.name}</b> <span className="text-slate-500">· {label(u.type)}</span><br /><span className="text-xs text-slate-400">{u.distance_km != null ? `${u.distance_km} km away` : 'distance unknown'}</span></span>
                                            <Button disabled={busy} onClick={() => assign(u)}>Dispatch</Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <p className="mb-2 font-medium text-slate-300">Timeline</p>
                        <ol className="space-y-2 border-l border-slate-700 pl-4">
                            {i.updates.map((u, k) => <li key={k} className="text-slate-400"><span className="text-xs text-slate-500">{new Date(u.created_at).toLocaleString()}</span><br />{u.note}</li>)}
                        </ol>
                    </div>

                    {open && (
                        <div className="border-t border-slate-800 pt-4">
                            <Field label="Note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {i.status === 'NEW' && <Button variant="secondary" disabled={busy} onClick={() => setStatus('ACKNOWLEDGED')}>Acknowledge</Button>}
                                <Button disabled={busy} onClick={() => setStatus('RESOLVED')}>Resolve</Button>
                                <Button variant="ghost" disabled={busy} onClick={() => setStatus('FALSE_ALARM')}>Mark false alarm</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    )
}
