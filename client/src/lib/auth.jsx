import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, session, setLogoutHandler } from './api'

const AuthContext = createContext(null)

// Where each role lands after sign-in, and which URL prefix it owns.
export const HOME = { tourist: '/tourist', company: '/agency', guide: '/agency', authority: '/authority', responder: '/emergency' }
export const ROLE_LABEL = { tourist: 'Tourist', company: 'Travel Agency', guide: 'Tour Guide', authority: 'Authority', responder: 'Response Team' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.get()?.user || null)

  const finish = useCallback((data) => {
    session.set({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const s = session.get()
    session.clear()
    setUser(null)
    if (s?.refresh_token) api.open('/auth/logout', { refresh_token: s.refresh_token }).catch(() => {})
  }, [])

  useEffect(() => { setLogoutHandler(() => setUser(null)) }, [])

  const value = useMemo(() => ({
    user,
    login: async (email, password, role) => finish(await api.open('/auth/login', { email, password, role })),
    registerAgency: async (payload) => finish(await api.open('/auth/register-company', payload)),
    activateTourist: async (payload) => finish(await api.open('/auth/activate-tourist', payload)),
    logout,
  }), [user, finish, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
