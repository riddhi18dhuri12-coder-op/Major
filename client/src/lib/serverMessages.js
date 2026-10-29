// The server writes warnings and risk reasons in English. For tourists reading another language we translate the ones
// we recognise by matching their wording; anything unrecognised (e.g. text typed by an authority) is shown unchanged,
// so a message is never lost. If you change a message on the server, change its pattern here too (tests cover this).
const RULES = [
  // zone warnings
  [/^You have entered a (\w+) zone: (.+?)\.(?: (.*))?$/s, (m, t, te) => {
    const base = t('srv.zoneEntered', { type: te(m[1].toUpperCase()), name: m[2] })
    const extra = m[3] === undefined || m[3] === 'Please be careful.' ? t('srv.beCareful') : m[3]
    return `${base} ${extra}`
  }],
  [/^Caution zone: (.+)$/s, (m, t) => t('srv.cautionZone', { name: m[1] })],
  // route
  [/^You are (.+?) away from your planned route\. Your agency has been alerted\./, (m, t) => t('srv.routeDeviation', { dist: m[1] })],
  [/^You are (.+?) off your planned route\.$/, (m, t) => t('srv.routeWarning', { dist: m[1] })],
  [/^You are back on your planned route\.$/, (m, t) => t('srv.routeBack')],
  // risk factors
  [/^An SOS emergency is active$/, (m, t) => t('srv.f.sos')],
  [/^Inside restricted zone "(.+)"$/s, (m, t) => t('srv.f.restricted', { name: m[1] })],
  [/^Inside danger zone "(.+)"$/s, (m, t) => t('srv.f.danger', { name: m[1] })],
  [/^Inside caution zone "(.+)"$/s, (m, t) => t('srv.f.caution', { name: m[1] })],
  [/^Night-time in a risky area$/, (m, t) => t('srv.f.nightRisky')],
  [/^Night-time travel$/, (m, t) => t('srv.f.night')],
  [/^No movement for (\d+) minutes outside a rest point$/, (m, t) => t('srv.f.noMoveRest', { n: m[1] })],
  [/^Stationary for (\d+) minutes$/, (m, t) => t('srv.f.stationary', { n: m[1] })],
  [/^No location update for (\d+) minutes$/, (m, t) => t('srv.f.noUpdate', { n: m[1] })],
  [/^Independent travel is overdue$/, (m, t) => t('srv.f.overdue')],
  [/^Missed 'I'm Safe' check-in$/, (m, t) => t('srv.f.missedCheckin')],
  [/^Off the planned route by (\d+) m$/, (m, t) => t('srv.f.offRoute', { n: m[1] })],
  [/^Drifting from the planned route \((\d+) m\)$/, (m, t) => t('srv.f.drifting', { n: m[1] })],
  [/^AI anomaly detector: .* \(score ([\d.]+)\)$/s, (m, t) => t('srv.f.anomaly', { score: m[1] })],
  [/^(\d+) recent incident\(s\) in this area$/, (m, t) => t('srv.f.incidents', { n: m[1] })],
  [/^No risk factors detected$/, (m, t) => t('srv.f.none')],
]

/** @param msg English text from the server; t/te the translators of the current language */
export function translateServerMessage(msg, t, te) {
  if (typeof msg !== 'string') return msg
  for (const [re, fn] of RULES) {
    const m = re.exec(msg)
    if (m) return fn(m, t, te)
  }
  return msg
}
