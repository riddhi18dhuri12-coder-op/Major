import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'

function Home() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Common Navbar */}
            <Navbar />

            {/* Hero Section */}
            <main>
                <section className="mx-auto max-w-7xl px-6 py-20">
                    <div className="max-w-3xl">
                        <div className="mb-5 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
                            Smart Tourist Safety Platform
                        </div>

                        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
                            Travel safer with
                            <span className="text-cyan-400">
                                {' '}
                                intelligent protection.
                            </span>
                        </h1>

                        <p className="mt-6 text-lg leading-8 text-slate-400">
                            A unified platform for tourist verification, GPS safety
                            monitoring, geo-fencing, AI-powered risk analysis, SOS alerts,
                            and emergency response coordination.
                        </p>

                        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                            <Link
                                to="/login"
                                className="rounded-lg bg-cyan-500 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-400"
                            >
                                Get Started
                            </Link>

                            <a
                                href="#features"
                                className="rounded-lg border border-slate-700 px-6 py-3 text-center font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-400"
                            >
                                Learn More
                            </a>
                        </div>
                    </div>

                    {/* Feature Cards */}
                    <div id="features" className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        <Feature
                            title="Tourist Safety"
                            description="Monitor journeys and receive safety information during travel."
                        />

                        <Feature
                            title="AI Risk Detection"
                            description="Analyze movement and environmental context to identify potential risks."
                        />

                        <Feature
                            title="Emergency SOS"
                            description="Quickly raise an emergency alert and connect with response teams."
                        />

                        <Feature
                            title="Geo-fencing"
                            description="Identify safe, caution, danger, and restricted zones."
                        />
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-800 px-6 py-6 text-center text-sm text-slate-500">
                Smart Tourist Safety Monitoring & Incident Response System
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
