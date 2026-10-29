import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { useI18n } from '../../lib/i18n'

function Home() {
    const { t } = useI18n()
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Common Navbar */}
            <Navbar />

            {/* Hero Section */}
            <main>
                <section className="mx-auto max-w-7xl px-6 py-20">
                    <div className="max-w-3xl">
                        <div className="mb-5 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
                            {t('home.badge')}
                        </div>

                        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
                            {t('home.title1')}
                            <span className="text-cyan-400">
                                {' '}
                                {t('home.title2')}
                            </span>
                        </h1>

                        <p className="mt-6 text-lg leading-8 text-slate-400">
                            {t('home.desc')}
                        </p>

                        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                            <Link
                                to="/login"
                                className="rounded-lg bg-cyan-500 px-6 py-3 text-center font-semibold text-[#020617] transition hover:bg-cyan-400"
                            >
                                {t('home.start')}
                            </Link>

                            <a
                                href="#features"
                                className="rounded-lg border border-slate-700 px-6 py-3 text-center font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-400"
                            >
                                {t('home.learn')}
                            </a>
                        </div>
                    </div>

                    {/* Feature Cards */}
                    <div id="features" className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        <Feature
                            title={t('home.f1.title')}
                            description={t('home.f1.desc')}
                        />

                        <Feature
                            title={t('home.f2.title')}
                            description={t('home.f2.desc')}
                        />

                        <Feature
                            title={t('home.f3.title')}
                            description={t('home.f3.desc')}
                        />

                        <Feature
                            title={t('home.f4.title')}
                            description={t('home.f4.desc')}
                        />
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-800 px-6 py-6 text-center text-sm text-slate-500">
                {t('app.fullName')}
            </footer>
        </div>
    )
}

function Feature({ title, description }) {
    return (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 transition hover:border-cyan-500/50">
            <h2 className="text-lg font-semibold text-cyan-400">
                {title}
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-400">
                {description}
            </p>
        </div>
    )
}

export default Home
