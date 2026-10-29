import { Link } from 'react-router-dom'
import { useAuth, HOME } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import PreferencesBar from './PreferencesBar'

function Navbar() {
    const { user } = useAuth()
    const { t } = useI18n()
    return (
        <header className="border-b border-slate-800 bg-slate-950/95">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
                {/* Logo */}
                <Link to="/" className="group">
                    <h1 className="text-xl font-bold text-cyan-400 transition group-hover:text-cyan-300">
                        {t('app.name')}
                    </h1>

                    <p className="text-xs text-slate-400">
                        {t('app.tagline')}
                    </p>
                </Link>

                {/* Navigation */}
                <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-300 sm:gap-6">
                    <PreferencesBar />
                    <Link to="/" className="hidden transition hover:text-cyan-400 sm:block">
                        {t('nav.home')}
                    </Link>

                    {user ? (
                        <Link to={HOME[user.role]} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-[#020617] transition hover:bg-cyan-400">
                            {t('nav.openDashboard')}
                        </Link>
                    ) : (
                        <Link to="/login" className="transition hover:text-cyan-400">
                            {t('nav.login')}
                        </Link>
                    )}
                </nav>
            </div>
        </header>
    )
}

export default Navbar
