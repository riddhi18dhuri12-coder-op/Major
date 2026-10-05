import { useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend } from '../../components/MapView'
import { StatCard, Panel, Button, Modal, StatusBadge, label, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useTourist } from './TouristContext'

const STATUS_HEADER = {
    NORMAL: ['Safety Status: Safe', 'emerald'],
    ATTENTION: ['Safety Status: Attention', 'amber'],
    EMERGENCY: ['Safety Status: Emergency', 'red'],
}

export function SosButton({ big = true }) {
    const t = useTourist()
    const toast = useToast()
    const [confirm, setConfirm] = useState(false)
    const [busy, setBusy] = useState(false)

    async function send() {
        setBusy(true)
        try {
            const r = await t.sendSos()
            setConfirm(false)
            toast(r.sent ? `🆘 SOS sent (${r.incident.incident_code}). Help has been alerted.` : '🆘 No connection. Your SOS is saved and will be sent the moment you are online.', r.sent ? 'green' : 'amber')
        } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
    }

    return (
        <>
            <button onClick={() => setConfirm(true)} className={`w-full rounded-lg bg-red-600 font-bold text-white transition hover:bg-red-500 ${big ? 'px-6 py-4 text-lg' : 'px-4 py-3'} ${t.profile?.status === 'EMERGENCY' ? 'sos-pulse' : ''}`}>
                SOS
            </button>
            {confirm && (
                <Modal title="Send emergency SOS?" onClose={() => setConfirm(false)}>
                    <p className="text-sm leading-6 text-slate-300">
                        Your agency and the authorities will be alerted immediately{t.position ? ' with your current location' : ''}.
                        {!t.position && <span className="text-amber-400"> Location sharing is off, so responders will not know where you are. Turn it on from the dashboard if you can.</span>}
                    </p>
                    <div className="mt-6 flex gap-3">
                        <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
                        <Button variant="danger" className="flex-1" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Yes, send SOS'}</Button>
                    </div>
                </Modal>
            )}
        </>
    )
}

function TouristDashboard() {
    const t = useTourist()
    const toast = useToast()
    const zones = useLoad(() => api.get('/zones'))
    const [busy, setBusy] = useState(false)
    const p = t.profile

    if (!p) return <p className="py-20 text-center text-slate-500">Loading your dashboard…</p>

    const [statusText, statusColor] = STATUS_HEADER[p.status] || STATUS_HEADER.NORMAL
    const zone = t.live.zone?.name ? t.live.zone : p.current_zone?.name ? p.current_zone : null
    const risk = t.live.risk || p.risk

    async function toggleGps() {
        setBusy(true)
        try { await t.setSharing(!p.location_sharing) } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
    }
    async function imSafe() {
        try { toast((await t.checkIn()) ? '✅ Checked in as safe. Thank you!' : 'No connection. Your check-in is saved and will be sent automatically.', 'green') } catch (e) { toast(e.message, 'red') }
    }

    return (
        <>
            <DashboardHeader portal="Tourist Portal" title={`Welcome, ${p.name.split(' ')[0]}`} description="Monitor your journey and stay informed about your safety." status={statusText} statusColor={statusColor} />

            {t.pending > 0 && (
                <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                    {t.pending} message{t.pending > 1 ? 's' : ''} waiting to send (you are offline). <button className="underline" onClick={t.flush}>Try now</button>
                </div>
            )}

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Current Zone" value={zone ? label(zone.type) + ' Zone' : p.location_sharing ? 'Outside mapped zones' : 'Unknown'} description={zone ? zone.name : 'Turn on GPS to see your zone.'} tone={zone && ['DANGER', 'RESTRICTED'].includes(zone.type) ? 'red' : zone?.type === 'CAUTION' ? 'amber' : 'cyan'} />
                <StatCard title="Risk Level" value={label(risk?.level || 'LOW')} description={risk?.factors?.[0] || 'No immediate safety concerns.'} tone={risk?.level === 'HIGH' || risk?.level === 'CRITICAL' ? 'red' : risk?.level === 'MEDIUM' ? 'amber' : 'emerald'} />
                <StatCard title="GPS Status" value={p.location_sharing ? (t.position ? 'Active' : 'Searching…') : 'Off'} description={t.gpsError || (p.location_sharing ? 'Location permission is enabled.' : 'Location sharing is off.')} tone={t.gpsError ? 'red' : p.location_sharing ? 'emerald' : 'amber'} />
                <StatCard title="Digital ID" value={t.verification?.digital_id || label(t.verification?.status || 'NOT_SUBMITTED')} description={t.verification?.status === 'VERIFIED' ? 'Identity verified.' : 'Complete verification in your profile.'} tone={t.verification?.status === 'VERIFIED' ? 'emerald' : 'amber'} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <Panel className="lg:col-span-2" title="Current Journey" action={<span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400">{p.location_sharing ? 'Monitoring Active' : 'Monitoring Off'}</span>}>
                    <MapView zones={zones.data || []} me={t.position} height="h-72" />
                    <ZoneLegend />
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Button onClick={toggleGps} disabled={busy} variant={p.location_sharing ? 'secondary' : 'primary'}>{p.location_sharing ? 'Stop sharing location' : 'Share my location'}</Button>
                        <Button variant="secondary" onClick={imSafe}>✅ I'm Safe</Button>
                    </div>
                    {t.live.warnings.length > 0 && <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">{t.live.warnings[0]}</p>}
                </Panel>

                <Panel title="Emergency">
                    <p className="text-sm leading-6 text-slate-400">If you are in danger or need immediate assistance, use the SOS emergency system.</p>
                    <div className="mt-8"><SosButton /></div>
                    <p className="mt-3 text-center text-xs text-slate-500">Emergency alert will be sent to your agency and the response system.</p>
                    <Link to="/tourist/emergency" className="mt-4 block text-center text-sm text-cyan-400 hover:text-cyan-300">Report another issue →</Link>
                </Panel>
            </div>

            <Panel className="mt-8" title="Safety Information">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Item title="Account status" value={<StatusBadge value={p.status} />} />
                    <Item title="Risk score" value={risk?.score != null ? `${risk.score} / 100` : '—'} />
                    <Item title="Nearby Alerts" value={t.live.warnings[0] || 'No Active Alerts'} />
                    <Item title="Why this risk level?" value={(risk?.factors || ['No risk factors detected']).slice(0, 3).join(' • ')} />
                </div>
            </Panel>
        </>
    )
}

function Item({ title, value }) {
    return (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-sm text-slate-400">{title}</p>
            <div className="mt-2 text-sm font-semibold text-slate-200">{value}</div>
        </div>
    )
}

export default TouristDashboard
