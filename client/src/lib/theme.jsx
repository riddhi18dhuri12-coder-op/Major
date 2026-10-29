import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const KEY = 'sts.theme'
const Ctx = createContext({ theme: 'dark', setTheme: () => {}, toggle: () => {} })
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(Ctx)

function initial() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage blocked */ }
  try { if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light' } catch { /* no matchMedia */ }
  return 'dark'
}

/** Dark / light theme. Remembered on the device; with no saved choice the OS preference is used. */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#020617')
  }, [theme])
  const setTheme = useCallback((t) => {
    setThemeState(t)
    try { localStorage.setItem(KEY, t) } catch { /* storage blocked */ }
  }, [])
  const toggle = useCallback(() => setTheme(theme === 'light' ? 'dark' : 'light'), [theme, setTheme])
  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
