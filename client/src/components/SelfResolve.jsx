import { useState } from 'react'
import { Panel, Button, Modal, StatusBadge, useToast } from './ui'
import { api } from '../lib/api'
import { useLoad } from '../hooks/useLoad'
import { useSocket } from '../hooks/useSocket'
import { useTourist } from '../pages/Tourist/TouristContext'
import { useI18n } from '../lib/i18n'

/**
 * Shown while the tourist has an open emergency: lets them close it themselves
 * ("problem solved" or "pressed by mistake"), which stops the alert for everyone.
 */
export default function SelfResolve() {
  const { t, te } = useI18n()
  const toast = useToast()
  const tourist = useTourist()
  const open = useLoad(() => api.get('/incidents?active=true'), [tourist?.profile?.status])
  const [ask, setAsk] = useState(null) // { incident, outcome }
  const [busy, setBusy] = useState(false)
  useSocket({ 'incident:updated': open.reload, 'sos:alert': open.reload })

  const list = open.data || []
  if (!list.length) return null

  async function confirm() {
    setBusy(true)
    try {
      await api.put(`/incidents/${ask.incident.id}/self-resolve`, { outcome: ask.outcome })
      toast(t('res.done'), 'green')
      setAsk(null)
      open.reload()
      tourist?.reload?.().catch(() => {})
    } catch (e) { toast(e.message, 'red') } finally { setBusy(false) }
  }

  return (
    <>
      <Panel className="mt-6 border-amber-500/40" title={t('res.title')} subtitle={t('res.desc')}>
        <div className="space-y-3">
          {list.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
              <span><b className="text-slate-200">{i.incident_code}</b> · {te(i.type)} <StatusBadge value={i.status} /></span>
              <span className="flex flex-wrap gap-2">
                <Button onClick={() => setAsk({ incident: i, outcome: 'RESOLVED' })}>{t('res.solved')}</Button>
                <Button variant="secondary" onClick={() => setAsk({ incident: i, outcome: 'FALSE_ALARM' })}>{t('res.mistake')}</Button>
              </span>
            </div>
          ))}
        </div>
      </Panel>
      {ask && (
        <Modal title={t('res.confirmTitle', { code: ask.incident.incident_code })} onClose={() => setAsk(null)}>
          <p className="text-sm leading-6 text-slate-300">{t(ask.outcome === 'RESOLVED' ? 'res.confirmSolved' : 'res.confirmMistake')}</p>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setAsk(null)}>{t('common.cancel')}</Button>
            <Button className="flex-1" disabled={busy} onClick={confirm}>{t('res.confirm')}</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
