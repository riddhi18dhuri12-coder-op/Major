import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth, HOME, ROLE_LABEL } from '../../lib/auth'
import { Field, Input, Select } from '../../components/ui'

const TABS = [
    { id: 'signin', label: 'Sign in' },
    { id: 'activate', label: 'Tourist activation' },
    { id: 'register', label: 'Register agency' },
]

function Login() {
    const { user, login, activateTourist, registerAgency } = useAuth()
    const navigate = useNavigate()
    const [tab, setTab] = useState('signin')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [f, setF] = useState({ role: 'tourist', email: '', password: '', tourist_code: '', name: '', phone: '' })
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

    if (user) return <Navigate to={HOME[user.role]} replace />

    async function submit(e) {
        e.preventDefault()
        setError(''); setBusy(true)
        try {
            let u
            if (tab === 'signin') u = await login(f.email, f.password, f.role)
            else if (tab === 'activate') u = await activateTourist({ tourist_code: f.tourist_code, email: f.email, password: f.password })
            else u = await registerAgency({ name: f.name, email: f.email, phone: f.phone || undefined, password: f.password })
            navigate(HOME[u.role], { replace: true })
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <Link to="/"><h1 className="text-3xl font-bold text-cyan-400">Smart Tourist Safety</h1></Link>
                    <p className="mt-2 text-sm text-slate-400">Secure access to the safety monitoring platform</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
                    <div role="tablist" className="mb-6 flex rounded-lg bg-slate-950 p-1 text-xs font-medium">
                        {TABS.map((t) => (
                            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setError('') }}
                                className={`flex-1 rounded-md px-2 py-2 transition ${tab === t.id ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <h2 className="text-2xl font-semibold">
                        {tab === 'signin' ? 'Welcome Back' : tab === 'activate' ? 'Activate your account' : 'Register your agency'}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                        {tab === 'signin' && 'Sign in to continue to your account.'}
                        {tab === 'activate' && 'Your travel agency registered you. Enter your Tourist ID and the email they used to set a password.'}
                        {tab === 'register' && 'Create an agency account to register tourists and manage trips.'}
                    </p>

                    <form onSubmit={submit} className="mt-6 space-y-4">
                        {tab === 'signin' && (
                            <Field label="Sign in as">
                                <Select value={f.role} onChange={set('role')}>
                                    {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                            </Field>
                        )}
                        {tab === 'register' && <Field label="Agency name"><Input required value={f.name} onChange={set('name')} placeholder="Sahyadri Tours" /></Field>}
                        {tab === 'activate' && <Field label="Tourist ID"><Input required value={f.tourist_code} onChange={set('tourist_code')} placeholder="TST-2026-00001" /></Field>}

                        <Field label="Email address"><Input required type="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@example.com" /></Field>
                        {tab === 'register' && <Field label="Phone (optional)"><Input value={f.phone} onChange={set('phone')} /></Field>}
                        <Field label={tab === 'signin' ? 'Password' : 'Choose a password'} hint={tab !== 'signin' ? 'At least 8 characters.' : undefined}>
                            <Input required type="password" minLength={tab === 'signin' ? 1 : 8} autoComplete={tab === 'signin' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} placeholder="Enter your password" />
                        </Field>

                        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

                        <button type="submit" disabled={busy} className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60">
                            {busy ? 'Please wait…' : tab === 'signin' ? 'Sign In' : tab === 'activate' ? 'Activate & Sign In' : 'Create Agency Account'}
                        </button>
                    </form>

                    {tab === 'signin' && (
                        <p className="mt-6 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
                            Tourists are registered by their travel agency.{' '}
                            <button onClick={() => setTab('activate')} className="font-semibold text-cyan-400 hover:text-cyan-300">Activate your account</button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Login
