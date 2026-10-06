const { Trip, TripMember, Tourist, Incident, nextSeq } = require("../models");
const { notify } = require("./notify");
const { emitToCompany, emitToAuthority, emitToTourist } = require("./realtime");
const { pub } = require("../utils/serialize");

/**
 * Route deviation detection. While a trip is ACTIVE, each GPS point is compared with the trip's planned route:
 *   closer than warn_m        -> ON_ROUTE
 *   warn_m .. alert_m         -> WARNING   (tourist is told, nobody else is disturbed)
 *   beyond alert_m            -> DEVIATION (incident + agency/authority alert) once CONFIRM_READINGS in a row agree
 * GPS jitter is handled two ways: the reported accuracy radius is credited back to the tourist, and a single
 * stray reading is never enough to raise a deviation.
 */
const DEFAULTS = { warn_m: 200, alert_m: 500 };
const CONFIRM_READINGS = 2;
const MAX_ACCURACY_CREDIT_M = 100;
const OPEN_STATES = ["NEW", "ACKNOWLEDGED", "RESPONDING", "ON_SITE"];

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** Shortest distance (m) from a point to the segment a-b, using a local flat projection centred on the point. */
function distanceToSegment(p, a, b) {
  const k = Math.cos(rad(p.latitude));
  const xy = (q) => [rad(q.longitude - p.longitude) * k * R, rad(q.latitude - p.latitude) * R];
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Distance (m) from a point to the nearest part of a polyline, and which segment is nearest. */
function distanceToRoute(point, route) {
  if (!route || route.length < 2) return { distance_m: Infinity, segment: -1 };
  let best = Infinity;
  let segment = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceToSegment(point, route[i], route[i + 1]);
    if (d < best) { best = d; segment = i; }
  }
  return { distance_m: best, segment };
}

/** Phone GPS is only accurate to a radius; give the tourist the benefit of that doubt (up to a cap). */
const effectiveDistance = (distance_m, accuracy) => Math.max(0, distance_m - Math.min(Math.max(accuracy || 0, 0), MAX_ACCURACY_CREDIT_M));

function classify(distance_m, { warn_m = DEFAULTS.warn_m, alert_m = DEFAULTS.alert_m } = {}) {
  return distance_m >= alert_m ? "DEVIATION" : distance_m >= warn_m ? "WARNING" : "ON_ROUTE";
}

/**
 * Debounce: a DEVIATION reading only counts as a confirmed DEVIATION after CONFIRM_READINGS consecutive ones;
 * until then it is reported as WARNING. `streak` counts consecutive raw DEVIATION readings.
 */
function advance(prev, rawLevel) {
  const streak = rawLevel === "DEVIATION" ? (prev?.streak || 0) + 1 : 0;
  const level = rawLevel === "DEVIATION" && streak < CONFIRM_READINGS ? "WARNING" : rawLevel;
  return { level, streak };
}

const thresholds = (trip) => ({ warn_m: trip.deviation?.warn_m ?? DEFAULTS.warn_m, alert_m: trip.deviation?.alert_m ?? DEFAULTS.alert_m });
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

async function noteOnIncident(incident, note) {
  const updated = await Incident.findOneAndUpdate({ _id: incident._id }, { $push: { updates: { note } } }, { new: true });
  if (updated) {
    const payload = pub(updated);
    emitToCompany(updated.company_id, "incident:updated", payload);
    emitToAuthority("incident:updated", payload);
  }
}

async function raiseDeviation(tourist, trip, point, distance_m, thr) {
  const dist = metres(distance_m);
  const open = await Incident.findOne({ tourist_id: tourist._id, type: "ROUTE_DEVIATION", status: { $in: OPEN_STATES } });
  if (open) {
    await noteOnIncident(open, `Tourist left the planned route again (${dist} away)`);
    return open;
  }
  const incident = await Incident.create({
    incident_code: `INC-${1000 + (await nextSeq("incident"))}`,
    company_id: tourist.company_id,
    trip_id: trip._id,
    tourist_id: tourist._id,
    type: "ROUTE_DEVIATION",
    severity: distance_m >= thr.alert_m * 3 ? "HIGH" : "MEDIUM",
    source: "SYSTEM",
    description: `${tourist.name} is ${dist} away from the planned route of "${trip.name}" (alert threshold ${metres(thr.alert_m)}).`,
    latitude: point.latitude,
    longitude: point.longitude,
    updates: [{ note: `Route deviation detected automatically: ${dist} from the planned route` }],
  });
  const payload = { ...pub(incident), tourist_name: tourist.name, tourist_code: tourist.tourist_code };
  emitToCompany(tourist.company_id, "incident:new", payload);
  emitToAuthority("incident:new", payload);
  await notify({ company_id: tourist.company_id, tourist_id: tourist._id, type: "ROUTE_DEVIATION", authority: true, message: `${tourist.name} (${tourist.tourist_code}) has deviated ${dist} from the planned route of "${trip.name}" — ${incident.incident_code}.` });
  return incident;
}

/**
 * Compare one location reading with the planned routes of the tourist's ACTIVE trips.
 * Returns null when there is nothing to compare against, otherwise { level, distance_m, trip_id, trip_name, warning? }
 * where `warning` is set only on the reading where the situation worsens (so the tourist is told once, not every ping).
 */
async function checkRoute(tourist, point, accuracy, now = new Date()) {
  const memberships = await TripMember.find({ tourist_id: tourist._id }).select("trip_id").lean();
  const trips = memberships.length
    ? await Trip.find({ _id: { $in: memberships.map((m) => m.trip_id) }, status: "ACTIVE", "planned_route.point_count": { $gte: 2 } }).select("name company_id planned_route deviation").lean()
    : [];

  if (!trips.length) {
    if (tourist.route_state?.level) await Tourist.updateOne({ _id: tourist._id }, { $unset: { route_state: 1 } });
    return null;
  }

  // being on ANY of the tourist's active planned routes is fine, so judge against the nearest one
  let best = null;
  for (const trip of trips) {
    const { distance_m } = distanceToRoute(point, trip.planned_route.points);
    if (!best || distance_m < best.distance_m) best = { trip, distance_m };
  }
  const { trip } = best;
  const thr = thresholds(trip);
  const effective = effectiveDistance(best.distance_m, accuracy);

  const prevState = tourist.route_state && String(tourist.route_state.trip_id) === String(trip._id) ? tourist.route_state : null;
  const prevLevel = prevState?.level || "ON_ROUTE";
  const { level, streak } = advance(prevState, classify(effective, thr));
  await Tourist.updateOne({ _id: tourist._id }, { route_state: { trip_id: trip._id, level, distance_m: Math.round(effective), streak, updated_at: now } });

  const out = { level, distance_m: Math.round(effective), trip_id: String(trip._id), trip_name: trip.name, warn_m: thr.warn_m, alert_m: thr.alert_m };
  const dist = metres(effective);

  if (level === "DEVIATION" && prevLevel !== "DEVIATION") {
    await raiseDeviation(tourist, trip, point, effective, thr);
    out.warning = `You are ${dist} away from your planned route. Your agency has been alerted. Head back to the route or tap SOS if you need help.`;
    emitToTourist(tourist._id, "route:deviation", { level, distance_m: out.distance_m, message: out.warning });
  } else if (level === "WARNING" && prevLevel === "ON_ROUTE") {
    out.warning = `You are ${dist} off your planned route.`;
    emitToTourist(tourist._id, "route:warning", { level, distance_m: out.distance_m, message: out.warning });
  } else if (level === "ON_ROUTE" && prevLevel === "DEVIATION") {
    const open = await Incident.findOne({ tourist_id: tourist._id, type: "ROUTE_DEVIATION", status: { $in: OPEN_STATES } });
    if (open) await noteOnIncident(open, "Tourist is back on the planned route");
    emitToTourist(tourist._id, "route:back", { message: "You are back on your planned route." });
  }
  return out;
}

module.exports = { DEFAULTS, CONFIRM_READINGS, distanceToSegment, distanceToRoute, effectiveDistance, classify, advance, checkRoute };
