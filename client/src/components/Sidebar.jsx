import { NavLink } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export const menuItems = {
    tourist: [
        { key: 'nav.dashboard', label: 'Dashboard', path: '/tourist' },
        { key: 'nav.journey', label: 'My Journey', path: '/tourist/journey' },
        { key: 'nav.zones', label: 'Safety Zones', path: '/tourist/safety' },
        { key: 'nav.sos', label: 'Emergency / SOS', path: '/tourist/emergency' },
        { key: 'nav.profile', label: 'Profile', path: '/tourist/profile' },
    ],

    agency: [
        { label: 'Dashboard', path: '/agency' },
        { label: 'Tourists', path: '/agency/tourists' },
        { label: 'Verification', path: '/agency/verification', roles: ['company'] },
        { label: 'Trips', path: '/agency/trips' },
        { label: 'Guides', path: '/agency/guides', roles: ['company'] },
        { label: 'Alerts', path: '/agency/alerts' },
    ],

    authority: [
        { label: 'Dashboard', path: '/authority' },
        { label: 'Tourists', path: '/authority/tourists' },
        { label: 'Incidents', path: '/authority/incidents' },
        { label: 'Safety Zones', path: '/authority/zones' },
        { label: 'Response Units', path: '/authority/units' },
        { label: 'Analytics', path: '/authority/analytics' },
    ],

    emergency: [
        { label: 'Dashboard', path: '/emergency' },
        { label: 'Active Incidents', path: '/emergency/incidents' },
        { label: 'My Unit', path: '/emergency/units' },
        { label: 'Operations Map', path: '/emergency/map' },
    ],
}

const roleTitles = {
    tourist: 'Tourist Portal', // translated at display time with portalTitle()
    agency: 'Agency Portal',
    authority: 'Authority Portal',
    emergency: 'Emergency Response',
}

/** Portal title in the current language (only the tourist portal is translated so far). */
export const usePortalTitle = () => { const { t } = useI18n(); return (role) => (role === 'tourist' ? t('portal.tourist') : roleTitles[role]) }

export function NavItems({ role, userRole, onNavigate }) {
    const { t } = useI18n()
    const items = (menuItems[role] || []).filter((i) => !i.roles || i.roles.includes(userRole))
    return (
        <nav className="mt-6 space-y-2">
            {items.map((item) => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === `/${role}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        `block rounded-lg px-4 py-3 text-sm font-medium transition ${isActive
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                        }`
                    }
                >
                    {item.key ? t(item.key) : item.label}
                </NavLink>
            ))}
        </nav>
    )
}

function Sidebar({ role, userRole }) {
    const { t } = useI18n()
    const title = usePortalTitle()
    return (
        <aside className="hidden min-h-screen w-64 shrink-0 border-r border-slate-800 bg-slate-950 lg:block">
            <div className="sticky top-0 p-5">
                {/* Sidebar Header */}
                <div className="border-b border-slate-800 pb-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">
                        {t('app.name')}
                    </p>

                    <h2 className="mt-2 text-lg font-semibold text-white">
                        {title(role)}
                    </h2>
                </div>

                <NavItems role={role} userRole={userRole} />
            </div>
        </aside>
    )
}

export { roleTitles }
export default Sidebar
