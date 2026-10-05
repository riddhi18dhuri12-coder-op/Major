import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Table, StatusBadge, Select, Loading, ErrorNote, label, timeAgo } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'
import IncidentDrawer from './IncidentDrawer'

export default function Incidents() {
    const [filter, setFilter] = useState('active')
    const [open, setOpen] = useState(null)
    const list = useLoad(() => api.get(filter === 'active' ? '/incidents?active=true' : filter === 'all' ? '/incidents' : `/incidents?status=${filter}`), [filter])
    useSocket({ 'incident:new': list.reload, 'sos:alert': list.reload, 'incident:updated': list.reload })

    return (
        <>
            <DashboardHeader portal="Authority Portal" title="Incidents" description="Every emergency and report, across all agencies." />
            <Panel className="mt-8" title="Incident list" action={
                <div className="w-44"><Select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="active">Active only</option><option value="all">All</option>
                    {['NEW', 'ACKNOWLEDGED', 'RESPONDING', 'ON_SITE', 'RESOLVED', 'FALSE_ALARM'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </Select></div>}>
                {list.loading ? <Loading /> : list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : (
                    <Table rows={list.data} empty="No incidents match." onRowClick={(r) => setOpen(r.id)} columns={[
                        { title: 'Case', render: (i) => <b className="text-slate-200">{i.incident_code}</b> },
                        { title: 'Type', render: (i) => label(i.type) },
                        { title: 'Tourist', render: (i) => `${i.tourist_name} (${i.tourist_code})` },
                        { title: 'Severity', render: (i) => <StatusBadge value={i.severity} /> },
                        { title: 'Status', render: (i) => <StatusBadge value={i.status} /> },
                        { title: 'Reported', render: (i) => timeAgo(i.created_at) },
                    ]} />
                )}
            </Panel>
            {open && <IncidentDrawer id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
        </>
    )
}
