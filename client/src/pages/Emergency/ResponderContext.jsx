import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useSocket } from '../../hooks/useSocket'
import { useToast } from '../../components/ui'

const Ctx = createContext(null)
// eslint-disable-next-line react-refresh/only-export-components
export const useResponder = () => useContext(Ctx)

/** The response unit, its assigned incidents, and (optionally) live position reporting. */
export function ResponderProvider({ children }) {
  const toast = useToast()
  const [unit, setUnit] = useState(null)
  const [incidents, setIncidents] = useState(null)
  const [position, setPosition] = useState(null)
  const [tracking, setTracking] = useState(false)
  const last = useRef(0)

  const reload = useCallback(async () => {
    const [u, i] = await Promise.all([api.get('/responder/me'), api.get('/incidents')])
    setUnit(u); setIncidents(i)
  }, [])
  useEffect(() => { reload().catch(() => {}) }, [reload])

  useSocket({
    'incident:assigned': (i) => { toast(`🚨 New assignment: ${i.incident_code}`, 'red'); reload() },
    'incident:updated': reload,
    'incident:unassigned': () => { toast('An incident was reassigned to another unit.', 'amber'); reload() },
  })

  useEffect(() => {
    if (!tracking || !('geolocation' in navigator)) return undefined
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { latitude: p.coords.latitude, longitude: p.coords.longitude }
        setPosition(pos)
        if (Date.now() - last.current > 30_000) { last.current = Date.now(); api.put('/responder/location', pos).catch(() => {}) }
      },
      () => { toast('Could not read your location.', 'amber'); setTracking(false) },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [tracking, toast])

  return <Ctx.Provider value={{ unit, incidents, position, tracking, setTracking, reload }}>{children}</Ctx.Provider>
}
