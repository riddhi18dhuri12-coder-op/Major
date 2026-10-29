import { Link } from 'react-router-dom'
import DashboardHeader from '../../components/DashboardHeader'
import MapView from '../../components/MapView'
import { StatCard, Panel, Table, StatusBadge, Loading, ErrorNote, label, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'
import { useAuth } from '../../lib/auth'

function AgencyDashboard() {
    const { user } = useAuth()
    const toast = useToast()
    const tourists = useLoad(() => api.get('/tourists'))
    const trips = useLoad(() => api.get('/trips'))
    const incidents = useLoad(() => api.get('/incidents?active=true'))
    const pending = useLoad(() => (user.role === 'company' ? api.get('/verification/pending') : Promise.resolve([])))
    const zones = useLoad(() => api.get('/zones'))

    useSocket({
        'sos:alert': (i) => { toast(`🆘 SOS from ${i.tourist_name} (${i.tourist_code})`, 'red'); incidents.reload(); tourists.reload() },
        'incident:new': () => incidents.reload(),
        'incident:updated': () => { incidents.reload(); tourists.reload() },
        'risk:update': (r) => tourists.setData((tourists.data || []).map((t) => (t.id === r.tourist_id ? { ...t, risk: r.risk, current_zone: r.zone } : t))),
        'location:update': (l) => tourists.setData((tourists.data || []).map((t) => (t.id === l.tourist_id ? { ...t, last_location: l } : t))),
    })

    if (tourists.loading || trips.loading) return <Loading />
    if (tourists.error) return <ErrorNote message={tourists.error} onRetry={tourists.reload} />

    const T = tourists.data
    const activeTrips = trips.data.filter((t) => t.status === 'ACTIVE')
    const verified = T.filter((t) => t.verification?.status === 'VERIFIED').length
    const alerts = T.filter((t) => t.status !== 'NORMAL').length

    return (
        <>
            <DashboardHeader portal="Travel Agency Portal" title="Agency Dashboard" description="Manage tourists, verification, trips, and safety monitoring." status={`Agency Status: ${alerts ? `${alerts} need attention` : 'Active'}`} statusColor={alerts ? 'amber' : 'emerald'} />

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Registered Tourists" value={T.length} description="Tourists currently registered with your agency." />
                <StatCard title="Verified Tourists" value={verified} description="Tourist identities successfully verified." tone="emerald" />
                <StatCard title="Active Trips" value={activeTrips.length} description="Currently active tourist journeys." />
                <StatCard title="Safety Alerts" value={String(alerts).padStart(2, '0')} description="Tourists needing attention or in emergency." tone={alerts ? 'red' : 'cyan'} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <Panel className="lg:col-span-2" title="Tourist Management" subtitle="Manage tourists associated with your agency."
                    action={user.role === 'company' && <Link to="/agency/tourists" className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#020617] hover:bg-cyan-400">Add Tourist</Link>}>
                    <Table rows={T.slice(0, 6)} empty="No tourists yet. Add one from a trip." columns={[
                        { title: 'Tourist', render: (t) => <span><b className="text-slate-200">{t.name}</b><br /><span className="text-xs text-slate-500">{t.tourist_code}</span></span> },
                        { title: 'Type', render: (t) => label(t.tourist_type) },
                        { title: 'Verification', render: (t) => <StatusBadge value={t.verification?.status || 'NOT_SUBMITTED'} /> },
                        { title: 'Status', render: (t) => <StatusBadge value={t.status} /> },
                    ]} />
                </Panel>

                <Panel title="Verification">
                    <p className="text-sm leading-6 text-slate-400">Review tourist identity verification requests and supporting documents.</p>
                    <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                        <p className="text-sm text-amber-400">Pending Verification</p>
                        <p className="mt-2 text-3xl font-bold text-white">{pending.data?.length ?? 0}</p>
                    </div>
                    {user.role === 'company' && <Link to="/agency/verification" className="mt-6 block w-full rounded-lg border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-200 hover:border-cyan-500 hover:text-cyan-400">Review Requests</Link>}
                </Panel>
            </div>

            <Panel className="mt-8" title="Live tourist map" subtitle={`Last known positions of tourists who allow GPS tracking${T ? ` — ${T.filter((x) => x.location_sharing).length} of ${T.length} sharing now` : ''}.`}>
                <MapView zones={zones.data || []} tourists={T} incidents={incidents.data || []} height="h-80" />
            </Panel>

            <Panel className="mt-8" title="Active Trip Monitoring">
                {activeTrips.length === 0 ? <p className="text-sm text-slate-500">No trips are active right now.</p> : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {activeTrips.map((t) => (
                            <Link to={`/agency/trips/${t.id}`} key={t.id} className="rounded-lg border border-slate-800 bg-slate-950 p-5 transition hover:border-cyan-500/50">
                                <h3 className="font-semibold text-slate-200">{t.name}</h3>
                                <p className="mt-2 text-sm text-slate-400">{t.tourist_count} Tourists</p>
                                <p className="mt-4 text-sm text-cyan-400">● {t.guide_name ? `Guide: ${t.guide_name}` : 'No guide assigned'}</p>
                            </Link>
                        ))}
                    </div>
                )}
            </Panel>
        </>
    )
}

export default AgencyDashboard
