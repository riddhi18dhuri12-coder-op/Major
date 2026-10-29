import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Button, Field, Input, Select, Textarea, StatusBadge, Table, Modal, Loading, ErrorNote, Empty, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'
import { useTourist } from './TouristContext'
import { SosButton } from './TouristDashboard'
import { useI18n } from '../../lib/i18n'
import { useTourist } from './TouristContext'
import { SosButton } from './TouristDashboard'
import { useI18n } from '../../lib/i18n'
import SelfResolve from '../../components/SelfResolve'
import NearbyHelp from '../../components/NearbyHelp'
import { useNearbyServices } from '../../lib/nearby'

const TYPES = ['MEDICAL', 'ACCIDENT', 'LOST', 'THEFT', 'HARASSMENT', 'UNSAFE', 'TRANSPORT', 'OTHER']

const TYPES = ['MEDICAL', 'ACCIDENT', 'LOST', 'THEFT', 'HARASSMENT', 'UNSAFE', 'TRANSPORT', 'OTHER']

function ReportForm({ onDone }) {
    const t = useTourist()
    const { t: tr, te } = useI18n()
    const toast = useToast()
    const [f, setF] = useState({ type: 'MEDICAL', severity: 'MEDIUM', description: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    async function submit(e) {
        e.preventDefault()
        try {
            await api.post('/incidents', { ...f, description: f.description || undefined, ...(t.position && { latitude: t.position.latitude, longitude: t.position.longitude }) })
            toast(tr('em.sentOk'), 'green')
            setF({ type: 'MEDICAL', severity: 'MEDIUM', description: '' }); onDone()
        } catch (err) { toast(err.message, 'red') }
    }
    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tr('em.what')}><Select value={f.type} onChange={set('type')}>{TYPES.map((x) => <option key={x} value={x}>{te(x)}</option>)}</Select></Field>
                <Field label={tr('em.how')}><Select value={f.severity} onChange={set('severity')}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((x) => <option key={x} value={x}>{te(x)}</option>)}</Select></Field>
            </div>
            <Field label={tr('em.details')} hint={t.position ? tr('em.hintLoc') : tr('em.hintNoLoc')}>
                <Textarea value={f.description} onChange={set('description')} maxLength={2000} placeholder={tr('em.describe')} />
            </Field>
            <Button type="submit">{tr('em.send')}</Button>
        </form>
    )
}

function Contacts() {
    const { t: tr } = useI18n()
    const toast = useToast()
    const c = useLoad(() => api.get('/me/contacts'))
    const [f, setF] = useState({ name: '', relationship: '', phone: '' })
    async function add(e) {
        e.preventDefault()
        try { await api.post('/me/contacts', { name: f.name, relationship: f.relationship || undefined, phone: f.phone }); setF({ name: '', relationship: '', phone: '' }); c.reload() } catch (err) { toast(err.message, 'red') }
    }
    async function remove(id) { try { await api.del(`/me/contacts/${id}`); c.reload() } catch (err) { toast(err.message, 'red') } }
    return (
        <Panel title={tr('em.contacts')} subtitle={tr('em.contactsSub')}>
            {c.loading ? <Loading /> : (
                <div className="space-y-2">
                    {c.data.length === 0 && <Empty>{tr('em.noContacts')}</Empty>}
                    {c.data.map((x) => (
                        <div key={x.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                            <span><b className="text-slate-200">{x.name}</b> {x.relationship && <span className="text-slate-500">· {x.relationship}</span>}<br /><span className="text-slate-400">{x.phone}</span></span>
                            <Button variant="ghost" onClick={() => remove(x.id)}>{tr('common.remove')}</Button>
                        </div>
                    ))}
                </div>
            )}
            <form onSubmit={add} className="mt-5 grid gap-3 sm:grid-cols-4">
                <Input required placeholder={tr('common.nameLabel')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <Input placeholder={tr('em.relationship')} value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} />
                <Input required placeholder={tr('common.phoneLabel')} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                <Button type="submit">{tr('common.add')}</Button>
            </form>
        </Panel>
    )
}

export default function Emergency() {
    const { t: tr, te, ago, dateTime } = useI18n()
    const toast = useToast()
    const list = useLoad(() => api.get('/incidents'))
    const [open, setOpen] = useState(null)
    const t = useTourist()
    const nearby = useNearbyServices(t.position)
    const detail = useLoad(() => (open ? api.get(`/incidents/${open}`) : Promise.resolve(null)), [open])

    useSocket({ 'incident:updated': () => { list.reload(); if (open) detail.reload() } })
    const active = (list.data || []).filter((i) => !['RESOLVED', 'FALSE_ALARM'].includes(i.status))

    return (
        <>
            <DashboardHeader portal={tr('portal.tourist')} title={tr('nav.sos')} description={tr('em.desc')} status={active.length ? tr('em.active', { n: active.length }) : tr('em.none')} statusColor={active.length ? 'amber' : 'emerald'} />
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <Panel title={tr('em.sosTitle')} className="border-red-500/30">
                    <p className="text-sm leading-6 text-slate-400">{tr('em.sosDesc')}</p>
                    <div className="mt-6"><SosButton /></div>
                </Panel>
                <Panel className="lg:col-span-2" title={tr('em.reportTitle')} subtitle={tr('em.reportSub')}><ReportForm onDone={list.reload} /></Panel>
            </div>

            <SelfResolve />

            <div className="mt-6"><NearbyHelp position={t.position} nearby={nearby} /></div>

            <Panel className="mt-6" title={tr('em.myReports')}>
                {list.loading ? <Loading /> : list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : (
                    <Table rows={list.data} empty={tr('em.noReports')} onRowClick={(r) => setOpen(r.id)} columns={[
            <Panel className="mt-6" title={tr('em.myReports')}>
                {list.loading ? <Loading /> : list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : (
                    <Table rows={list.data} empty={tr('em.noReports')} onRowClick={(r) => setOpen(r.id)} columns={[
                        { title: tr('em.col.case'), key: 'incident_code' },
                        { title: tr('common.typeLabel'), render: (r) => te(r.type) },
                        { title: tr('common.statusLabel'), render: (r) => <StatusBadge value={r.status} /> },
                        { title: tr('em.col.reported'), render: (r) => ago(r.created_at) },
                    ]} />
                )}
            </Panel>

            <div className="mt-6"><Contacts /></div>

            {open && (
                <Modal title={detail.data ? `${detail.data.incident_code} · ${te(detail.data.type)}` : tr('em.report')} onClose={() => setOpen(null)}>
                    {!detail.data ? <Loading /> : (
                        <div className="space-y-4 text-sm">
                            <p>{tr('em.statusLabel')} <StatusBadge value={detail.data.status} /></p>
                            {detail.data.description && <p className="text-slate-300">{detail.data.description}</p>}
                            <div>
                                <p className="mb-2 font-medium text-slate-300">{tr('em.progress')}</p>
                                <ol className="space-y-2 border-l border-slate-700 pl-4">
                                    {detail.data.updates.map((u, i) => <li key={i} className="text-slate-400"><span className="text-slate-500">{dateTime(u.created_at)}</span><br />{u.note}</li>)}
                                </ol>
                            </div>
                        </div>
                    )}
                </Modal>
            )}
        </>
    )
}
