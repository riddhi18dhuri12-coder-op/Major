import { useState } from 'react'
import DashboardHeader from '../../components/DashboardHeader'
import { Panel, Table, Button, Modal, Field, Input, Loading, ErrorNote, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import { useLoad } from '../../hooks/useLoad'

export default function Guides() {
    const toast = useToast()
    const guides = useLoad(() => api.get('/guides'))
    const [open, setOpen] = useState(false)
    const [f, setF] = useState({ name: '', email: '', phone: '', password: '' })
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

    async function add(e) {
        e.preventDefault()
        try { await api.post('/guides', { ...f, phone: f.phone || undefined }); toast('Guide added', 'green'); setOpen(false); setF({ name: '', email: '', phone: '', password: '' }); guides.reload() } catch (err) { toast(err.message, 'red') }
    }
    async function remove(g) {
        if (!confirm(`Remove ${g.name}? Their trips will become unassigned.`)) return
        try { await api.del(`/guides/${g.id}`); guides.reload() } catch (err) { toast(err.message, 'red') }
    }

    return (
        <>
            <DashboardHeader portal="Travel Agency Portal" title="Guides" description="Tour guides who can sign in to see their assigned trips." />
            <Panel className="mt-8" title={`${guides.data?.length ?? 0} guides`} action={<Button onClick={() => setOpen(true)}>Add Guide</Button>}>
                {guides.loading ? <Loading /> : guides.error ? <ErrorNote message={guides.error} onRetry={guides.reload} /> : (
                    <Table rows={guides.data} empty="No guides yet." columns={[
                        { title: 'Name', render: (g) => <b className="text-slate-200">{g.name}</b> },
                        { title: 'Email', key: 'email' },
                        { title: 'Phone', render: (g) => g.phone || '—' },
                        { title: 'Trips', key: 'trip_count' },
                        { title: '', render: (g) => <Button variant="ghost" onClick={() => remove(g)}>Remove</Button> },
                    ]} />
                )}
            </Panel>
            {open && (
                <Modal title="Add guide" onClose={() => setOpen(false)}>
                    <form onSubmit={add} className="space-y-4">
                        <Field label="Name"><Input required value={f.name} onChange={set('name')} /></Field>
                        <Field label="Email"><Input required type="email" value={f.email} onChange={set('email')} /></Field>
                        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
                        <Field label="Temporary password" hint="At least 8 characters. Share it with the guide."><Input required minLength={8} value={f.password} onChange={set('password')} /></Field>
                        <Button type="submit" className="w-full">Add guide</Button>
                    </form>
                </Modal>
            )}
        </>
    )
}
