import { useEffect, useState } from 'react'

// Hospitals and police stations come from OpenStreetMap (Overpass API): free, no key, and CORS-enabled.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
export const RADIUS_M = 6000
const TTL_MS = 24 * 3600 * 1000
const inflight = new Map()

const cell = (p) => `${(Math.round(p.latitude * 50) / 50).toFixed(2)},${(Math.round(p.longitude * 50) / 50).toFixed(2)}` // ~2 km grid

export function distanceM(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Overpass JSON -> [{ id, kind: 'hospital' | 'police', name, latitude, longitude }] */
export function parseOverpass(json) {
  const seen = new Set()
  const out = []
  for (const el of json?.elements || []) {
    const kind = el.tags?.amenity === 'hospital' ? 'hospital' : el.tags?.amenity === 'police' ? 'police' : null
    const latitude = el.lat ?? el.center?.lat, longitude = el.lon ?? el.center?.lon
    if (!kind || latitude == null || longitude == null) continue
    const id = `${el.type}/${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, kind, name: el.tags.name || el.tags['name:en'] || null, latitude, longitude })
  }
  return out
}

const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && Date.now() - v.at < TTL_MS ? v.items : null } catch { return null } }
const write = (k, items) => { try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), items })) } catch { /* storage full or blocked */ } }

async function query(pos) {
  const q = `[out:json][timeout:20];(nwr["amenity"="hospital"](around:${RADIUS_M},${pos.latitude},${pos.longitude});nwr["amenity"="police"](around:${RADIUS_M},${pos.latitude},${pos.longitude}););out center tags 80;`
  let lastErr
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(q)}` })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return parseOverpass(await r.json())
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

/** Nearest hospitals / police stations around a position. Cached for a day per ~2 km cell, so it also works after losing signal. */
export async function loadNearby(pos) {
  const key = `sts.nearby.${cell(pos)}`
  const cached = read(key)
  if (cached) return cached
  if (!inflight.has(key)) inflight.set(key, query(pos).then((items) => { write(key, items); return items }).finally(() => inflight.delete(key)))
  return inflight.get(key)
}

export const withDistance = (items, pos) => items.map((s) => ({ ...s, distance_m: distanceM(pos, s) })).sort((a, b) => a.distance_m - b.distance_m)

/** React hook: { services (nearest first, with distance_m), loading, error } */
export function useNearbyServices(position) {
  const [state, setState] = useState({ items: null, loading: false, error: false })
  const lat = position ? Math.round(position.latitude * 50) / 50 : null
  const lon = position ? Math.round(position.longitude * 50) / 50 : null
  useEffect(() => {
    if (lat == null) return undefined
    let live = true
    setState((s) => ({ ...s, loading: true, error: false }))
    loadNearby({ latitude: lat, longitude: lon })
      .then((items) => live && setState({ items, loading: false, error: false }))
      .catch(() => live && setState({ items: null, loading: false, error: true }))
    return () => { live = false }
  }, [lat, lon])
  const services = position && state.items ? withDistance(state.items, position) : []
  return { services, loading: state.loading, error: state.error }
}

export const directionsUrl = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`
