import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend } from '../../components/MapView'
import { Panel, StatusBadge, Loading, ErrorNote, Empty, label } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useTourist } from './TouristContext'

export default function SafetyZones() {
    const t = useTourist()
    const zones = useLoad(() => api.get('/zones'))
    const here = t.live.zone?.name ? t.live.zone : null
    return (
        <>
            <DashboardHeader portal="Tourist Portal" title="Safety Zones" description="Areas marked by the authorities. You are warned when you enter a danger or restricted zone." />
            <div className="mt-8 space-y-6">
                <Panel title="Zone map" subtitle={here ? `You are in: ${here.name} (${label(here.type)})` : 'Turn on location sharing to see where you are.'}>
                    {zones.loading ? <Loading /> : zones.error ? <ErrorNote message={zones.error} onRetry={zones.reload} /> : <MapView zones={zones.data} me={t.position} height="h-96" />}
                    <ZoneLegend />
                </Panel>
                <Panel title="All active zones">
                    {zones.data?.length === 0 ? <Empty>No zones have been defined yet.</Empty> : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {(zones.data || []).map((z) => (
                                <div key={z.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                                    <div className="flex items-center justify-between gap-2"><b className="text-slate-200">{z.name}</b><StatusBadge value={z.type} /></div>
                                    {z.description && <p className="mt-2 text-xs text-slate-400">{z.description}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>
        </>
    )
}
