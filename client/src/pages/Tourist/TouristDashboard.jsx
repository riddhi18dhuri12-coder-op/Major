import { useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../../components/DashboardHeader'
import MapView, { ZoneLegend, ServiceLegend } from '../../components/MapView'
import SelfResolve from '../../components/SelfResolve'
import { markNearest } from '../../components/NearbyHelp'
import { useNearbyServices } from '../../lib/nearby'
import { StatCard, Panel, Button, Modal, StatusBadge, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useTourist } from './TouristContext'
import { useI18n } from '../../lib/i18n'

const STATUS_COLOR = { NORMAL: 'emerald', ATTENTION: 'amber', EMERGENCY: 'red' }

export function SosButton({ big = true }) {
    const t = useTourist()
    const { t: tr } = useI18n()
    const toast = useToast()
    const [confirm, setConfirm] = useState(false)
    const [busy, setBusy] = useState(false)

    async function send() {
        setBusy(true)
        try {
            const r = await t.sendSos()
            setConfirm(false)
            toast(r.sent ? tr('sos.sent', { code: r.incident.incident_code }) : tr('sos.queued'), r.sent ? 'green' : 'amber')
        } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
    }

    return (
        <>
            <button onClick={() => setConfirm(true)} className={`w-full rounded-lg bg-red-600 font-bold text-[#fff] transition hover:bg-red-500 ${big ? 'px-6 py-4 text-lg' : 'px-4 py-3'} ${t.profile?.status === 'EMERGENCY' ? 'sos-pulse' : ''}`}>
                {tr('sos.button')}
            </button>
            {confirm && (
                <Modal title={tr('sos.title')} onClose={() => setConfirm(false)}>
                    <p className="text-sm leading-6 text-slate-300">
                        {t.position ? tr('sos.bodyLoc') : tr('sos.bodyNoLoc')}
                        {!t.position && <span className="text-amber-400"> {tr('sos.noLocWarn')}</span>}
                    </p>
                    <div className="mt-6 flex gap-3">
                        <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>{tr('common.cancel')}</Button>
                        <Button variant="danger" className="flex-1" disabled={busy} onClick={send}>{busy ? tr('sos.sending') : tr('sos.yes')}</Button>
                    </div>
                </Modal>
            )}
        </>
    )
}

function TouristDashboard() {
    const t = useTourist()
    const { t: tr, te, tm } = useI18n()
    const toast = useToast()
    const zones = useLoad(() => api.get('/zones'))
    const [busy, setBusy] = useState(false)
    const nearby = useNearbyServices(t.position)
    const p = t.profile

    if (!p) return <p className="py-20 text-center text-slate-500">{tr('dash.loading')}</p>

    const statusKey = STATUS_COLOR[p.status] ? p.status : 'NORMAL'
    const statusText = tr(`dash.status.${statusKey}`)
    const statusColor = STATUS_COLOR[statusKey]
    const zone = t.live.zone?.name ? t.live.zone : p.current_zone?.name ? p.current_zone : null
    const risk = t.live.risk || p.risk

    async function toggleGps() {
        setBusy(true)
        try { await t.setSharing(!p.location_sharing) } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
    }
    async function imSafe() {
        try { toast((await t.checkIn()) ? tr('dash.checkedIn') : tr('dash.checkinQueued'), 'green') } catch (e) { toast(e.message, 'red') }
    }

    return (
        <>
            <DashboardHeader portal={tr('portal.tourist')} title={tr('dash.welcome', { name: p.name.split(' ')[0] })} description={tr('dash.desc')} status={statusText} statusColor={statusColor} />

            {p.status === 'EMERGENCY' && <SelfResolve />}

            {t.pending > 0 && (
                <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                    {tr('dash.pending', { n: t.pending })} <button className="underline" onClick={t.flush}>{tr('dash.tryNow')}</button>
                </div>
            )}

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title={tr('dash.zone')} value={zone ? tr('dash.zoneOf', { type: te(zone.type) }) : p.location_sharing ? tr('dash.outside') : tr('dash.unknown')} description={zone ? zone.name : tr('dash.turnOnGps')} tone={zone && ['DANGER', 'RESTRICTED'].includes(zone.type) ? 'red' : zone?.type === 'CAUTION' ? 'amber' : 'cyan'} />
                <StatCard title={tr('dash.riskLevel')} value={te(risk?.level || 'LOW')} description={risk?.factors?.[0] ? tm(risk.factors[0]) : tr('dash.noConcerns')} tone={risk?.level === 'HIGH' || risk?.level === 'CRITICAL' ? 'red' : risk?.level === 'MEDIUM' ? 'amber' : 'emerald'} />
                <StatCard title={tr('dash.gps')} value={p.location_sharing ? (t.position ? tr('dash.gpsActive') : tr('dash.gpsSearching')) : tr('common.off')} description={t.gpsError ? tr(t.gpsError) : (p.location_sharing ? tr('dash.gpsPermOk') : tr('dash.gpsOff'))} tone={t.gpsError ? 'red' : p.location_sharing ? 'emerald' : 'amber'} />
                <StatCard title={tr('dash.digitalId')} value={t.verification?.digital_id || te(t.verification?.status || 'NOT_SUBMITTED')} description={t.verification?.status === 'VERIFIED' ? tr('dash.idVerified') : tr('dash.idComplete')} tone={t.verification?.status === 'VERIFIED' ? 'emerald' : 'amber'} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <Panel className="lg:col-span-2" title={tr('dash.journey')} action={<span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400">{p.location_sharing ? tr('dash.monitoringOn') : tr('dash.monitoringOff')}</span>}>
                    <MapView zones={zones.data || []} me={t.position} services={markNearest(nearby.services)} height="h-72" />
                    <ZoneLegend />
                    {nearby.services.length > 0 && <ServiceLegend />}
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Button onClick={toggleGps} disabled={busy} variant={p.location_sharing ? 'secondary' : 'primary'}>{p.location_sharing ? tr('dash.stopSharing') : tr('dash.shareLocation')}</Button>
                        <Button variant="secondary" onClick={imSafe}>{tr('dash.imSafe')}</Button>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">{tr('gps.toggleHelp')}</p>
                    {t.live.warnings.length > 0 && <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">{tm(t.live.warnings[0])}</p>}
                </Panel>

                <Panel title={tr('dash.emergency')}>
                    <p className="text-sm leading-6 text-slate-400">{tr('dash.emergencyDesc')}</p>
                    <div className="mt-8"><SosButton /></div>
                    <p className="mt-3 text-center text-xs text-slate-500">{tr('dash.emergencyNote')}</p>
                    <Link to="/tourist/emergency" className="mt-4 block text-center text-sm text-cyan-400 hover:text-cyan-300">{tr('dash.reportOther')}</Link>
                </Panel>
            </div>

            <Panel className="mt-8" title={tr('dash.safetyInfo')}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Item title={tr('dash.accountStatus')} value={<StatusBadge value={p.status} />} />
                    <Item title={tr('dash.riskScore')} value={risk?.score != null ? `${risk.score} / 100` : '—'} />
                    <Item title={tr('dash.nearbyAlerts')} value={t.live.warnings[0] ? tm(t.live.warnings[0]) : tr('dash.noAlerts')} />
                    <Item title={tr('dash.whyRisk')} value={(risk?.factors || ['No risk factors detected']).slice(0, 3).map(tm).join(' • ')} />
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
