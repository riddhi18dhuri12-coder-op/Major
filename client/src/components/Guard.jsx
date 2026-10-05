import { Navigate } from 'react-router-dom'
import { useAuth, HOME } from '../lib/auth'
import PortalLayout from './PortalLayout'

/** Only lets the listed roles in; everyone else is sent to login or to their own portal. */
export default function Guard({ roles, portal, children }) {
    const { user } = useAuth()
    if (!user) return <Navigate to="/login" replace />
    if (!roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />
    return <PortalLayout role={portal}>{children}</PortalLayout>
}
