const { Tourist, TripMember, Trip, ProofBlock } = require("../models");
const { appendProof } = require("./ledger");
const { notify } = require("./notify");
const { emitToTourist } = require("./realtime");
const logger = require("../utils/logger");

/**
 * Digital Tourist ID validity: "valid only for the duration of the visit".
 * The window runs from the earliest trip start to the latest trip end the tourist belongs to
 * (dates are India local days, so an ID is good until 23:59:59 IST on the last day).
 * For foreign tourists it is also capped by the visa expiry. Finished (COMPLETED) trips end the window early.
 */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** "2026-10-06" -> Date at the start (or very end) of that day in IST. Returns null for blank/invalid input. */
function parseDay(str, endOfDay = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ""));
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(utc)) return null;
  return new Date(utc - IST_OFFSET_MS + (endOfDay ? DAY_MS - 1 : 0));
}

/** Pure: the validity window for a set of trips (+ optional visa expiry). */
function computeWindow(trips, { visa_expiry = null } = {}) {
  let from = null;
  let until = null;
  let open = false; // some trip has no end date => no trip-based expiry
  for (const t of trips) {
    const s = parseDay(t.start_date);
    if (s && (!from || s < from)) from = s;
    let e = parseDay(t.end_date, true);
    if (t.status === "COMPLETED") {
      const done = t.updated_at ? new Date(t.updated_at) : new Date();
      e = e && e < done ? e : done; // a finished trip ends the visit now, not on its planned end date
    }
    if (!e) open = true;
    else if (!until || e > until) until = e;
  }
  if (open) until = null;
  if (visa_expiry) {
    const v = new Date(visa_expiry);
    if (!until || v < until) until = v;
  }
  return { valid_from: from, valid_until: until };
}

/** Pure: PENDING (visit not started), ACTIVE, or EXPIRED at a given moment. */
function idStatus({ valid_from, valid_until }, now = new Date()) {
  if (valid_until && now > new Date(valid_until)) return "EXPIRED";
  if (valid_from && now < new Date(valid_from)) return "PENDING";
  return "ACTIVE";
}

/** What clients should show right now (computed live so it is never stale between scheduler runs). */
function currentValidity(tourist, now = new Date()) {
  if (!tourist?.digital_id) return null;
  const v = tourist.id_validity || {};
  return { valid_from: v.valid_from || null, valid_until: v.valid_until || null, status: idStatus(v, now) };
}

/**
 * Recompute and store a tourist's validity window. Records ID_EXPIRED / ID_RENEWED on the proof ledger
 * and notifies the agency when the state changes. Safe to call repeatedly.
 */
async function syncIdValidity(touristId, now = new Date()) {
  const tourist = await Tourist.findById(touristId);
  if (!tourist?.digital_id) return null;

  const memberships = await TripMember.find({ tourist_id: tourist._id }).select("trip_id");
  const trips = memberships.length ? await Trip.find({ _id: { $in: memberships.map((m) => m.trip_id) } }).select("start_date end_date status updated_at").lean() : [];
  const visa = tourist.tourist_type === "FOREIGN" ? tourist.verification?.visa_expiry : null;
  const win = computeWindow(trips, { visa_expiry: visa });
  const status = idStatus(win, now);
  const prev = tourist.id_validity?.status;

  tourist.id_validity = { ...win, status, synced_at: now };
  await tourist.save();

  if (prev && prev !== status && (status === "EXPIRED" || prev === "EXPIRED")) {
    const event = status === "EXPIRED" ? "ID_EXPIRED" : "ID_RENEWED";
    try {
      await appendProof({ tourist_id: tourist._id, digital_id: tourist.digital_id, document_hash: tourist.verification?.document_hash, verified_at: now, event, valid_until: win.valid_until });
    } catch (err) {
      logger.error({ err, event }, "could not record ID lifecycle event on the ledger");
    }
    await notify({
      company_id: tourist.company_id, tourist_id: tourist._id, type: event,
      message: status === "EXPIRED"
        ? `Digital ID ${tourist.digital_id} of ${tourist.name} (${tourist.tourist_code}) has expired: the visit has ended.`
        : `Digital ID ${tourist.digital_id} of ${tourist.name} (${tourist.tourist_code}) is valid again after the trip dates changed.`,
    });
    emitToTourist(tourist._id, "id:validity", { digital_id: tourist.digital_id, status, valid_from: win.valid_from, valid_until: win.valid_until });
  }
  return { ...win, status };
}

/** Sync several tourists, never throwing (used from request handlers where the main action already succeeded). */
async function syncMany(touristIds) {
  for (const id of touristIds) {
    try { await syncIdValidity(id); } catch (err) { logger.error({ err, tourist: String(id) }, "ID validity sync failed"); }
  }
}

/** Scheduler job: expire IDs whose visit ended and activate IDs whose visit just started. */
async function checkIdValidity(now = new Date()) {
  const due = await Tourist.find({
    digital_id: { $ne: null },
    $or: [
      { "id_validity.status": { $in: ["ACTIVE", "PENDING"] }, "id_validity.valid_until": { $lt: now } },
      { "id_validity.status": "PENDING", "id_validity.valid_from": { $lte: now } },
    ],
  }).select("_id");
  await syncMany(due.map((t) => t._id));
  return due.length;
}

module.exports = { parseDay, computeWindow, idStatus, currentValidity, syncIdValidity, syncMany, checkIdValidity };
