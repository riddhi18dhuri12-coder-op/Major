import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend } from '../../components/MapView'
import { Panel, Loading } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useResponder } from './ResponderContext'

export default function OperationsMap() {
    const { unit, incidents, position } = useResponder()
    const zones = useLoad(() => api.get('/zones'))
    const [focus, setFocus] = useState(null)
    if (!unit || !incidents) return <Loading />
    const active = incidents.filter((i) => !['RESOLVED', 'FALSE_ALARM'].includes(i.status) && i.latitude != null)
    const me = position || (unit.location?.latitude != null ? unit.location : null)

    return (
        <>
            <DashboardHeader portal="Emergency Response" title="Operations Map" description="Your incidents, your position and the safety zones around them." />
            <Panel className="mt-8">
                <MapView zones={zones.data || []} incidents={active.map((i) => ({ ...i, id: i.id }))} me={me} focus={focus} height="h-[32rem]" />
                <ZoneLegend />
                {active.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{active.map((i) => <button key={i.id} onClick={() => setFocus({ latitude: i.latitude, longitude: i.longitude })} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500">{i.incident_code} · {i.tourist_name}</button>)}</div>}
            </Panel>
        </>
    )
}
