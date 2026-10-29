import { useState } from 'react'
import { useTourist } from '../pages/Tourist/TouristContext'
import { useI18n } from '../lib/i18n'
import { useToast } from './ui'

/**
 * Consent switch for live GPS tracking. While it is on, the traveller's position is shared with their
 * guide and travel agency (and the authorities in an emergency); turning it off stops the device GPS
 * and the server stops accepting positions. Needs the TouristProvider.
 */
export default function GpsToggle({ compact = false }) {
  const { t } = useI18n()
  const toast = useToast()
  const tourist = useTourist()
  const [busy, setBusy] = useState(false)
  if (!tourist?.profile) return null
  const on = !!tourist.profile.location_sharing
  const status = !on ? t('common.off') : tourist.gpsError ? t(tourist.gpsError) : tourist.position ? t('dash.gpsActive') : t('dash.gpsSearching')
  const tone = !on ? 'text-slate-500' : tourist.gpsError ? 'text-red-400' : 'text-emerald-400'

  async function flip() {
    setBusy(true)
    try { await tourist.setSharing(!on) } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-2 text-sm" title={t('gps.toggleHelp')}>
      <button type="button" role="switch" aria-checked={on} aria-label={t('gps.toggle')} disabled={busy} onClick={flip}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50 ${on ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600 bg-slate-700'}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
      <span className={compact ? 'hidden sm:block' : ''}>
        <span className="block font-medium leading-tight text-slate-200">{t('gps.toggle')}</span>
        <span title={status} className={`block max-w-[10rem] truncate text-xs leading-tight ${tone}`}>{status}</span>
      </span>
    </div>
  )
}
