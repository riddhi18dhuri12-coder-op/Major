import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Everything in the interface is sized in rem, so changing the root font size scales all text (and spacing with it).
export const TEXT_STEPS = [85, 100, 115, 130, 150, 175]
const KEY = 'sts.textSize'

const read = () => {
  try { const n = Number(localStorage.getItem(KEY)); return TEXT_STEPS.includes(n) ? n : 100 } catch { return 100 }
}

const Ctx = createContext({ percent: 100, bigger: () => {}, smaller: () => {}, reset: () => {}, canBigger: false, canSmaller: false })

export function TextSizeProvider({ children }) {
  const [percent, setPercent] = useState(read)

  useEffect(() => {
    document.documentElement.style.fontSize = percent === 100 ? '' : `${percent}%`
    try { localStorage.setItem(KEY, String(percent)) } catch { /* not persisted */ }
  }, [percent])

  const step = useCallback((d) => setPercent((p) => TEXT_STEPS[Math.min(TEXT_STEPS.length - 1, Math.max(0, TEXT_STEPS.indexOf(p) + d))]), [])
  const value = useMemo(() => ({
    percent, bigger: () => step(1), smaller: () => step(-1), reset: () => setPercent(100),
    canBigger: percent < TEXT_STEPS.at(-1), canSmaller: percent > TEXT_STEPS[0],
  }), [percent, step])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTextSize = () => useContext(Ctx)
