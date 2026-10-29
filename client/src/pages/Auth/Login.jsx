import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth, HOME, ROLE_LABEL } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import PreferencesBar from '../../components/PreferencesBar'
import { Field, Input, Select } from '../../components/ui'

const TABS = ['signin', 'activate', 'register']

function Login() {
    const { user, login, activateTourist, registerAgency } = useAuth()
    const { t } = useI18n()
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
                <PreferencesBar className="mb-6 justify-center" />
                <div className="mb-8 text-center">
                    <Link to="/"><h1 className="text-3xl font-bold text-cyan-400">{t('app.name')}</h1></Link>
                    <p className="mt-2 text-sm text-slate-400">{t('login.subtitle')}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
                    <div role="tablist" className="mb-6 flex rounded-lg bg-slate-950 p-1 text-xs font-medium">
                        {TABS.map((id) => (
                            <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setError('') }}
                                className={`flex-1 rounded-md px-2 py-2 transition ${tab === id ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}>
                                {t(`login.tab.${id}`)}
                            </button>
                        ))}
                    </div>

                    <h2 className="text-2xl font-semibold">
                        {t(`login.h.${tab}`)}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                        {t(`login.p.${tab}`)}
                    </p>

                    <form onSubmit={submit} className="mt-6 space-y-4">
                        {tab === 'signin' && (
                            <Field label={t('login.signInAs')}>
                                <Select value={f.role} onChange={set('role')}>
                                    {Object.keys(ROLE_LABEL).map((k) => <option key={k} value={k}>{t(`role.${k}`)}</option>)}
                                </Select>
                            </Field>
                        )}
                        {tab === 'register' && <Field label={t('login.agencyName')}><Input required value={f.name} onChange={set('name')} placeholder="Sahyadri Tours" /></Field>}
                        {tab === 'activate' && <Field label={t('login.touristId')}><Input required value={f.tourist_code} onChange={set('tourist_code')} placeholder="TST-2026-00001" /></Field>}

                        <Field label={t('login.email')}><Input required type="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@example.com" /></Field>
                        {tab === 'register' && <Field label={t('login.phoneOpt')}><Input value={f.phone} onChange={set('phone')} /></Field>}
                        <Field label={tab === 'signin' ? t('login.password') : t('login.choosePassword')} hint={tab !== 'signin' ? t('login.min8') : undefined}>
                            <Input required type="password" minLength={tab === 'signin' ? 1 : 8} autoComplete={tab === 'signin' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} placeholder={t('login.passwordPh')} />
                        </Field>

                        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

                        <button type="submit" disabled={busy} className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-[#020617] transition hover:bg-cyan-400 disabled:opacity-60">
                            {busy ? t('login.wait') : t(`login.btn.${tab}`)}
                        </button>
                    </form>

                    {tab === 'signin' && (
                        <p className="mt-6 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
                            {t('login.footer')}{' '}
                            <button onClick={() => setTab('activate')} className="font-semibold text-cyan-400 hover:text-cyan-300">{t('login.footerLink')}</button>
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Login
