import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Button, Field, Input, Select, StatusBadge, Loading, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useTourist } from './TouristContext'
import { useI18n } from '../../lib/i18n'

function DigitalId({ v, p }) {
    const { t: tr, te, date: fmtDay } = useI18n()
    const verified = v.status === 'VERIFIED'
    const validity = verified ? v.id_validity : null
    const expired = validity?.status === 'EXPIRED'
    return (
        <div className={`rounded-2xl border p-6 ${expired ? 'border-red-500/40 bg-slate-900 opacity-80' : verified ? 'border-cyan-500/40 bg-gradient-to-br from-slate-900 to-cyan-950/40' : 'border-slate-800 bg-slate-900'}`}>
            <div className="flex items-start justify-between">
                <div><p className="text-xs uppercase tracking-wider text-cyan-400">{tr('p.idCard')}</p><p className="mt-2 text-2xl font-bold tracking-wide">{v.digital_id || tr('p.notIssued')}</p></div>
                <StatusBadge value={validity ? validity.status : v.status} />
            </div>
            {validity && (
                <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${expired ? 'bg-red-500/10 text-red-300' : validity.status === 'PENDING' ? 'bg-amber-500/10 text-amber-300' : 'bg-cyan-500/10 text-cyan-200'}`}>
                    {expired
                        ? tr('p.expired', { date: fmtDay(validity.valid_until) })
                        : validity.status === 'PENDING'
                            ? tr('p.pendingFrom', { date: fmtDay(validity.valid_from) })
                            : validity.valid_until
                                ? tr('p.validRange', { from: validity.valid_from ? fmtDay(validity.valid_from) : '…', to: fmtDay(validity.valid_until) })
                                : tr('p.validTrip')}
                </p>
            )}
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-slate-500">{tr('common.nameLabel')}</dt><dd className="text-slate-200">{p.name}</dd></div>
                <div><dt className="text-slate-500">{tr('p.tType')}</dt><dd className="text-slate-200">{te(v.tourist_type)}</dd></div>
                <div><dt className="text-slate-500">{tr('p.agencyId')}</dt><dd className="text-slate-200">{p.tourist_code}</dd></div>
                <div><dt className="text-slate-500">{tr('p.document')}</dt><dd className="text-slate-200">{v.document_type ? `${te(v.document_type)} •••• ${v.document_last4}` : '—'}</dd></div>
            </dl>
            {verified && v.proof && (
                <div className="mt-6 border-t border-slate-700 pt-4">
                    <p className="text-xs text-slate-500">{tr('p.proof', { n: v.proof.block_index })}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-400">{v.proof.block_hash}</p>
                </div>
            )}
        </div>
    )
}

function VerifyForm({ v, onDone }) {
    const { t: tr, te } = useI18n()
    const toast = useToast()
    const foreign = v.tourist_type === 'FOREIGN'
    const [f, setF] = useState({ document_type: foreign ? 'PASSPORT' : 'AADHAAR', document_number: '', nationality: '', visa_expiry: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    async function submit(e) {
        e.preventDefault()
        try {
            await api.post('/verification/submit', { document_type: f.document_type, document_number: f.document_number, nationality: f.nationality || undefined, visa_expiry: f.visa_expiry || undefined })
            toast(tr('p.submitted'), 'green'); onDone()
        } catch (err) { toast(err.message, 'red') }
    }
    return (
        <form onSubmit={submit} className="space-y-4">
            {v.status === 'REJECTED' && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{tr('p.rejected', { reason: v.rejection_reason })}</p>}
            <Field label={tr('p.document')}>
                <Select value={f.document_type} onChange={set('document_type')} disabled={foreign}>
                    {(foreign ? ['PASSPORT'] : ['AADHAAR', 'VOTER_ID', 'DRIVING_LICENSE', 'PASSPORT']).map((x) => <option key={x} value={x}>{te(x)}</option>)}
                </Select>
            </Field>
            <Field label={tr('p.docNumber')} hint={tr('p.docHint')}><Input required minLength={5} value={f.document_number} onChange={set('document_number')} autoComplete="off" /></Field>
            {foreign && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tr('p.nationality')}><Input required value={f.nationality} onChange={set('nationality')} /></Field>
                    <Field label={tr('p.visa')}><Input required type="date" value={f.visa_expiry} onChange={set('visa_expiry')} /></Field>
                </div>
            )}
            <p className="text-xs text-slate-500">{tr('p.protoNote')}</p>
            <Button type="submit">{tr('p.submit')}</Button>
        </form>
    )
}

export default function Profile() {
    const t = useTourist()
    const { t: tr } = useI18n()
    if (!t.profile || !t.verification) return <Loading />
    const { profile: p, verification: v } = t
    return (
        <>
            <DashboardHeader portal={tr('portal.tourist')} title={tr('nav.profile')} description={tr('p.desc')} />
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <DigitalId v={v} p={p} />
                <Panel title={tr('p.verify')}>
                    {v.status === 'VERIFIED' && <p className="text-sm text-emerald-400">{tr('p.isVerified')}</p>}
                    {v.status === 'PENDING' && <p className="text-sm text-amber-400">{tr('p.inReview')}</p>}
                    {(v.status === 'NOT_SUBMITTED' || v.status === 'REJECTED') && <VerifyForm v={v} onDone={t.reload} />}
                </Panel>
                <Panel title={tr('p.account')}>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-400">{tr('common.emailLabel')}</dt><dd>{p.email}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">{tr('common.phoneLabel')}</dt><dd>{p.phone || '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">{tr('p.sharing')}</dt><dd>{p.location_sharing ? tr('common.on') : tr('common.off')}</dd></div>
                    </dl>
                </Panel>
                <Panel title={tr('p.privacy')}>
                    <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
                        <li>{tr('p.priv1')}</li>
                        <li>{tr('p.priv2')}</li>
                        <li>{tr('p.priv3')}</li>
                    </ul>
                </Panel>
            </div>
        </>
    )
}
