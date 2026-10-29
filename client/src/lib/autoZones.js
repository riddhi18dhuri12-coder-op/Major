import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

const KEY = 'sts.autoZones'

/** Remembered on/off choice for showing automatic zones (default on). */
export function useAutoZonePref() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })
  const set = useCallback((v) => { setOn(v); try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* storage blocked */ } }, [])
  return [on, set]
}

/**
 * Automatic zones (OpenStreetMap places + incident hotspots) around the traveller, so independent travel is
 * covered where no authority has drawn a zone. Reloads when the traveller moves to a new ~2 km area.
 * Returns { zones, loading, enabled } - enabled is false when the server has the feature switched off.
 */
export function useAutoZones(position, on = true) {
  const [state, setState] = useState({ zones: [], loading: false, enabled: true })
  const lat = position ? Math.round(position.latitude * 50) / 50 : null
  const lon = position ? Math.round(position.longitude * 50) / 50 : null
  useEffect(() => {
    if (!on || lat == null) return undefined
    let live = true
    setState((s) => ({ ...s, loading: true }))
    api.get(`/zones/auto?lat=${lat}&lon=${lon}`)
      .then((r) => live && setState({ zones: r.zones || [], loading: false, enabled: r.enabled !== false }))
      .catch(() => live && setState((s) => ({ ...s, loading: false })))
    return () => { live = false }
  }, [lat, lon, on])
  return on && lat != null ? state : { zones: [], loading: false, enabled: state.enabled }
}
