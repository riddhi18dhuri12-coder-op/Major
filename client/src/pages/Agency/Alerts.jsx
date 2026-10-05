import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Table, StatusBadge, Loading, ErrorNote, label, timeAgo } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'

export default function Alerts() {
    const incidents = useLoad(() => api.get('/incidents'))
    const notes = useLoad(() => api.get('/notifications'))
    useSocket({ 'incident:new': incidents.reload, 'sos:alert': incidents.reload, 'incident:updated': incidents.reload, 'notification:new': notes.reload })
    return (
        <>
            <DashboardHeader portal="Travel Agency Portal" title="Alerts" description="Emergencies and safety warnings for your tourists." />
            <Panel className="mt-8" title="Incidents">
                {incidents.loading ? <Loading /> : incidents.error ? <ErrorNote message={incidents.error} onRetry={incidents.reload} /> : (
                    <Table rows={incidents.data} empty="No incidents. All quiet." columns={[
                        { title: 'Case', key: 'incident_code' },
                        { title: 'Tourist', render: (i) => `${i.tourist_name} (${i.tourist_code})` },
                        { title: 'Type', render: (i) => label(i.type) },
                        { title: 'Severity', render: (i) => <StatusBadge value={i.severity} /> },
                        { title: 'Status', render: (i) => <StatusBadge value={i.status} /> },
                        { title: 'When', render: (i) => timeAgo(i.created_at) },
                    ]} />
                )}
            </Panel>
            <Panel className="mt-6" title="Safety notifications">
                {notes.loading ? <Loading /> : (
                    <Table rows={notes.data || []} empty="Nothing yet." columns={[
                        { title: 'Type', render: (n) => label(n.type) },
                        { title: 'Message', key: 'message' },
                        { title: 'When', render: (n) => timeAgo(n.created_at) },
                    ]} />
                )}
            </Panel>
        </>
    )
}
