import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Button, StatusBadge, Loading, label, timeAgo, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useResponder } from './ResponderContext'

export default function MyUnit() {
    const toast = useToast()
    const { unit, position, tracking, setTracking, reload } = useResponder()
    if (!unit) return <Loading />
    const busyOnJob = !!unit.current_incident_id

    async function setAvailable(available) {
        try { await api.put('/responder/availability', { available }); toast(available ? 'You are now available for dispatch.' : 'You are off duty.', 'green'); reload() } catch (e) { toast(e.message, 'red') }
    }

    return (
        <>
            <DashboardHeader portal="Emergency Response" title="My Unit" description="Your availability and position, which dispatch uses to pick the nearest unit." />
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <Panel title={unit.name} action={<StatusBadge value={unit.status} />}>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-400">Type</dt><dd>{label(unit.type)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Login</dt><dd>{unit.email}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Last position</dt><dd>{unit.location?.latitude != null ? `${unit.location.latitude.toFixed(4)}, ${unit.location.longitude.toFixed(4)} (${timeAgo(unit.location.updated_at)})` : 'Unknown'}</dd></div>
                    </dl>
                    <div className="mt-6 flex gap-3">
                        <Button disabled={busyOnJob || unit.status === 'AVAILABLE'} onClick={() => setAvailable(true)}>Go on duty</Button>
                        <Button variant="secondary" disabled={busyOnJob || unit.status === 'OFFLINE'} onClick={() => setAvailable(false)}>Go off duty</Button>
                    </div>
                    {busyOnJob && <p className="mt-3 text-xs text-amber-400">Finish your current incident before changing duty status.</p>}
                </Panel>
                <Panel title="Share my position" subtitle="Keeps dispatch informed while you move. Reported every 30 seconds.">
                    <p className="text-sm text-slate-400">{tracking ? (position ? `Sharing: ${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}` : 'Waiting for GPS…') : 'Position sharing is off.'}</p>
                    <Button className="mt-5" variant={tracking ? 'secondary' : 'primary'} onClick={() => setTracking(!tracking)}>{tracking ? 'Stop sharing' : 'Start sharing'}</Button>
                </Panel>
            </div>
        </>
    )
}
