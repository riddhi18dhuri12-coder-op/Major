import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import en from '../locales/en.js'
import { makeI18n } from './translate.js'

// Language names are written in their own script so people can find theirs.
export const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'hi', name: 'हिन्दी' }, { code: 'bn', name: 'বাংলা' }, { code: 'mr', name: 'मराठी' },
  { code: 'ta', name: 'தமிழ்' }, { code: 'te', name: 'తెలుగు' }, { code: 'gu', name: 'ગુજરાતી' }, { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' }, { code: 'pa', name: 'ਪੰਜਾਬੀ' }, { code: 'or', name: 'ଓଡ଼ିଆ' }, { code: 'as', name: 'অসমীয়া' },
]
const CODES = LANGUAGES.map((l) => l.code)
const KEY = 'sts.lang'

// Every non-English file is its own chunk, downloaded only when that language is chosen.
const loaders = import.meta.glob('../locales/*.js')
const loadDict = async (code) => (code === 'en' ? en : (await loaders[`../locales/${code}.js`]?.())?.default || en)

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY)
    if (CODES.includes(saved)) return saved
  } catch { /* storage blocked: fall through */ }
  const prefs = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []
  for (const p of prefs) { const c = String(p || '').slice(0, 2).toLowerCase(); if (CODES.includes(c)) return c }
  return 'en'
}

const Ctx = createContext({ ...makeI18n('en', en), setLang: () => {}, languages: LANGUAGES })

export function I18nProvider({ children }) {
  const [state, setState] = useState(() => ({ lang: 'en', dict: en }))

  const setLang = useCallback(async (code) => {
    if (!CODES.includes(code)) return
    const dict = await loadDict(code) // switch only once the words are here, so the screen never flashes English
    setState({ lang: code, dict })
    try { localStorage.setItem(KEY, code) } catch { /* private mode: the choice just will not persist */ }
  }, [])

  useEffect(() => { const c = initialLang(); if (c !== 'en') setLang(c) }, [setLang])
  useEffect(() => { document.documentElement.lang = state.lang }, [state.lang])

  const value = useMemo(() => ({ ...makeI18n(state.lang, state.dict), setLang, languages: LANGUAGES }), [state, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => useContext(Ctx)
