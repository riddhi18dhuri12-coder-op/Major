import DashboardHeader from '../../components/DashboardHeader'
import { StatCard, Panel, Table, Badge, Loading, ErrorNote, label, timeAgo } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'

function Bars({ data, colors = {} }) {
    const max = Math.max(1, ...Object.values(data))
    return (
        <div className="space-y-3">
            {Object.entries(data).map(([k, v]) => (
                <div key={k}>
                    <div className="mb-1 flex justify-between text-xs text-slate-400"><span>{label(k)}</span><span>{v}</span></div>
                    <div className="h-2 rounded bg-slate-800"><div className="h-2 rounded" style={{ width: `${(v / max) * 100}%`, background: colors[k] || '#22d3ee' }} /></div>
                </div>
            ))}
        </div>
    )
}

export default function Analytics() {
    const ov = useLoad(() => api.get('/authority/overview'))
    const inc = useLoad(() => api.get('/incidents?limit=500'))
    const ledger = useLoad(() => api.get('/verification/ledger'))
    const audit = useLoad(() => api.get('/authority/audit?limit=30'))

    if (ov.loading || inc.loading) return <Loading />
    if (ov.error) return <ErrorNote message={ov.error} onRetry={ov.reload} />
    const o = ov.data
    const byType = {}, byStatus = {}
    for (const i of inc.data || []) { byType[i.type] = (byType[i.type] || 0) + 1; byStatus[i.status] = (byStatus[i.status] || 0) + 1 }

    return (
        <>
            <DashboardHeader portal="Authority Portal" title="Analytics" description="Incident trends, system integrity and an audit trail of authority actions." />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Incidents (recent)" value={inc.data?.length ?? 0} />
                <StatCard title="Resolved today" value={o.resolved_today} tone="emerald" />
                <StatCard title="Units deployed" value={o.units.DISPATCHED + o.units.EN_ROUTE + o.units.ON_SCENE} tone="amber" />
                <StatCard title="Verified proofs" value={ledger.data?.length ?? '—'} description="Entries on the verification ledger." />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <Panel title="Incidents by type">{Object.keys(byType).length ? <Bars data={byType} /> : <p className="text-sm text-slate-500">No incidents recorded.</p>}</Panel>
                <Panel title="Incidents by status">{Object.keys(byStatus).length ? <Bars data={byStatus} colors={{ NEW: '#ef4444', RESOLVED: '#10b981' }} /> : <p className="text-sm text-slate-500">No incidents recorded.</p>}</Panel>
            </div>

            <Panel className="mt-6" title="Verification ledger" subtitle="Hash-linked proof records. Editing any past record breaks the chain.">
                {ledger.loading ? <Loading /> : ledger.error ? <ErrorNote message={ledger.error} onRetry={ledger.reload} /> : (
                    <>
                        <p className="mb-4 text-sm">{ledger.data.valid ? <Badge tone="green">✓ Chain intact · {ledger.data.length} blocks</Badge> : <Badge tone="red">⚠ Chain broken at block {ledger.data.broken_at}: {ledger.data.reason}</Badge>}</p>
                        <Table rows={ledger.data.latest.map((b) => ({ ...b, id: b.index }))} empty="No verified tourists yet." columns={[
                            { title: '#', key: 'index' }, { title: 'Digital ID', key: 'digital_id' },
                            { title: 'Block hash', render: (b) => <code className="text-xs text-slate-400">{b.block_hash.slice(0, 24)}…</code> },
                            { title: 'Recorded', render: (b) => timeAgo(b.created_at) },
                        ]} />
                    </>
                )}
            </Panel>

            <Panel className="mt-6" title="Audit log" subtitle="Zone changes, dispatches, unit changes and verification decisions.">
                {audit.loading ? <Loading /> : (
                    <Table rows={audit.data || []} empty="No actions logged yet." columns={[
                        { title: 'When', render: (a) => new Date(a.created_at).toLocaleString() },
                        { title: 'Who', render: (a) => `${a.actor_name} (${label(a.actor_role)})` },
                        { title: 'Action', render: (a) => <Badge tone="cyan">{label(a.action)}</Badge> },
                        { title: 'Detail', render: (a) => <code className="text-xs text-slate-400">{a.detail ? JSON.stringify(a.detail) : ''}</code> },
                    ]} />
                )}
            </Panel>
        </>
    )
}
