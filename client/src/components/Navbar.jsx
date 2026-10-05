import { Link } from 'react-router-dom'
import { useAuth, HOME } from '../lib/auth'

function Navbar() {
    const { user } = useAuth()
    return (
        <header className="border-b border-slate-800 bg-slate-950/95">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                {/* Logo */}
                <Link to="/" className="group">
                    <h1 className="text-xl font-bold text-cyan-400 transition group-hover:text-cyan-300">
                        Smart Tourist Safety
                    </h1>

                    <p className="text-xs text-slate-400">
                        Monitoring & Incident Response System
                    </p>
                </Link>

                {/* Navigation */}
                <nav className="flex items-center gap-6 text-sm text-slate-300">
                    <Link to="/" className="hidden transition hover:text-cyan-400 sm:block">
                        Home
                    </Link>

                    {user ? (
                        <Link to={HOME[user.role]} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-400">
                            Open Dashboard
                        </Link>
                    ) : (
                        <Link to="/login" className="transition hover:text-cyan-400">
                            Login
                        </Link>
                    )}
                </nav>
            </div>
        </header>
    )
}

export default Navbar
