import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Table, Button, Modal, Field, Textarea, StatusBadge, Loading, ErrorNote, label, timeAgo, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'
import { useSocket } from '../../hooks/useSocket'

export default function Verification() {
    const toast = useToast()
    const q = useLoad(() => api.get('/verification/pending'))
    const all = useLoad(() => api.get('/tourists'))
    const [rejecting, setRejecting] = useState(null)
    const [reason, setReason] = useState('')
    useSocket({ 'notification:new': (n) => n.type === 'VERIFICATION' && q.reload() })

    async function decide(t, decision, why) {
        try {
            const r = await api.put(`/verification/${t.id}/decision`, { decision, reason: why })
            toast(decision === 'APPROVE' ? `✅ Verified. Digital ID ${r.digital_id} issued.` : 'Verification rejected.', decision === 'APPROVE' ? 'green' : 'amber')
            setRejecting(null); setReason(''); q.reload(); all.reload()
        } catch (e) { toast(e.message, 'red') }
    }

    return (
        <>
            <DashboardHeader portal="Travel Agency Portal" title="Verification" description="Review identity submissions. Approving issues a Digital Tourist ID and records a proof hash." />
            <Panel className="mt-8" title="Pending requests" subtitle="Check the submitted details against the booking before approving.">
                {q.loading ? <Loading /> : q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : (
                    <Table rows={q.data} empty="No requests are waiting. 🎉" columns={[
                        { title: 'Tourist', render: (t) => <span><b className="text-slate-200">{t.name}</b><br /><span className="text-xs text-slate-500">{t.tourist_code}</span></span> },
                        { title: 'Type', render: (t) => `${label(t.tourist_type)}${t.nationality ? ` · ${t.nationality}` : ''}` },
                        { title: 'Document', render: (t) => `${label(t.document_type)} •••• ${t.document_last4}` },
                        { title: 'Visa until', render: (t) => (t.visa_expiry ? new Date(t.visa_expiry).toLocaleDateString() : '—') },
                        { title: 'Submitted', render: (t) => timeAgo(t.submitted_at) },
                        { title: '', render: (t) => (<div className="flex gap-2"><Button onClick={() => decide(t, 'APPROVE')}>Approve</Button><Button variant="secondary" onClick={() => setRejecting(t)}>Reject</Button></div>) },
                    ]} />
                )}
            </Panel>
            <Panel className="mt-6" title="All verification statuses">
                <Table rows={all.data || []} columns={[
                    { title: 'Tourist', key: 'name' },
                    { title: 'Digital ID', render: (t) => t.digital_id || '—' },
                    { title: 'Status', render: (t) => <StatusBadge value={t.verification?.status || 'NOT_SUBMITTED'} /> },
                ]} />
            </Panel>
            {rejecting && (
                <Modal title={`Reject ${rejecting.name}?`} onClose={() => setRejecting(null)}>
                    <Field label="Reason (shown to the tourist)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Document photo is unreadable" /></Field>
                    <Button variant="danger" className="mt-4 w-full" disabled={!reason.trim()} onClick={() => decide(rejecting, 'REJECT', reason.trim())}>Reject verification</Button>
                </Modal>
            )}
        </>
    )
}
