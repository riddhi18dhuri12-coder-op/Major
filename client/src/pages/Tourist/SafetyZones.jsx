import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend, ServiceLegend } from '../../components/MapView'
import NearbyHelp, { markNearest } from '../../components/NearbyHelp'
import { useNearbyServices } from '../../lib/nearby'
import { Panel, StatusBadge, Loading, ErrorNote, Empty } from '../../components/ui'
import { useI18n } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useTourist } from './TouristContext'

export default function SafetyZones() {
    const t = useTourist()
    const { t: tr, te } = useI18n()
    const zones = useLoad(() => api.get('/zones'))
    const nearby = useNearbyServices(t.position)
    const here = t.live.zone?.name ? t.live.zone : null
    return (
        <>
            <DashboardHeader portal={tr('portal.tourist')} title={tr('nav.zones')} description={tr('zones.desc')} />
            <div className="mt-8 space-y-6">
                <Panel title={tr('zones.map')} subtitle={here ? tr('zones.in', { name: here.name, type: te(here.type) }) : tr('zones.turnOn')}>
                    {zones.loading ? <Loading /> : zones.error ? <ErrorNote message={zones.error} onRetry={zones.reload} /> : <MapView zones={zones.data} me={t.position} services={markNearest(nearby.services)} height="h-96" />}
                    <ZoneLegend />
                    {nearby.services.length > 0 && <ServiceLegend />}
                </Panel>
                <NearbyHelp position={t.position} nearby={nearby} showMap={false} />
                <Panel title={tr('zones.all')}>
                    {zones.data?.length === 0 ? <Empty>{tr('zones.none')}</Empty> : (
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
