import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Button, Field, Input, Select, StatusBadge, Loading, label, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useTourist } from './TouristContext'

function DigitalId({ v, p }) {
    const verified = v.status === 'VERIFIED'
    return (
        <div className={`rounded-2xl border p-6 ${verified ? 'border-cyan-500/40 bg-gradient-to-br from-slate-900 to-cyan-950/40' : 'border-slate-800 bg-slate-900'}`}>
            <div className="flex items-start justify-between">
                <div><p className="text-xs uppercase tracking-wider text-cyan-400">Digital Tourist ID</p><p className="mt-2 text-2xl font-bold tracking-wide">{v.digital_id || 'Not issued yet'}</p></div>
                <StatusBadge value={v.status} />
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-slate-500">Name</dt><dd className="text-slate-200">{p.name}</dd></div>
                <div><dt className="text-slate-500">Tourist type</dt><dd className="text-slate-200">{label(v.tourist_type)}</dd></div>
                <div><dt className="text-slate-500">Agency Tourist ID</dt><dd className="text-slate-200">{p.tourist_code}</dd></div>
                <div><dt className="text-slate-500">Document</dt><dd className="text-slate-200">{v.document_type ? `${label(v.document_type)} •••• ${v.document_last4}` : '—'}</dd></div>
            </dl>
            {verified && v.proof && (
                <div className="mt-6 border-t border-slate-700 pt-4">
                    <p className="text-xs text-slate-500">Verification proof (block #{v.proof.block_index}) — only a hash is stored, never your document number.</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-400">{v.proof.block_hash}</p>
                </div>
            )}
        </div>
    )
}

function VerifyForm({ v, onDone }) {
    const toast = useToast()
    const foreign = v.tourist_type === 'FOREIGN'
    const [f, setF] = useState({ document_type: foreign ? 'PASSPORT' : 'AADHAAR', document_number: '', nationality: '', visa_expiry: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    async function submit(e) {
        e.preventDefault()
        try {
            await api.post('/verification/submit', { document_type: f.document_type, document_number: f.document_number, nationality: f.nationality || undefined, visa_expiry: f.visa_expiry || undefined })
            toast('Submitted. Your agency will review it shortly.', 'green'); onDone()
        } catch (err) { toast(err.message, 'red') }
    }
    return (
        <form onSubmit={submit} className="space-y-4">
            {v.status === 'REJECTED' && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Your last submission was rejected: {v.rejection_reason}. Please submit again.</p>}
            <Field label="Document">
                <Select value={f.document_type} onChange={set('document_type')} disabled={foreign}>
                    {(foreign ? ['PASSPORT'] : ['AADHAAR', 'VOTER_ID', 'DRIVING_LICENSE', 'PASSPORT']).map((x) => <option key={x} value={x}>{label(x)}</option>)}
                </Select>
            </Field>
            <Field label="Document number" hint="Stored only as a one-way hash plus the last 4 digits."><Input required minLength={5} value={f.document_number} onChange={set('document_number')} autoComplete="off" /></Field>
            {foreign && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nationality"><Input required value={f.nationality} onChange={set('nationality')} /></Field>
                    <Field label="Visa valid until"><Input required type="date" value={f.visa_expiry} onChange={set('visa_expiry')} /></Field>
                </div>
            )}
            <p className="text-xs text-slate-500">Prototype note: this is a simulated verification reviewed by your agency; it does not query government databases.</p>
            <Button type="submit">Submit for verification</Button>
        </form>
    )
}

export default function Profile() {
    const t = useTourist()
    if (!t.profile || !t.verification) return <Loading />
    const { profile: p, verification: v } = t
    return (
        <>
            <DashboardHeader portal="Tourist Portal" title="Profile" description="Your identity, Digital Tourist ID and privacy settings." />
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <DigitalId v={v} p={p} />
                <Panel title="Identity verification">
                    {v.status === 'VERIFIED' && <p className="text-sm text-emerald-400">✓ You are verified. Your Digital Tourist ID is ready to show to authorities.</p>}
                    {v.status === 'PENDING' && <p className="text-sm text-amber-400">Your documents are being reviewed by your agency.</p>}
                    {(v.status === 'NOT_SUBMITTED' || v.status === 'REJECTED') && <VerifyForm v={v} onDone={t.reload} />}
                </Panel>
                <Panel title="Account">
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd>{p.email}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Phone</dt><dd>{p.phone || '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-400">Location sharing</dt><dd>{p.location_sharing ? 'On' : 'Off'}</dd></div>
                    </dl>
                </Panel>
                <Panel title="Privacy">
                    <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
                        <li>Your location is shared only while you switch it on.</li>
                        <li>Your document number is never stored — only a hash and its last 4 digits.</li>
                        <li>Old GPS points are deleted automatically after 30 days.</li>
                    </ul>
                </Panel>
            </div>
        </>
    )
}
