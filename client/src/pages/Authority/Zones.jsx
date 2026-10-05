import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend } from '../../components/MapView'
import { Panel, Button, Field, Input, Select, Textarea, StatusBadge, Loading, ErrorNote, Empty, label, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'

const BLANK = { name: '', type: 'DANGER', risk_level: 'HIGH', description: '', shape: 'CIRCLE', radius_m: 500, center: null, polygon: [] }

export default function Zones() {
    const toast = useToast()
    const zones = useLoad(() => api.get('/zones?all=true'))
    const [f, setF] = useState(BLANK)
    const [focus, setFocus] = useState(null)
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

    const click = (p) => setF((x) => (x.shape === 'CIRCLE' ? { ...x, center: p } : { ...x, polygon: [...x.polygon, p] }))
    const ready = f.name.trim() && (f.shape === 'CIRCLE' ? f.center && f.radius_m >= 10 : f.polygon.length >= 3)

    async function save(e) {
        e.preventDefault()
        const shape = f.shape === 'CIRCLE' ? { kind: 'CIRCLE', center: f.center, radius_m: Number(f.radius_m) } : { kind: 'POLYGON', polygon: f.polygon }
        try {
            await api.post('/zones', { name: f.name.trim(), type: f.type, risk_level: f.risk_level, description: f.description || undefined, shape })
            toast('Zone created. Tourists inside it are warned from their next location update.', 'green')
            setF(BLANK); zones.reload()
        } catch (err) { toast(err.message, 'red') }
    }
    async function toggle(z) { try { await api.put(`/zones/${z.id}`, { active: !z.active }); zones.reload() } catch (e) { toast(e.message, 'red') } }
    async function remove(z) { if (!confirm(`Delete zone "${z.name}"?`)) return; try { await api.del(`/zones/${z.id}`); zones.reload() } catch (e) { toast(e.message, 'red') } }

    return (
        <>
            <DashboardHeader portal="Authority Portal" title="Safety Zones" description="Draw areas on the map. Entering a danger or restricted zone warns the tourist and alerts the agency and authorities." />
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <Panel className="lg:col-span-2" title="Zone map" subtitle="Click the map to place the zone you are creating.">
                    {zones.loading ? <Loading /> : zones.error ? <ErrorNote message={zones.error} onRetry={zones.reload} /> : (
                        <MapView zones={zones.data} onMapClick={click} draft={{ center: f.shape === 'CIRCLE' ? f.center : null, radius_m: Number(f.radius_m), polygon: f.shape === 'POLYGON' ? f.polygon : [] }} focus={focus} height="h-[28rem]" />
                    )}
                    <ZoneLegend />
                </Panel>

                <Panel title="New zone">
                    <form onSubmit={save} className="space-y-4">
                        <Field label="Name"><Input required value={f.name} onChange={set('name')} placeholder="Trekking Area A" /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Type"><Select value={f.type} onChange={set('type')}>{['SAFE', 'CAUTION', 'DANGER', 'RESTRICTED', 'REST_POINT'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
                            <Field label="Risk"><Select value={f.risk_level} onChange={set('risk_level')}>{['LOW', 'MEDIUM', 'HIGH'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
                        </div>
                        <Field label="Shape"><Select value={f.shape} onChange={(e) => setF({ ...f, shape: e.target.value, center: null, polygon: [] })}><option value="CIRCLE">Circle (click centre)</option><option value="POLYGON">Polygon (click corners)</option></Select></Field>
                        {f.shape === 'CIRCLE' ? (
                            <Field label={`Radius: ${f.radius_m} m`}><input type="range" min="50" max="10000" step="50" value={f.radius_m} onChange={set('radius_m')} className="w-full accent-cyan-400" /></Field>
                        ) : (
                            <div className="flex items-center justify-between text-sm text-slate-400"><span>{f.polygon.length} corner{f.polygon.length === 1 ? '' : 's'} (min 3)</span><Button variant="ghost" onClick={() => setF({ ...f, polygon: f.polygon.slice(0, -1) })}>Undo</Button></div>
                        )}
                        <Field label="Description (shown to tourists)"><Textarea value={f.description} onChange={set('description')} maxLength={1000} /></Field>
                        <Button type="submit" disabled={!ready} className="w-full">Create zone</Button>
                        {!ready && <p className="text-xs text-slate-500">Name it and place it on the map to continue.</p>}
                    </form>
                </Panel>
            </div>

            <Panel className="mt-6" title={`All zones (${zones.data?.length ?? 0})`}>
                {zones.data?.length === 0 ? <Empty>No zones yet.</Empty> : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {(zones.data || []).map((z) => (
                            <div key={z.id} className={`rounded-lg border border-slate-800 bg-slate-950 p-4 ${z.active ? '' : 'opacity-60'}`}>
                                <div className="flex items-center justify-between gap-2"><b className="text-slate-200">{z.name}</b><StatusBadge value={z.type} /></div>
                                {z.description && <p className="mt-2 text-xs text-slate-400">{z.description}</p>}
                                <div className="mt-3 flex gap-1 text-sm">
                                    <Button variant="ghost" onClick={() => setFocus({ latitude: z.shape.center?.latitude ?? z.shape.polygon[0].latitude, longitude: z.shape.center?.longitude ?? z.shape.polygon[0].longitude })}>Show</Button>
                                    <Button variant="ghost" onClick={() => toggle(z)}>{z.active ? 'Disable' : 'Enable'}</Button>
                                    <Button variant="ghost" onClick={() => remove(z)}>Delete</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>
        </>
    )
}
