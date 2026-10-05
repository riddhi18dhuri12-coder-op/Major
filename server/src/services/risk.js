/**
 * Explainable, rule-based risk engine. Pure function: same inputs -> same output, so it is easy to
 * test and to replace with an ML service later (same input/output shape).
 *
 * Context matters: staying put at a known rest point in a safe zone is NORMAL, but the same
 * inactivity inside a danger zone or at night adds risk. Nothing here declares an emergency;
 * a high score raises an "attention" event, only the SOS button creates an emergency.
 */
const { distanceM } = require("./geo");

const STATIONARY_RADIUS_M = 50;

/** Minutes the tourist has stayed within STATIONARY_RADIUS_M of their latest point (points newest-first). */
function stationaryMinutes(points, now = new Date()) {
  if (!points?.length) return 0;
  const latest = points[0];
  let oldest = latest;
  for (const p of points) {
    if (distanceM(p, latest) > STATIONARY_RADIUS_M) break;
    oldest = p;
  }
  return Math.max(0, (new Date(now) - new Date(oldest.recorded_at)) / 60000);
}

function levelFor(score) {
  return score >= 85 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
}

/**
 * @param {object} i
 * @param {object|null} i.zone            most restrictive zone containing the tourist (or null)
 * @param {boolean} i.atRestPoint         inside a REST_POINT zone
 * @param {number}  i.stationaryMin       minutes without meaningful movement
 * @param {number}  i.minutesSinceUpdate  minutes since the last location update
 * @param {number}  i.localHour           0-23 in the tourist's local time
 * @param {boolean} i.activeSos           an SOS incident is open
 * @param {boolean} i.overdueTravel       independent travel is past its return time
 * @param {boolean} i.missedCheckIn       "I'm Safe" check-in is overdue
 * @param {number}  i.nearbyIncidents     recent incidents within the area
 */
function assessRisk(i) {
  let score = 0;
  const factors = [];
  const add = (pts, why) => { score += pts; factors.push(why); };

  if (i.activeSos) add(100, "An SOS emergency is active");

  const zoneType = i.zone?.type;
  if (zoneType === "RESTRICTED") add(45, `Inside restricted zone "${i.zone.name}"`);
  else if (zoneType === "DANGER") add(35, `Inside danger zone "${i.zone.name}"`);
  else if (zoneType === "CAUTION") add(15, `Inside caution zone "${i.zone.name}"`);

  const night = i.localHour >= 21 || i.localHour < 5;
  if (night && (zoneType === "DANGER" || zoneType === "RESTRICTED" || zoneType === "CAUTION")) add(10, "Night-time in a risky area");
  else if (night) add(3, "Night-time travel");

  // Inactivity is only suspicious when it is not explained by a known rest point in a safe context.
  const safeContext = i.atRestPoint && (!zoneType || zoneType === "SAFE" || zoneType === "REST_POINT");
  if (i.stationaryMin >= 120) {
    if (safeContext) factors.push("Long stop at a known rest point (normal behaviour)");
    else add(zoneType === "DANGER" || zoneType === "RESTRICTED" ? 25 : 12, `No movement for ${Math.round(i.stationaryMin)} minutes outside a rest point`);
  } else if (i.stationaryMin >= 45 && !safeContext) add(5, `Stationary for ${Math.round(i.stationaryMin)} minutes`);

  if (i.minutesSinceUpdate >= 30) add(zoneType === "DANGER" || zoneType === "RESTRICTED" ? 20 : 10, `No location update for ${Math.round(i.minutesSinceUpdate)} minutes`);
  if (i.overdueTravel) add(20, "Independent travel is overdue");
  if (i.missedCheckIn) add(10, "Missed 'I'm Safe' check-in");
  if (i.nearbyIncidents > 0) add(Math.min(10, i.nearbyIncidents * 4), `${i.nearbyIncidents} recent incident(s) in this area`);

  score = Math.min(100, score);
  if (!factors.length) factors.push("No risk factors detected");
  return { score, level: levelFor(score), factors };
}

module.exports = { assessRisk, stationaryMinutes, levelFor };
