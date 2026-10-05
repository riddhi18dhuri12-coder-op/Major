import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import MapView from '../../components/MapView'
import { Panel, Table, Button, Modal, Field, Input, Select, StatusBadge, Loading, ErrorNote, label, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'

export default function Units() {
    const toast = useToast()
    const units = useLoad(() => api.get('/authority/units'))
    const [open, setOpen] = useState(false)
    const [f, setF] = useState({ name: '', type: 'RESCUE', email: '', phone: '', password: '', latitude: '', longitude: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    useSocket({ 'unit:status': units.reload, 'unit:location': units.reload, 'incident:updated': units.reload })

    async function add(e) {
        e.preventDefault()
        try {
            await api.post('/authority/units', { name: f.name, type: f.type, email: f.email, phone: f.phone || undefined, password: f.password, ...(f.latitude && f.longitude && { latitude: Number(f.latitude), longitude: Number(f.longitude) }) })
            toast('Unit created', 'green'); setOpen(false); units.reload()
        } catch (err) { toast(err.message, 'red') }
    }
    async function remove(u) { if (!confirm(`Remove ${u.name}?`)) return; try { await api.del(`/authority/units/${u.id}`); units.reload() } catch (e) { toast(e.message, 'red') } }

    return (
        <>
            <DashboardHeader portal="Authority Portal" title="Response Units" description="Police, rescue, medical and local teams that can be dispatched." />
            <Panel className="mt-8" title="Unit map"><MapView units={units.data || []} height="h-72" /></Panel>
            <Panel className="mt-6" title={`${units.data?.length ?? 0} units`} action={<Button onClick={() => setOpen(true)}>Add Unit</Button>}>
                {units.loading ? <Loading /> : units.error ? <ErrorNote message={units.error} onRetry={units.reload} /> : (
                    <Table rows={units.data} empty="No units yet. Add one so you can dispatch." columns={[
                        { title: 'Unit', render: (u) => <b className="text-slate-200">{u.name}</b> },
                        { title: 'Type', render: (u) => label(u.type) },
                        { title: 'Status', render: (u) => <StatusBadge value={u.status} /> },
                        { title: 'Login', key: 'email' },
                        { title: '', render: (u) => <Button variant="ghost" onClick={() => remove(u)}>Remove</Button> },
                    ]} />
                )}
            </Panel>
            {open && (
                <Modal title="Add response unit" onClose={() => setOpen(false)}>
                    <form onSubmit={add} className="space-y-4">
                        <Field label="Unit name"><Input required value={f.name} onChange={set('name')} placeholder="Rescue Team Alpha" /></Field>
                        <Field label="Type"><Select value={f.type} onChange={set('type')}>{['POLICE', 'RESCUE', 'MEDICAL', 'LOCAL'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
                        <Field label="Login email"><Input required type="email" value={f.email} onChange={set('email')} /></Field>
                        <Field label="Temporary password" hint="At least 8 characters."><Input required minLength={8} value={f.password} onChange={set('password')} /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Base latitude"><Input type="number" step="any" value={f.latitude} onChange={set('latitude')} /></Field>
                            <Field label="Base longitude"><Input type="number" step="any" value={f.longitude} onChange={set('longitude')} /></Field>
                        </div>
                        <Button type="submit" className="w-full">Create unit</Button>
                    </form>
                </Modal>
            )}
        </>
    )
}
