import { Fragment } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, HOME } from '../lib/auth'
import PortalLayout from './PortalLayout'

/** Only lets the listed roles in; everyone else is sent to login or to their own portal. */
export default function Guard({ roles, portal, wrap: Wrap = Fragment, children }) {
    const { user } = useAuth()
    if (!user) return <Navigate to="/login" replace />
    if (!roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />
    // `wrap` is a context provider that must also cover the layout (e.g. the tourist's GPS switch in the top bar)
    return <Wrap><PortalLayout role={portal}>{children}</PortalLayout></Wrap>
}
