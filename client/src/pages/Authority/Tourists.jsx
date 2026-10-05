import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import MapView from '../../components/MapView'
import { Panel, Table, StatusBadge, Select, Modal, Loading, ErrorNote, label, timeAgo } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'

export default function Tourists() {
    const [risk, setRisk] = useState('')
    const [sel, setSel] = useState(null)
    const list = useLoad(() => api.get(`/authority/tourists${risk ? `?risk=${risk}` : ''}`), [risk])
    const zones = useLoad(() => api.get('/zones'))
    useSocket({ 'risk:update': list.reload })

    return (
        <>
            <DashboardHeader portal="Authority Portal" title="Tourists" description="Monitored tourists, highest risk first. Locations are shown only for tourists who share them." />
            <Panel className="mt-8" title="Tourist monitoring" action={<div className="w-44"><Select value={risk} onChange={(e) => setRisk(e.target.value)}><option value="">All risk levels</option>{['HIGH', 'MEDIUM', 'LOW'].map((r) => <option key={r} value={r}>{label(r)}</option>)}</Select></div>}>
                {list.loading ? <Loading /> : list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : (
                    <Table rows={list.data} empty="No tourists match." onRowClick={setSel} columns={[
                        { title: 'Tourist', render: (t) => <span><b className="text-slate-200">{t.name}</b><br /><span className="text-xs text-slate-500">{t.digital_id || t.tourist_code} · {t.agency}</span></span> },
                        { title: 'Risk', render: (t) => <span><StatusBadge value={t.risk?.level || 'LOW'} /> <span className="ml-1 text-xs text-slate-500">{t.risk?.score ?? 0}/100</span></span> },
                        { title: 'Status', render: (t) => <StatusBadge value={t.status} /> },
                        { title: 'Zone', render: (t) => t.current_zone?.name || '—' },
                        { title: 'Verified', render: (t) => <StatusBadge value={t.verification_status || 'NOT_SUBMITTED'} /> },
                        { title: 'Last location', render: (t) => timeAgo(t.last_location?.recorded_at) },
                    ]} />
                )}
            </Panel>
            {sel && (
                <Modal wide title={sel.name} onClose={() => setSel(null)}>
                    <div className="space-y-4 text-sm">
                        <div className="flex flex-wrap gap-2"><StatusBadge value={sel.risk?.level || 'LOW'} /><StatusBadge value={sel.status} /><StatusBadge value={sel.verification_status || 'NOT_SUBMITTED'} /></div>
                        <div>
                            <p className="mb-1 font-medium text-slate-300">Why this risk level</p>
                            <ul className="list-disc pl-5 text-slate-400">{(sel.risk?.factors?.length ? sel.risk.factors : ['No risk factors detected']).map((f) => <li key={f}>{f}</li>)}</ul>
                        </div>
                        <p className="text-slate-400">{sel.phone || sel.email} · {label(sel.tourist_type)}{sel.nationality ? ` (${sel.nationality})` : ''} · Agency: {sel.agency}</p>
                        {sel.last_location?.latitude != null ? <MapView height="h-64" zones={zones.data || []} tourists={[sel]} /> : <p className="rounded-lg border border-dashed border-slate-700 p-4 text-slate-500">This tourist is not sharing their location.</p>}
                    </div>
                </Modal>
            )}
        </>
    )
}
