const env = require("../config/env");
const { Tourist, Location, Incident, TravelSession, Trip, TripMember, nextSeq } = require("../models");
const { zonesAt } = require("./geo");
const { assessRisk, stationaryMinutes } = require("./risk");
const { activeZones } = require("./zones");
const { notify } = require("./notify");
const { emitToCompany, emitToAuthority, emitToTourist } = require("./realtime");
const { pub } = require("../utils/serialize");
const { checkRoute } = require("./routeDeviation");
const logger = require("../utils/logger");

const ROUTE_STATE_FRESH_MS = 30 * 60_000; // an old route comparison says nothing about where the tourist is now

const OPEN_STATES = ["NEW", "ACKNOWLEDGED", "RESPONDING", "ON_SITE"];
const WARN_ZONES = new Set(["DANGER", "RESTRICTED"]);

const zoneRef = (z) => (z ? { id: String(z._id), name: z.name, type: z.type } : null);
const IST_OFFSET_MIN = 330; // prototype assumes India Standard Time for "night" rules
const localHour = (d = new Date()) => new Date(d.getTime() + (IST_OFFSET_MIN + d.getTimezoneOffset()) * 60000).getHours();

/** Recompute and store one tourist's risk. Returns { risk, changed } */
async function refreshRisk(tourist, { zone, now = new Date() } = {}) {
  const pts = await Location.find({ tourist_id: tourist._id }).sort({ recorded_at: -1 }).limit(40).lean();
  const zones = await activeZones();
  const here = tourist.last_location?.latitude != null ? zone ?? zonesAt(tourist.last_location, zones)[0] ?? null : zone ?? null;
  const lastAt = tourist.last_location?.recorded_at;
  const [activeSos, overdueTravel, nearby] = await Promise.all([
    Incident.exists({ tourist_id: tourist._id, type: "SOS", status: { $in: OPEN_STATES } }),
    TravelSession.exists({ tourist_id: tourist._id, status: "OVERDUE" }),
    here ? Incident.countDocuments({ company_id: tourist.company_id, created_at: { $gt: new Date(now - 7 * 86400_000) }, type: { $ne: "SOS" }, latitude: { $ne: null } }) : 0,
  ]);
  const routeFresh = tourist.route_state?.updated_at && now - new Date(tourist.route_state.updated_at) < ROUTE_STATE_FRESH_MS;
  const r = assessRisk({
    zone: here,
    atRestPoint: zones.some((z) => z.type === "REST_POINT" && tourist.last_location?.latitude != null && zonesAt(tourist.last_location, [z]).length),
    stationaryMin: stationaryMinutes(pts, now),
    minutesSinceUpdate: lastAt && tourist.location_sharing ? (now - new Date(lastAt)) / 60000 : 0,
    localHour: localHour(now),
    activeSos: !!activeSos,
    overdueTravel: !!overdueTravel,
    missedCheckIn: tourist.last_check_in_at ? now - tourist.last_check_in_at > env.CHECKIN_INTERVAL_HOURS * 3600_000 : false,
    nearbyIncidents: Math.min(nearby, 3),
    ...(routeFresh && { routeLevel: tourist.route_state.level, routeDistanceM: tourist.route_state.distance_m }),
  });
  const changed = r.level !== tourist.risk?.level;
  await Tourist.updateOne({ _id: tourist._id }, { risk: { ...r, updated_at: now } });
  return { risk: r, changed, previous: tourist.risk?.level || "LOW" };
}

/**
 * Called after every location update: finds the current zone, warns on entering a danger or
 * restricted zone, then recomputes risk and raises an attention event when it reaches HIGH.
 * None of this creates an emergency - only the SOS button does.
 */
async function processLocation(tourist, point) {
  const zones = await activeZones();
  const inside = zonesAt(point, zones);
  const zone = inside[0] || null;
  const prev = tourist.current_zone?.id || null;
  const entered = zone && String(zone._id) !== prev;

  await Tourist.updateOne({ _id: tourist._id }, { current_zone: zone ? zoneRef(zone) : { id: null, name: null, type: null } });
  const out = { zone: zoneRef(zone), warnings: [] };

  if (entered && WARN_ZONES.has(zone.type)) {
    const msg = `${tourist.name} (${tourist.tourist_code}) entered ${zone.type.toLowerCase()} zone "${zone.name}".`;
    out.warnings.push(`You have entered a ${zone.type.toLowerCase()} zone: ${zone.name}. ${zone.description || "Please be careful."}`);
    await notify({ company_id: tourist.company_id, tourist_id: tourist._id, type: "ZONE_ALERT", message: msg, authority: true });
    emitToTourist(tourist._id, "zone:warning", { zone: zoneRef(zone), message: out.warnings[0] });
  } else if (entered && zone.type === "CAUTION") {
    out.warnings.push(`Caution zone: ${zone.name}`);
    emitToTourist(tourist._id, "zone:warning", { zone: zoneRef(zone), message: out.warnings[0] });
  }

  // planned-route check (must run before the risk refresh so the risk score sees it); never blocks location updates
  try {
    out.route = await checkRoute(tourist, point, point.accuracy);
    if (out.route?.warning) out.warnings.push(out.route.warning);
  } catch (err) {
    logger.error({ err, tourist: String(tourist._id) }, "route deviation check failed");
    out.route = null;
  }

  const fresh = await Tourist.findById(tourist._id);
  const { risk, changed, previous } = await refreshRisk(fresh, { zone });
  out.risk = risk;

  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  if (changed && rank[risk.level] >= 2 && rank[risk.level] > rank[previous]) {
    // attention event, not an emergency
    await Tourist.updateOne({ _id: tourist._id, status: "NORMAL" }, { status: "ATTENTION" });
    await notify({
      company_id: tourist.company_id, tourist_id: tourist._id, type: "HIGH_RISK", authority: true,
      message: `${tourist.name} (${tourist.tourist_code}) risk is now ${risk.level} (${risk.score}/100): ${risk.factors[0]}.`,
    });
    emitToTourist(tourist._id, "risk:warning", { level: risk.level, factors: risk.factors });
  }
  const live = { tourist_id: String(tourist._id), zone: out.zone, risk };
  emitToCompany(tourist.company_id, "risk:update", live);
  emitToAuthority("risk:update", live);
  return out;
}

module.exports = { processLocation, refreshRisk, OPEN_STATES, zoneRef };
