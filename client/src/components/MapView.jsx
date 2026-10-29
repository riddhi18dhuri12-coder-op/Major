import { MapContainer, TileLayer, Circle, Polygon, Polyline, CircleMarker, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useEffect } from 'react'
import { useI18n } from '../lib/i18n'

export const ZONE_COLORS = { SAFE: '#10b981', CAUTION: '#f59e0b', DANGER: '#ef4444', RESTRICTED: '#a855f7', REST_POINT: '#06b6d4' }
const RISK_COLORS = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444', CRITICAL: '#dc2626' }
const UNIT_COLORS = { AVAILABLE: '#10b981', DISPATCHED: '#f59e0b', EN_ROUTE: '#06b6d4', ON_SCENE: '#a855f7', OFFLINE: '#64748b' }

const icon = (emoji, bg) =>
  L.divIcon({ className: '', html: `<div style="background:${bg};width:30px;height:30px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.5)">${emoji}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })

// Hospitals: white disc with a red cross. Police stations: navy disc with a shield. The nearest of each gets a pulsing ring.
const SERVICE = {
  hospital: { label: 'Hospital', svg: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#dc2626"/></svg>', bg: '#ffffff', border: '#dc2626' },
  police: { label: 'Police station', svg: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="#fff"/><path d="M12 7l1.2 2.7 2.9.3-2.2 1.9.7 2.8L12 13.2 9.4 14.7l.7-2.8L7.9 10l2.9-.3z" fill="#1d4ed8"/></svg>', bg: '#1d4ed8', border: '#1e3a8a' },
}
const serviceIcon = (kind, nearest) => {
  const c = SERVICE[kind], size = nearest ? 38 : 30
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="${nearest ? 'service-nearest' : ''}" style="background:${c.bg};width:${size}px;height:${size}px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:3px solid ${c.border};box-shadow:0 2px 6px rgba(0,0,0,.5)">${c.svg}</div>` })
}

function Clicker({ onClick }) {
  useMapEvents({ click: (e) => onClick?.({ latitude: e.latlng.lat, longitude: e.latlng.lng }) })
  return null
}
function Fit({ points, focus }) {
  const map = useMap()
  useEffect(() => {
    if (focus) return map.setView([focus.latitude, focus.longitude], Math.max(map.getZoom(), 14))
    if (points.length === 1) map.setView([points[0].latitude, points[0].longitude], 14)
    else if (points.length > 1) map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [40, 40], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, focus?.latitude, focus?.longitude])
  return null
}

/**
 * One map used by every portal.
 * zones: authority-defined areas | tourists: { id,name,tourist_code,last_location,risk } | incidents | units | me: this user's position
 * onMapClick: pick a point (zone creation). draft: zone being drawn.
 * lines: planned routes to draw, [{ id, points: [{latitude, longitude}], color?, dashed?, name? }]. markers: extra labelled points [{ id, latitude, longitude, label, emoji? }].
 */
export default function MapView({ zones = [], tourists = [], incidents = [], units = [], me = null, draft = null, lines = [], markers = [], services = [], onMapClick, onSelectIncident, height = 'h-80', focus = null, fit = true }) {
  const located = tourists.filter((t) => t.last_location?.latitude != null)
  const incLoc = incidents.filter((i) => i.latitude != null)
  const unitLoc = units.filter((u) => u.location?.latitude != null)
  const pts = [...located.map((t) => t.last_location), ...incLoc, ...unitLoc.map((u) => u.location), ...(me ? [me] : []), ...services.filter((x) => x.nearest), ...lines.flatMap((l) => l.points), ...markers]
  const center = pts[0] ? [pts[0].latitude, pts[0].longitude] : [18.9, 73.2] // Maharashtra by default

  return (
    <div className={`relative z-0 ${height} overflow-hidden rounded-lg border border-slate-800`}>
      <MapContainer center={center} zoom={9} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {fit && <Fit points={pts} focus={focus} />}
        {onMapClick && <Clicker onClick={onMapClick} />}

        {zones.map((z) => {
          const color = ZONE_COLORS[z.type]
          const style = { color, weight: 2, fillOpacity: z.active === false ? 0.04 : 0.18, dashArray: z.active === false ? '6 6' : undefined }
          const popup = <Popup><b>{z.name}</b><br />{z.type.replace('_', ' ')}{z.description ? <><br />{z.description}</> : null}</Popup>
          return z.shape.kind === 'CIRCLE'
            ? <Circle key={z.id} center={[z.shape.center.latitude, z.shape.center.longitude]} radius={z.shape.radius_m} pathOptions={style}>{popup}</Circle>
            : <Polygon key={z.id} positions={z.shape.polygon.map((p) => [p.latitude, p.longitude])} pathOptions={style}>{popup}</Polygon>
        })}

        {lines.map((l) => l.points?.length > 1 && (
          <Polyline key={l.id} positions={l.points.map((p) => [p.latitude, p.longitude])} pathOptions={{ color: l.color || '#22d3ee', weight: 5, opacity: 0.85, dashArray: l.dashed ? '8 8' : undefined }}>
            {l.name && <Popup>{l.name}</Popup>}
          </Polyline>
        ))}
        {markers.map((m) => <Marker key={m.id} position={[m.latitude, m.longitude]} icon={icon(m.emoji || '📍', '#0891b2')}><Popup>{m.label}</Popup></Marker>)}

        {draft?.center && <Circle center={[draft.center.latitude, draft.center.longitude]} radius={draft.radius_m || 100} pathOptions={{ color: '#22d3ee', dashArray: '4 6', fillOpacity: 0.12 }} />}
        {draft?.polygon?.length > 0 && <Polygon positions={draft.polygon.map((p) => [p.latitude, p.longitude])} pathOptions={{ color: '#22d3ee', dashArray: '4 6', fillOpacity: 0.12 }} />}

        {located.map((t) => (
          <CircleMarker key={t.id} center={[t.last_location.latitude, t.last_location.longitude]} radius={t.status === 'EMERGENCY' ? 11 : 8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: t.status === 'EMERGENCY' ? '#dc2626' : RISK_COLORS[t.risk?.level || 'LOW'], fillOpacity: 1 }}>
            <Popup><b>{t.name}</b> ({t.tourist_code})<br />Risk: {t.risk?.level || 'LOW'} {t.risk?.score != null ? `(${t.risk.score}/100)` : ''}<br />{t.current_zone?.name ? `Zone: ${t.current_zone.name}` : 'Outside mapped zones'}</Popup>
          </CircleMarker>
        ))}

        {incLoc.map((i) => (
          <Marker key={i.id} position={[i.latitude, i.longitude]} icon={icon(i.type === 'SOS' ? '🆘' : '⚠️', '#dc2626')} eventHandlers={{ click: () => onSelectIncident?.(i) }}>
            <Popup><b>{i.incident_code}</b> · {i.type}<br />{i.tourist_name} · {i.status}</Popup>
          </Marker>
        ))}

        {unitLoc.map((u) => (
          <Marker key={u.id} position={[u.location.latitude, u.location.longitude]} icon={icon({ POLICE: '🚓', RESCUE: '🚒', MEDICAL: '🚑', LOCAL: '🛟' }[u.type] || '🚒', UNIT_COLORS[u.status])}>
            <Popup><b>{u.name}</b><br />{u.type} · {u.status}</Popup>
          </Marker>
        ))}

        {services.map((x) => (
          <Marker key={x.id} position={[x.latitude, x.longitude]} zIndexOffset={x.nearest ? 800 : 400} icon={serviceIcon(x.kind, x.nearest)}>
            <Popup><b>{x.name || SERVICE[x.kind].label}</b><br />{SERVICE[x.kind].label}{x.distance_m != null ? ` · ${(x.distance_m / 1000).toFixed(1)} km` : ''}<br /><a href={`https://www.google.com/maps/dir/?api=1&destination=${x.latitude},${x.longitude}`} target="_blank" rel="noreferrer">Directions</a></Popup>
          </Marker>
        ))}

        {me && <Marker position={[me.latitude, me.longitude]} icon={icon('📍', '#0891b2')}><Popup>You are here</Popup></Marker>}
      </MapContainer>
    </div>
  )
}

export function ServiceLegend() {
  const { t } = useI18n()
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
      <span className="flex items-center gap-2"><i className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-red-600 bg-[#fff] text-[10px] font-black leading-none text-red-600">+</i>{t('near.hospital')}</span>
      <span className="flex items-center gap-2"><i className="inline-block h-4 w-4 rounded-full border-2 border-blue-900 bg-blue-700" />{t('near.police')}</span>
    </div>
  )
}

export function ZoneLegend() {
  const { te } = useI18n()
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
      {Object.entries(ZONE_COLORS).map(([k, c]) => (
        <span key={k} className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-full" style={{ background: c }} />{te(k)}</span>
      ))}
    </div>
  )
}
