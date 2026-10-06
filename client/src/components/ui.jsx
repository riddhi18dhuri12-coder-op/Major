import { useEffect, useState, createContext, useContext, useCallback } from 'react'

// ---- Cards / stats -------------------------------------------------------------------
export function StatCard({ title, value, description, tone = 'cyan' }) {
  const text = { cyan: 'text-cyan-400', red: 'text-red-400', amber: 'text-amber-400', emerald: 'text-emerald-400', purple: 'text-purple-400' }[tone]
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${text}`}>{value}</p>
      {description && <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  )
}

export function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900 p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-xl font-semibold">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ---- Badges --------------------------------------------------------------------------
const TONES = {
  green: 'bg-emerald-500/10 text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-400',
  red: 'bg-red-500/10 text-red-400',
  cyan: 'bg-cyan-500/10 text-cyan-400',
  purple: 'bg-purple-500/10 text-purple-400',
  slate: 'bg-slate-700/40 text-slate-300',
}
export function Badge({ tone = 'slate', children }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}

const toneFor = {
  LOW: 'green', MEDIUM: 'amber', HIGH: 'red', CRITICAL: 'red',
  NORMAL: 'green', ATTENTION: 'amber', EMERGENCY: 'red',
  VERIFIED: 'green', PENDING: 'amber', REJECTED: 'red', NOT_SUBMITTED: 'slate',
  NEW: 'red', ACKNOWLEDGED: 'amber', RESPONDING: 'cyan', ON_SITE: 'purple', RESOLVED: 'green', FALSE_ALARM: 'slate',
  AVAILABLE: 'green', DISPATCHED: 'amber', EN_ROUTE: 'cyan', ON_SCENE: 'purple', OFFLINE: 'slate',
  SAFE: 'green', CAUTION: 'amber', DANGER: 'red', RESTRICTED: 'purple', REST_POINT: 'cyan',
  EXPIRED: 'red', UPCOMING: 'slate', ACTIVE: 'cyan', COMPLETED: 'green', OVERDUE: 'red', RETURNED: 'green',
}
export const label = (v) => (v ? String(v).replace(/_/g, ' ').toLowerCase().replace(/^\w|\s\w/g, (c) => c.toUpperCase()) : '-')
export function StatusBadge({ value }) {
  return <Badge tone={toneFor[value] || 'slate'}>{label(value)}</Badge>
}

// ---- Buttons / fields -----------------------------------------------------------------
export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-cyan-500 text-slate-950 hover:bg-cyan-400',
    secondary: 'border border-slate-700 text-slate-200 hover:border-cyan-500 hover:text-cyan-400',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'text-slate-400 hover:text-cyan-400',
  }[variant]
  return <button type="button" {...props} className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} />
}

export function Field({ label: text, hint, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}
export const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400'
export const Input = (props) => <input {...props} className={`${inputClass} ${props.className || ''}`} />
export const Select = ({ children, ...props }) => <select {...props} className={inputClass}>{children}</select>
export const Textarea = (props) => <textarea rows={3} {...props} className={inputClass} />

// ---- Modal ------------------------------------------------------------------------------
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- Tables -----------------------------------------------------------------------------
export function Table({ columns, rows, empty = 'Nothing here yet.', onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-800 text-slate-400">
          <tr>{columns.map((c) => <th key={c.key || c.title} className="px-4 py-3 font-medium">{c.title}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id || i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`border-b border-slate-800 ${onRowClick ? 'cursor-pointer hover:bg-slate-800/40' : ''}`}>
              {columns.map((c) => <td key={c.key || c.title} className="px-4 py-3 text-slate-300">{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Page states --------------------------------------------------------------------------
export const Loading = ({ text = 'Loading…' }) => <p className="py-10 text-center text-sm text-slate-500">{text}</p>
export const ErrorNote = ({ message, onRetry }) => (
  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
    {message} {onRetry && <button onClick={onRetry} className="ml-2 underline">Retry</button>}
  </div>
)
export const Empty = ({ children }) => <p className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">{children}</p>

export const timeAgo = (d) => {
  if (!d) return '-'
  const s = Math.max(0, (Date.now() - new Date(d)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(d).toLocaleDateString()
}

// ---- Toasts --------------------------------------------------------------------------------
const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, tone = 'cyan') => {
    const id = Math.random()
    setItems((x) => [...x.slice(-3), { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 6000)
  }, [])
  const border = { cyan: 'border-cyan-500/40', red: 'border-red-500/60', amber: 'border-amber-500/40', green: 'border-emerald-500/40' }
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[3000] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-lg border bg-slate-900 p-4 text-sm text-slate-200 shadow-lg ${border[t.tone]}`}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
