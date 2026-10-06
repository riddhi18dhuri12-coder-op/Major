const express = require("express");
const { z } = require("zod");
const { Trip, TripMember, Tourist, Guide } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { pub, pubList } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { bad, conflict, notFound, forbidden } = require("../utils/errors");
const { nextSeq } = require("../models");
const { syncMany } = require("../services/idValidity");
const { audit } = require("../services/audit");
const { DEFAULTS: ROUTE_DEFAULTS } = require("../services/routeDeviation");

const router = express.Router();
router.use(requireAuth);

const optStr = (max) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));
const objectIdOrNull = z.union([z.string().length(24), z.null(), z.literal("")]).optional();
const tripFields = {
  name: z.string().trim().min(1).max(160),
  description: optStr(2000),
  start_date: optStr(30),
  end_date: optStr(30),
  start_location: optStr(160),
  end_location: optStr(160),
  guide_id: objectIdOrNull,
};

/** A guide_id must belong to the caller's company; empty means "unassigned". */
async function resolveGuide(guide_id, company_id) {
  if (!guide_id) return null;
  const id = oid(guide_id, "Guide");
  if (!(await Guide.exists({ _id: id, company_id }))) throw bad("Invalid guide");
  return id;
}

async function withGuideNames(trips) {
  const ids = [...new Set(trips.map((t) => t.guide_id).filter(Boolean).map(String))];
  const guides = ids.length ? await Guide.find({ _id: { $in: ids } }).select("name") : [];
  const names = new Map(guides.map((g) => [String(g._id), g.name]));
  return names;
}

router.get("/", async (req, res) => {
  const { company_id, role, id } = req.user;
  let filter;
  if (role === "tourist") {
    const memberships = await TripMember.find({ tourist_id: id }).select("trip_id");
    filter = { _id: { $in: memberships.map((m) => m.trip_id) } };
  } else {
    filter = { company_id };
    if (role === "guide") filter.guide_id = id;
  }
  const trips = await Trip.find(filter).select("-planned_route.points").sort({ created_at: -1 }).limit(500); // route points are only sent with the single-trip view
  const [names, counts] = await Promise.all([
    withGuideNames(trips),
    TripMember.aggregate([{ $match: { trip_id: { $in: trips.map((t) => t._id) } } }, { $group: { _id: "$trip_id", n: { $sum: 1 } } }]),
  ]);
  const byTrip = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(trips.map((t) => ({ ...pub(t), guide_name: names.get(String(t.guide_id)) || null, tourist_count: byTrip.get(String(t._id)) || 0 })));
});

router.post("/", requireRole("company"), async (req, res) => {
  const b = z.object(tripFields).parse(req.body);
  const guide_id = await resolveGuide(b.guide_id, req.user.company_id);
  const trip = await Trip.create({ ...b, guide_id, company_id: req.user.company_id });
  res.status(201).json(pub(trip));
});

router.get("/:id", async (req, res) => {
  const trip = await Trip.findById(oid(req.params.id, "Trip"));
  if (!trip || String(trip.company_id) !== req.user.company_id) throw notFound("Trip not found");
  if (req.user.role === "guide" && String(trip.guide_id) !== req.user.id) throw forbidden("This trip is assigned to another guide");
  if (req.user.role === "tourist" && !(await TripMember.exists({ trip_id: trip._id, tourist_id: req.user.id }))) throw notFound("Trip not found");

  const members = await TripMember.find({ trip_id: trip._id }).select("tourist_id");
  const [tourists, names] = await Promise.all([Tourist.find({ _id: { $in: members.map((m) => m.tourist_id) } }), withGuideNames([trip])]);
  res.json({
    ...pub(trip),
    guide_name: names.get(String(trip.guide_id)) || null,
    tourists: req.user.role === "tourist" ? [] : tourists.map((t) => ({ ...pub(t), last_location: undefined })),
  });
});

router.put("/:id", requireRole("company"), async (req, res) => {
  const b = z.object({ ...tripFields, status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED"]) }).partial().parse(req.body);
  const trip = await Trip.findOne({ _id: oid(req.params.id, "Trip"), company_id: req.user.company_id });
  if (!trip) throw notFound("Trip not found");
  if (b.guide_id !== undefined) b.guide_id = await resolveGuide(b.guide_id, req.user.company_id);
  const activating = b.status === "ACTIVE" && trip.status !== "ACTIVE";
  const windowChanged = ["start_date", "end_date", "status"].some((k) => b[k] !== undefined && b[k] !== trip[k]);
  trip.set(b);
  await trip.save();
  if (windowChanged) await syncMany(await TripMember.distinct("tourist_id", { trip_id: trip._id })); // ID validity follows the trip dates
  if (activating) {
    // the "I'm Safe" clock starts when the trip does
    const ids = await TripMember.distinct("tourist_id", { trip_id: trip._id });
    await Tourist.updateMany({ _id: { $in: ids } }, { last_check_in_at: new Date() });
  }
  res.json(pub(trip));
});

// Add a tourist to a trip; creates the tourist (with a unique Tourist ID) if new.
router.post("/:id/tourists", requireRole("company"), async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email(), phone: z.string().trim().max(30).optional(), tourist_type: z.enum(["DOMESTIC", "FOREIGN"]).default("DOMESTIC"), nationality: z.string().trim().max(60).optional() }).parse(req.body);
  const trip = await Trip.findOne({ _id: oid(req.params.id, "Trip"), company_id: req.user.company_id });
  if (!trip) throw notFound("Trip not found");

  let tourist = await Tourist.findOne({ email: b.email });
  if (tourist && String(tourist.company_id) !== req.user.company_id) throw conflict("This email is already registered with another company");
  if (!tourist) {
    const code = `TST-${new Date().getFullYear()}-${String(await nextSeq("tourist")).padStart(5, "0")}`;
    tourist = await Tourist.create({ company_id: req.user.company_id, tourist_code: code, name: b.name, email: b.email, phone: b.phone, tourist_type: b.tourist_type, nationality: b.nationality });
  }
  await TripMember.updateOne({ trip_id: trip._id, tourist_id: tourist._id }, { $setOnInsert: { trip_id: trip._id, tourist_id: tourist._id } }, { upsert: true });
  await syncMany([tourist._id]);
  res.status(201).json(pub(tourist));
});

// ---- Planned route (route-deviation monitoring) -------------------------------------------------
const routePoint = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const routeBody = z.object({
  points: z.array(routePoint).min(2).max(1500),
  distance_km: z.number().positive().max(20000).optional(),
  source: z.enum(["OSRM", "STRAIGHT", "MANUAL"]).default("MANUAL"),
  warn_m: z.number().int().min(50).max(5000).optional(),
  alert_m: z.number().int().min(100).max(10000).optional(),
}).refine((b) => (b.warn_m ?? ROUTE_DEFAULTS.warn_m) < (b.alert_m ?? ROUTE_DEFAULTS.alert_m), { message: "The warning distance must be smaller than the deviation distance" });

router.put("/:id/route", requireRole("company"), async (req, res) => {
  const b = routeBody.parse(req.body);
  const trip = await Trip.findOne({ _id: oid(req.params.id, "Trip"), company_id: req.user.company_id });
  if (!trip) throw notFound("Trip not found");
  trip.planned_route = { points: b.points, point_count: b.points.length, distance_km: b.distance_km, source: b.source, set_at: new Date() };
  trip.deviation = { warn_m: b.warn_m ?? ROUTE_DEFAULTS.warn_m, alert_m: b.alert_m ?? ROUTE_DEFAULTS.alert_m };
  await trip.save();
  // old comparisons belonged to the previous route
  await Tourist.updateMany({ _id: { $in: await TripMember.distinct("tourist_id", { trip_id: trip._id }) } }, { $unset: { route_state: 1 } });
  await audit(req.user, "TRIP_ROUTE_SET", "Trip", trip._id, { points: b.points.length, ...trip.deviation.toObject?.() });
  res.json(pub(trip));
});

router.delete("/:id/route", requireRole("company"), async (req, res) => {
  const trip = await Trip.findOne({ _id: oid(req.params.id, "Trip"), company_id: req.user.company_id });
  if (!trip) throw notFound("Trip not found");
  trip.planned_route = { points: [], point_count: 0 };
  await trip.save();
  await Tourist.updateMany({ _id: { $in: await TripMember.distinct("tourist_id", { trip_id: trip._id }) } }, { $unset: { route_state: 1 } });
  await audit(req.user, "TRIP_ROUTE_CLEARED", "Trip", trip._id);
  res.json(pub(trip));
});

router.delete("/:id/tourists/:touristId", requireRole("company"), async (req, res) => {
  const trip = await Trip.findOne({ _id: oid(req.params.id, "Trip"), company_id: req.user.company_id });
  if (!trip) throw notFound("Trip not found");
  const touristId = oid(req.params.touristId, "Tourist");
  await TripMember.deleteOne({ trip_id: trip._id, tourist_id: touristId });
  await syncMany([touristId]);
  res.json({ ok: true });
});

module.exports = router;
