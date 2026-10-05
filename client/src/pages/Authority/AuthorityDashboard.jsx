import { useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../../components/DashboardHeader'
import MapView from '../../components/MapView'
import { StatCard, Panel, Loading, ErrorNote, StatusBadge, label, timeAgo, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'
import IncidentDrawer from './IncidentDrawer'

function AuthorityDashboard() {
    const toast = useToast()
    const ov = useLoad(() => api.get('/authority/overview'))
    const incidents = useLoad(() => api.get('/incidents?active=true'))
    const tourists = useLoad(() => api.get('/authority/tourists'))
    const zones = useLoad(() => api.get('/zones'))
    const units = useLoad(() => api.get('/authority/units'))
    const [open, setOpen] = useState(null)

    const refresh = () => { ov.reload(); incidents.reload(); tourists.reload(); units.reload() }
    useSocket({
        'sos:alert': (i) => { toast(`🆘 SOS: ${i.tourist_name} (${i.tourist_code})`, 'red'); refresh() },
        'incident:new': refresh, 'incident:updated': refresh, 'zone:changed': zones.reload,
        'unit:status': units.reload, 'unit:location': units.reload,
        'risk:update': (r) => { tourists.setData((tourists.data || []).map((t) => (t.id === r.tourist_id ? { ...t, risk: r.risk, current_zone: r.zone } : t))); ov.reload() },
        'location:update': (l) => tourists.setData((tourists.data || []).map((t) => (t.id === l.tourist_id ? { ...t, last_location: l } : t))),
    })

    if (ov.loading) return <Loading />
    if (ov.error) return <ErrorNote message={ov.error} onRetry={ov.reload} />
    const o = ov.data
    const sos = o.active_sos

    return (
        <>
            <DashboardHeader portal="Authority Portal" title="Safety Control Dashboard" description="Monitor tourist safety, incidents, risk zones, and response operations." status={sos ? `${sos} active SOS` : 'System Status: Operational'} statusColor={sos ? 'red' : 'emerald'} />

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Active Tourists" value={o.active_tourists.toLocaleString()} description="Tourists currently being monitored." />
                <StatCard title="High Risk" value={String(o.risk.HIGH).padStart(2, '0')} description="Tourists requiring attention." tone={o.risk.HIGH ? 'red' : 'cyan'} />
                <StatCard title="Active Incidents" value={String(o.active_incidents).padStart(2, '0')} description="Incidents currently under response." tone={o.active_incidents ? 'amber' : 'cyan'} />
                <StatCard title="Response Units" value={o.units.AVAILABLE} description="Emergency units currently available." tone="emerald" />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <Panel className="lg:col-span-2" title="Tourist Risk Monitoring" subtitle="Current risk distribution across monitored tourists." action={<span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400">Live Monitoring</span>}>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Risk title="Low Risk" value={o.risk.LOW} desc="Normal activity" cls="border-emerald-500/20 bg-emerald-500/5" text="text-emerald-400" />
                        <Risk title="Medium Risk" value={o.risk.MEDIUM} desc="Needs observation" cls="border-amber-500/20 bg-amber-500/5" text="text-amber-400" />
                        <Risk title="High Risk" value={o.risk.HIGH} desc="Immediate attention" cls="border-red-500/20 bg-red-500/5" text="text-red-400" />
                    </div>
                    <div className="mt-6"><MapView zones={zones.data || []} tourists={tourists.data || []} incidents={incidents.data || []} units={units.data || []} height="h-80" onSelectIncident={(i) => setOpen(i.id)} /></div>
                </Panel>

                <Panel title="Active Incidents" action={<span className="text-xs text-red-400">{String(incidents.data?.length ?? 0).padStart(2, '0')} Active</span>}>
                    <div className="space-y-3">
                        {(incidents.data || []).length === 0 && <p className="text-sm text-slate-500">No active incidents.</p>}
                        {(incidents.data || []).slice(0, 6).map((i) => (
                            <button key={i.id} onClick={() => setOpen(i.id)} className="block w-full rounded-lg border border-slate-800 bg-slate-950 p-4 text-left transition hover:border-cyan-500/50">
                                <div className="flex items-start justify-between gap-3">
                                    <div><h3 className="text-sm font-semibold text-slate-200">{i.type === 'SOS' ? 'SOS Alert' : label(i.type)}</h3><p className="mt-1 text-xs text-slate-500">{i.tourist_name} · {timeAgo(i.created_at)}</p></div>
                                    <StatusBadge value={i.status} />
                                </div>
                            </button>
                        ))}
                    </div>
                    <Link to="/authority/incidents" className="mt-6 block w-full rounded-lg border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-400">View All Incidents</Link>
                </Panel>
            </div>

            <Panel className="mt-8" title="Safety Zones" subtitle="Current status of monitored geographical zones.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Risk title="Safe Zones" value={o.zones.SAFE} desc="Normal operating areas" text="text-emerald-400" />
                    <Risk title="Caution Zones" value={o.zones.CAUTION} desc="Additional awareness required" text="text-amber-400" />
                    <Risk title="Danger Zones" value={o.zones.DANGER} desc="High safety risk areas" text="text-red-400" />
                    <Risk title="Restricted Zones" value={o.zones.RESTRICTED} desc="Access should be restricted" text="text-purple-400" />
                </div>
            </Panel>
            {open && <IncidentDrawer id={open} onClose={() => setOpen(null)} onChanged={refresh} />}
        </>
    )
}

function Risk({ title, value, desc, cls = 'border-slate-800 bg-slate-950', text }) {
    return (
        <div className={`rounded-lg border p-5 ${cls}`}>
            <p className={`text-sm font-medium ${text}`}>{title}</p>
            <p className="mt-2 text-2xl font-bold text-white">{String(value).padStart(2, '0')}</p>
            <p className="mt-2 text-xs text-slate-500">{desc}</p>
        </div>
    )
}

export default AuthorityDashboard
