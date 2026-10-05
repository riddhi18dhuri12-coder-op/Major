import { Link } from 'react-router-dom'
import DashboardHeader from '../../components/DashboardHeader'
import { StatCard, Panel, StatusBadge, Loading, label, timeAgo } from '../../components/ui'
import { useResponder } from './ResponderContext'

const ACTIVE = ['ACKNOWLEDGED', 'RESPONDING', 'ON_SITE']

function EmergencyDashboard() {
    const { unit, incidents } = useResponder()
    if (!unit || !incidents) return <Loading />
    const active = incidents.filter((i) => ACTIVE.includes(i.status))
    const today = new Date().toDateString()
    const resolvedToday = incidents.filter((i) => i.status === 'RESOLVED' && new Date(i.resolved_at).toDateString() === today).length
    const needsAction = active.filter((i) => i.status === 'ACKNOWLEDGED')

    return (
        <>
            <DashboardHeader portal="Emergency Response" title={unit.name} description="Receive assigned incidents, update progress and mark arrival." status={needsAction.length ? `${needsAction.length} response required` : `Unit: ${label(unit.status)}`} statusColor={needsAction.length ? 'red' : unit.status === 'AVAILABLE' ? 'emerald' : 'cyan'} />

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Active Incidents" value={String(active.length).padStart(2, '0')} description="Assigned to your unit right now." tone={active.length ? 'amber' : 'cyan'} />
                <StatCard title="Unit Status" value={label(unit.status)} description={`${label(unit.type)} unit`} tone={unit.status === 'AVAILABLE' ? 'emerald' : 'cyan'} />
                <StatCard title="Resolved Today" value={String(resolvedToday).padStart(2, '0')} tone="emerald" />
                <StatCard title="Total Assigned" value={incidents.length} />
            </div>

            <Panel className="mt-8" title="Assigned incidents" subtitle="Newest assignments first.">
                {active.length === 0 ? (
                    <p className="text-sm text-slate-500">{unit.status === 'AVAILABLE' ? 'No active assignments. Stay ready — you are visible to dispatch.' : 'No active assignments.'}</p>
                ) : (
                    <div className="space-y-3">
                        {active.map((i) => (
                            <Link to="/emergency/incidents" key={i.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-4 transition hover:border-cyan-500/50">
                                <div><h3 className="font-semibold text-slate-200">{i.type === 'SOS' ? 'SOS Emergency' : label(i.type)}</h3><p className="mt-1 text-xs text-slate-500">{i.incident_code} · {i.tourist_name} · {timeAgo(i.assigned_at)}</p></div>
                                <StatusBadge value={i.status} />
                            </Link>
                        ))}
                    </div>
                )}
            </Panel>
        </>
    )
}

export default EmergencyDashboard
