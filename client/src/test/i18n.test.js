import { describe, test, expect } from 'vitest'
import en, { ENUM_KEYS } from '../locales/en.js'
import hi from '../locales/hi.js'
import bn from '../locales/bn.js'
import mr from '../locales/mr.js'
import ta from '../locales/ta.js'
import te_ from '../locales/te.js'
import gu from '../locales/gu.js'
import kn from '../locales/kn.js'
import ml from '../locales/ml.js'
import pa from '../locales/pa.js'
import or from '../locales/or.js'
import as from '../locales/as.js'
import { compareLocale } from '../lib/localeCheck.js'
import { makeI18n } from '../lib/translate.js'
import { translateServerMessage } from '../lib/serverMessages.js'
import { TEXT_STEPS } from '../lib/textSize.jsx'

const LANGS = { hi, bn, mr, ta, te: te_, gu, kn, ml, pa, or, as }

describe('translation files', () => {
  test('there are 11 Indian languages besides English', () => expect(Object.keys(LANGS)).toHaveLength(11))
  for (const [code, dict] of Object.entries(LANGS)) {
    test(`${code} defines exactly the English keys with the same {placeholders}`, () => expect(compareLocale(code, dict, en)).toEqual([]))
  }
  test('every status/enum label exists in every language', () => {
    for (const [code, dict] of Object.entries(LANGS)) for (const k of ENUM_KEYS) expect(dict[`enum.${k}`], `${code} ${k}`).toBeTruthy()
  })
})

describe('translator', () => {
  const hindi = makeI18n('hi', hi)
  test('fills placeholders and falls back to English for missing keys', () => {
    expect(hindi.t('time.min', { n: 5 })).toBe('5 मिनट पहले')
    expect(makeI18n('xx', {}).t('common.retry')).toBe('Retry')
    expect(makeI18n('en', en).t('nope.missing')).toBe('nope.missing')
    expect(makeI18n('en', en).t('dash.welcome')).toBe('Welcome, {name}') // unfilled placeholder stays visible rather than breaking
  })
  test('English output is identical to the original wording', () => {
    const e = makeI18n('en', en)
    expect(e.t('dash.status.NORMAL')).toBe('Safety Status: Safe')
    expect(e.te('NOT_SUBMITTED')).toBe('Not Submitted')
    expect(e.te('FALSE_ALARM')).toBe('False Alarm')
  })
  test('unknown statuses fall back to a readable English label', () => expect(hindi.te('SOME_NEW_STATUS')).toBe('Some New Status'))
  test('relative times', () => {
    expect(hindi.ago(new Date())).toBe('अभी')
    expect(makeI18n('en', en).ago(new Date(Date.now() - 5 * 60_000))).toBe('5 min ago')
    expect(makeI18n('en', en).ago(null)).toBe('-')
  })
})

describe('server messages shown in the tourist’s language', () => {
  const e = makeI18n('en', en)
  const h = makeI18n('hi', hi)
  // exact wording of what the server sends today (see server/src/services/risk.js, safetyEngine.js, routeDeviation.js)
  const SERVER = [
    'An SOS emergency is active', 'Inside restricted zone "Cave"', 'Inside danger zone "River Bend"', 'Inside caution zone "Old Fort"',
    'Night-time in a risky area', 'Night-time travel', 'No movement for 90 minutes outside a rest point', 'Stationary for 90 minutes',
    'No location update for 45 minutes', 'Independent travel is overdue', "Missed 'I'm Safe' check-in", 'Off the planned route by 812 m',
    'Drifting from the planned route (260 m)', 'AI anomaly detector: erratic changes of direction (score 0.71)', '3 recent incident(s) in this area',
    'No risk factors detected', 'You have entered a danger zone: River Bend. Please be careful.', 'Caution zone: Old Fort',
    'You are 812 m away from your planned route. Your agency has been alerted. Head back to the route or tap SOS if you need help.',
    'You are 260 m off your planned route.', 'You are back on your planned route.',
  ]
  test('every known server message is translated, with its values filled in', () => {
    for (const m of SERVER) {
      const out = h.tm(m)
      expect(out, m).not.toBe(m)
      expect(out, m).not.toMatch(/\{\w+\}/)
    }
  })
  test('in English the server text comes back unchanged', () => {
    for (const m of SERVER.filter((s) => !s.startsWith('AI anomaly') && !s.startsWith('You have entered'))) expect(e.tm(m), m).toBe(m)
  })
  test('values survive translation', () => {
    expect(h.tm('Off the planned route by 812 m')).toContain('812')
    expect(h.tm('Inside danger zone "River Bend"')).toContain('River Bend')
  })
  test('text we do not recognise (e.g. typed by an officer) is never lost', () => {
    expect(translateServerMessage('Bridge closed, use the east path', e.t, e.te)).toBe('Bridge closed, use the east path')
    expect(translateServerMessage(undefined, e.t, e.te)).toBe(undefined)
  })
  test('an officer’s zone description is kept when present', () => {
    expect(h.tm('You have entered a restricted zone: Cave. Unstable ground.')).toContain('Unstable ground.')
  })
})

describe('text size steps', () => {
  test('include normal size and stay within a sensible range', () => {
    expect(TEXT_STEPS).toContain(100)
    expect(Math.min(...TEXT_STEPS)).toBeGreaterThanOrEqual(80)
    expect(Math.max(...TEXT_STEPS)).toBeLessThanOrEqual(200)
    expect([...TEXT_STEPS].sort((a, b) => a - b)).toEqual(TEXT_STEPS)
  })
})
