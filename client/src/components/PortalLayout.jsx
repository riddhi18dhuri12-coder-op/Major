import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar, { NavItems, usePortalTitle } from './Sidebar'
import PreferencesBar from './PreferencesBar'
import GpsToggle from './GpsToggle'
import { useI18n } from '../lib/i18n'
import { Modal, useToast, timeAgo } from './ui'
import { useAuth } from '../lib/auth'
import { useSocket } from '../hooks/useSocket'
import ErrorBoundary from './ErrorBoundary'
import { api } from '../lib/api'

const ICON = { SOS: '🆘', OVERDUE_TRAVEL: '⏰', STALE_LOCATION: '📡', MISSED_CHECKIN: '🕒', ZONE_ALERT: '🚧', HIGH_RISK: '⚠️', VERIFICATION: '🪪', ID_EXPIRED: '🪪', ID_RENEWED: '🪪', ROUTE_DEVIATION: '🧭' }

function NotificationBell() {
    const toast = useToast()
    const [list, setList] = useState([])
    const [open, setOpen] = useState(false)

    const load = useCallback(() => api.get('/notifications').then(setList).catch(() => {}), [])
    useEffect(() => { load() }, [load])

    useSocket({
        'notification:new': (n) => {
            setList((l) => [n, ...l].slice(0, 50))
            toast(`${ICON[n.type] || '🔔'} ${n.message}`, n.type === 'SOS' ? 'red' : 'amber')
        },
    })

    const unread = list.filter((n) => !n.read).length
    const markAll = async () => { await api.put('/notifications/read-all').catch(() => {}); setList((l) => l.map((n) => ({ ...n, read: true }))) }

    return (
        <>
            <button onClick={() => setOpen(true)} aria-label={`Notifications, ${unread} unread`} className="relative rounded-lg border border-slate-800 px-3 py-2 text-lg hover:border-cyan-500">
                🔔
                {unread > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-[#fff]">{unread}</span>}
            </button>
            {open && (
                <Modal title="Notifications" onClose={() => setOpen(false)}>
                    <div className="max-h-96 space-y-2 overflow-y-auto">
                        {list.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No notifications.</p>}
                        {list.map((n) => (
                            <div key={n.id} className={`rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm ${n.read ? 'opacity-60' : ''}`}>
                                <span className="mr-2">{ICON[n.type] || '🔔'}</span>{n.message}
                                <div className="mt-1 text-xs text-slate-500">{timeAgo(n.created_at)}</div>
                            </div>
                        ))}
                    </div>
                    <button onClick={markAll} className="mt-4 w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-500">Mark all read</button>
                </Modal>
            )}
        </>
    )
}

/** Sidebar + top bar shared by every portal page. */
export default function PortalLayout({ role, children }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [menu, setMenu] = useState(false)
    const { t } = useI18n()
    const title = usePortalTitle()
    const hasBell = user.role !== 'tourist' && user.role !== 'responder'

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="flex">
                <Sidebar role={role} userRole={user.role} />

                <main className="min-w-0 flex-1">
                    <div className="sticky top-0 z-[1000] flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-6 py-3 backdrop-blur">
                        <button onClick={() => setMenu(true)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 lg:hidden" aria-label={t('common.openMenu')}>{t('common.menu')}</button>
                        <span className="hidden text-sm text-slate-500 lg:block">{title(role)}</span>
                        <div className="flex flex-wrap items-center gap-3">
                            {user.role === 'tourist' && <GpsToggle compact />}
                            <PreferencesBar />
                            {hasBell && <NotificationBell />}
                            <div className="hidden text-right text-xs sm:block">
                                <p className="font-medium text-slate-200">{user.name}</p>
                                <p className="text-slate-500">{t(`role.${user.role}`)}</p>
                            </div>
                            <button onClick={async () => { await logout(); navigate('/login') }} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-red-500 hover:text-red-400">{t('common.signOut')}</button>
                        </div>
                    </div>

                    <div className="mx-auto max-w-7xl px-6 py-8"><ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary></div>
                </main>
            </div>

            {menu && (
                <Modal title={title(role)} onClose={() => setMenu(false)}>
                    <NavItems role={role} userRole={user.role} onNavigate={() => setMenu(false)} />
                </Modal>
            )}
        </div>
    )
}
