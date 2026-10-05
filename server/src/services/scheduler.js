const crypto = require("crypto");
const env = require("../config/env");
const logger = require("../utils/logger");
const { Tourist, TripMember, Trip, TravelSession, SafetyCheck, Notification, SchedulerLock } = require("../models");
const { notify } = require("./notify");
const { emitToCompany, emitToTourist } = require("./realtime");

const OWNER = crypto.randomUUID(); // identifies this server instance

/**
 * Only one server instance runs the checks at a time. The lock is a lease that expires on its own,
 * so a crashed instance never blocks the others for long.
 */
async function acquireLock(ttlMs) {
  const now = new Date();
  try {
    const doc = await SchedulerLock.findOneAndUpdate(
      { _id: "safety-checks", $or: [{ locked_until: { $lt: now } }, { owner: OWNER }] },
      { owner: OWNER, locked_until: new Date(now.getTime() + ttlMs) },
      { upsert: true, new: true }
    );
    return doc.owner === OWNER;
  } catch (e) {
    if (e.code === 11000) return false; // someone else holds a live lease
    throw e;
  }
}

/** Ids of tourists who belong to at least one ACTIVE trip. */
async function touristsOnActiveTrips() {
  const trips = await Trip.find({ status: "ACTIVE" }).select("_id");
  if (!trips.length) return [];
  return TripMember.distinct("tourist_id", { trip_id: { $in: trips.map((t) => t._id) } });
}

// 1) Independent-travel sessions that passed their expected return time
async function checkOverdueTravel() {
  const due = await TravelSession.find({ status: "ACTIVE", expected_return: { $lt: new Date() } });
  let count = 0;
  for (const s of due) {
    // atomic flip: if another instance already did it, we get null and skip
    const flipped = await TravelSession.findOneAndUpdate({ _id: s._id, status: "ACTIVE" }, { status: "OVERDUE" }, { new: true });
    if (!flipped) continue;
    const tourist = await Tourist.findOneAndUpdate({ _id: s.tourist_id, status: "NORMAL" }, { status: "ATTENTION" }, { new: true }) || (await Tourist.findById(s.tourist_id));
    if (!tourist) continue;
    const n = await notify({
      company_id: tourist.company_id,
      tourist_id: tourist._id,
      type: "OVERDUE_TRAVEL",
      message: `${tourist.name} (${tourist.tourist_code}) has not returned from independent travel${s.destination ? " to " + s.destination : ""}.`,
    });
    emitToCompany(tourist.company_id, "alert:overdue", { ...n, session_id: String(s._id) });
    emitToTourist(tourist._id, "travel:overdue", { session_id: String(s._id) });
    count++;
  }
  return count;
}

// 2) Location-sharing tourists on an active trip who have gone quiet
async function checkStaleLocations() {
  const ids = await touristsOnActiveTrips();
  if (!ids.length) return 0;
  const cutoff = new Date(Date.now() - env.STALE_LOCATION_MINUTES * 60_000);
  const quiet = await Tourist.find({ _id: { $in: ids }, location_sharing: true, "last_location.recorded_at": { $lt: cutoff } });
  let count = 0;
  for (const t of quiet) {
    // warn once per silence: skip if we already warned after their last known position
    if (await Notification.exists({ tourist_id: t._id, type: "STALE_LOCATION", created_at: { $gt: t.last_location.recorded_at } })) continue;
    await notify({ company_id: t.company_id, tourist_id: t._id, type: "STALE_LOCATION", message: `No location update from ${t.name} (${t.tourist_code}) for over ${env.STALE_LOCATION_MINUTES} minutes.` });
    count++;
  }
  return count;
}

// 3) Tourists on an active trip who haven't tapped "I'm Safe" recently.
//    A MISSED row is stored and the clock restarts, so reminders repeat once per interval.
async function checkMissedCheckIns() {
  const ids = await touristsOnActiveTrips();
  if (!ids.length) return 0;
  const cutoff = new Date(Date.now() - env.CHECKIN_INTERVAL_HOURS * 3600_000);
  const overdue = await Tourist.find({
    _id: { $in: ids },
    activated: true,
    $or: [{ last_check_in_at: { $lt: cutoff } }, { last_check_in_at: null, created_at: { $lt: cutoff } }],
  });

  let count = 0;
  for (const t of overdue) {
    // atomic claim: restarting the clock first means two instances can't both alert for the same miss
    const claimed = await Tourist.findOneAndUpdate(
      { _id: t._id, $or: [{ last_check_in_at: { $lt: cutoff } }, { last_check_in_at: null }] },
      { last_check_in_at: new Date() }
    );
    if (!claimed) continue;
    await SafetyCheck.create({ tourist_id: t._id, status: "MISSED" });
    await Tourist.updateOne({ _id: t._id, status: "NORMAL" }, { status: "ATTENTION" });
    await notify({ company_id: t.company_id, tourist_id: t._id, type: "MISSED_CHECKIN", message: `${t.name} (${t.tourist_code}) has not checked in as safe for over ${env.CHECKIN_INTERVAL_HOURS} hours.` });
    emitToTourist(t._id, "checkin:reminder", { interval_hours: env.CHECKIN_INTERVAL_HOURS });
    count++;
  }
  return count;
}

async function runChecks() {
  const ttl = env.SCHEDULER_INTERVAL_SECONDS * 1000 * 0.9;
  if (!(await acquireLock(ttl))) return null;
  const result = { overdue: 0, stale: 0, missed: 0 };
  for (const [key, fn] of [["overdue", checkOverdueTravel], ["stale", checkStaleLocations], ["missed", checkMissedCheckIns]]) {
    try {
      result[key] = await fn(); // one failing check must not stop the others
    } catch (err) {
      logger.error({ err, check: key }, "scheduler check failed");
    }
  }
  return result;
}

function startScheduler() {
  if (!env.SCHEDULER_ENABLED) return null;
  const tick = () => runChecks().catch((err) => logger.error({ err }, "scheduler tick failed"));
  tick();
  return setInterval(tick, env.SCHEDULER_INTERVAL_SECONDS * 1000);
}

module.exports = { startScheduler, runChecks, checkOverdueTravel, checkStaleLocations, checkMissedCheckIns };
