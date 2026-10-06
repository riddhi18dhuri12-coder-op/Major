const express = require("express");
const { z } = require("zod");
const { Location, Tourist, TripMember, Trip } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { locationLimiter } = require("../middleware/rateLimit");
const { emitToCompany, emitToAuthority } = require("../services/realtime");
const { processLocation } = require("../services/safetyEngine");
const { pubList } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { forbidden, notFound } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth);

router.post("/toggle", requireRole("tourist"), async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  await Tourist.updateOne({ _id: req.user.id }, { location_sharing: enabled });
  res.json({ location_sharing: enabled });
});

router.post("/", requireRole("tourist"), locationLimiter, async (req, res) => {
  const b = z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative().optional(),
      trip_id: z.string().length(24).nullish(),
    })
    .parse(req.body);

  const tourist = await Tourist.findById(req.user.id);
  if (!tourist?.location_sharing) throw forbidden("Location sharing is off");

  // only accept a trip the tourist actually belongs to
  const trip_id = b.trip_id && (await TripMember.exists({ trip_id: b.trip_id, tourist_id: req.user.id })) ? b.trip_id : null;
  const recorded_at = new Date();
  await Promise.all([
    Location.create({ tourist_id: req.user.id, company_id: req.user.company_id, trip_id, latitude: b.latitude, longitude: b.longitude, accuracy: b.accuracy, recorded_at }),
    Tourist.updateOne({ _id: req.user.id }, { last_location: { latitude: b.latitude, longitude: b.longitude, accuracy: b.accuracy, recorded_at } }),
  ]);

  const update = { tourist_id: req.user.id, latitude: b.latitude, longitude: b.longitude, accuracy: b.accuracy, recorded_at: recorded_at.toISOString() };
  emitToCompany(req.user.company_id, "location:update", update);
  emitToAuthority("location:update", update);

  // geofencing + risk; the tourist gets back their current zone, risk and any warnings
  const safety = await processLocation(tourist, { latitude: b.latitude, longitude: b.longitude, accuracy: b.accuracy });
  res.status(201).json({ ok: true, zone: safety.zone, risk: safety.risk, route: safety.route, warnings: safety.warnings });
});

// Company/guide: location history for one tourist
router.get("/tourist/:id", requireRole("company", "guide"), async (req, res) => {
  const tourist_id = oid(req.params.id, "Tourist");
  if (!(await Tourist.exists({ _id: tourist_id, company_id: req.user.company_id }))) throw notFound("Tourist not found");
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json(pubList(await Location.find({ tourist_id }).sort({ recorded_at: -1 }).limit(limit)));
});

// Company/guide: latest position of every tourist (live map) in a single query
router.get("/live", requireRole("company", "guide"), async (req, res) => {
  const tourists = await Tourist.find({ company_id: req.user.company_id }).select("tourist_code name status location_sharing last_location risk current_zone").lean();
  res.json(tourists.map(({ _id, last_location, ...t }) => ({ id: String(_id), ...t, last_location: last_location?.recorded_at ? last_location : null })));
});

module.exports = router;
