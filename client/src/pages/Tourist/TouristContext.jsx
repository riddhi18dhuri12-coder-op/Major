import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { outbox } from '../../lib/offline'
import { useSocket } from '../../hooks/useSocket'
import { useToast } from '../../components/ui'

const Ctx = createContext(null)
// eslint-disable-next-line react-refresh/only-export-components
export const useTourist = () => useContext(Ctx)

const POST_EVERY_MS = 20_000

/**
 * Everything a tourist needs across pages: profile, GPS sharing (with permission), the zone / risk
 * the server reports back, SOS and "I'm Safe" with an offline queue, and live alerts.
 */
export function TouristProvider({ children }) {
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [verification, setVerification] = useState(null)
  const [position, setPosition] = useState(null)
  const [live, setLive] = useState({ zone: null, risk: null, warnings: [], route: null })
  const [gpsError, setGpsError] = useState(null)
  const [pending, setPending] = useState(outbox.count())
  const lastPost = useRef(0)
  const watchId = useRef(null)

  const reload = useCallback(async () => {
    const [p, v] = await Promise.all([api.get('/me/profile'), api.get('/verification/me')])
    setProfile(p)
    setVerification(v)
    setLive((l) => ({ ...l, zone: p.current_zone?.id ? p.current_zone : l.zone, risk: p.risk?.updated_at ? p.risk : l.risk }))
    return p
  }, [])
  useEffect(() => { reload().catch(() => {}) }, [reload])

  // ---- offline outbox -------------------------------------------------------------
  const flush = useCallback(async () => {
    if (!outbox.count()) return
    const n = await outbox.flush((item) => (item.kind === 'sos' ? api.post('/incidents/sos', item.body) : api.post('/safety/check-in', item.body)))
    setPending(outbox.count())
    if (n) { toast(`Sent ${n} saved message${n > 1 ? 's' : ''} from when you were offline.`, 'green'); reload().catch(() => {}) }
  }, [toast, reload])
  useEffect(() => {
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  // ---- GPS sharing ------------------------------------------------------------------
  const send = useCallback(async (pos) => {
    if (Date.now() - lastPost.current < POST_EVERY_MS) return
    lastPost.current = Date.now()
    try {
      const r = await api.post('/location', { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy })
      setLive({ zone: r.zone, risk: r.risk, warnings: r.warnings || [], route: r.route || null })
    } catch { /* offline: the next fix will try again */ }
  }, [])

  const stopWatch = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) return setGpsError('This device does not support GPS.')
    if (watchId.current != null) return
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }
        setPosition(pos); setGpsError(null); send(pos)
      },
      (e) => setGpsError(e.code === 1 ? 'Location permission was denied. Allow it in your browser settings.' : 'Could not get your location.'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
  }, [send])

  useEffect(() => { if (profile?.location_sharing) startWatch(); return stopWatch }, [profile?.location_sharing, startWatch, stopWatch])

  const setSharing = async (enabled) => {
    await api.post('/location/toggle', { enabled })
    setProfile((p) => ({ ...p, location_sharing: enabled }))
    if (!enabled) { stopWatch(); setPosition(null) }
  }

  // ---- actions ---------------------------------------------------------------------
  const sendSos = async () => {
    const body = position ? { latitude: position.latitude, longitude: position.longitude } : {}
    try {
      const inc = await api.post('/incidents/sos', body)
      reload().catch(() => {})
      return { sent: true, incident: inc }
    } catch (e) {
      if (e.status !== 0) throw e
      outbox.add({ kind: 'sos', body }); setPending(outbox.count())
      return { sent: false }
    }
  }

  const checkIn = async () => {
    const body = position ? { latitude: position.latitude, longitude: position.longitude } : {}
    try {
      await api.post('/safety/check-in', body)
      reload().catch(() => {})
      return true
    } catch (e) {
      if (e.status !== 0) throw e
      outbox.add({ kind: 'checkin', body }); setPending(outbox.count())
      return false
    }
  }

  // ---- live alerts from the server ---------------------------------------------------
  useSocket({
    'zone:warning': (d) => { toast(`🚧 ${d.message}`, 'amber'); setLive((l) => ({ ...l, zone: d.zone, warnings: [d.message] })) },
    'route:warning': (d) => { toast(`🧭 ${d.message}`, 'amber') },
    'route:deviation': (d) => { toast(`🧭 ${d.message}`, 'red'); reload().catch(() => {}) },
    'route:back': (d) => { toast(`✅ ${d.message}`, 'green') },
    'risk:warning': (d) => { toast(`⚠️ Your risk level is now ${d.level}: ${d.factors[0]}`, 'amber'); reload().catch(() => {}) },
    'checkin:reminder': (d) => { toast(`🕒 Please tap "I'm Safe" — it has been over ${d.interval_hours} hours.`, 'amber'); reload().catch(() => {}) },
    'travel:overdue': () => { toast('⏰ You are past your expected return time. Open My Journey to check in.', 'red'); reload().catch(() => {}) },
    'verification:updated': (d) => { toast(`🪪 Verification ${d.status.toLowerCase()}${d.digital_id ? ` — your Digital ID is ${d.digital_id}` : ''}`, d.status === 'VERIFIED' ? 'green' : 'amber'); reload().catch(() => {}) },
    'id:validity': (d) => { toast(d.status === 'EXPIRED' ? `🪪 Your Digital ID ${d.digital_id} has expired — your visit has ended.` : `🪪 Your Digital ID ${d.digital_id} is valid again.`, d.status === 'EXPIRED' ? 'amber' : 'green'); reload().catch(() => {}) },
    'incident:updated': () => { toast('Your emergency report was updated.', 'cyan') },
  })

  return <Ctx.Provider value={{ profile, verification, position, live, gpsError, pending, reload, setSharing, sendSos, checkIn, flush }}>{children}</Ctx.Provider>
}
