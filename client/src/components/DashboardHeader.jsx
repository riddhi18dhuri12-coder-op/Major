function DashboardHeader({
    portal,
    title,
    description,
    status = 'System Status: Operational',
    statusColor = 'emerald',
}) {
    const statusStyles = {
        emerald:
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        cyan:
            'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
        amber:
            'border-amber-500/30 bg-amber-500/10 text-amber-400',
        red:
            'border-red-500/30 bg-red-500/10 text-red-400',
    }

    return (
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
                <p className="text-sm text-cyan-400">
                    {portal}
                </p>

                <h1 className="mt-1 text-3xl font-bold">
                    {title}
                </h1>

                <p className="mt-2 text-sm text-slate-400">
                    {description}
                </p>
            </div>

            <div
                className={`rounded-lg border px-4 py-2 text-sm ${statusStyles[statusColor]
                    }`}
            >
                ● {status}
            </div>
        </div>
    )
}

export default DashboardHeader