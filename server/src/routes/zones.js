const express = require("express");
const { z } = require("zod");
const { Zone } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { invalidateZones } = require("../services/zones");
const { audit } = require("../services/audit");
const { emitToAuthority } = require("../services/realtime");
const { pub, pubList } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { notFound } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth);

const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const shape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CIRCLE"), center: point, radius_m: z.number().min(10).max(500_000) }),
  z.object({ kind: z.literal("POLYGON"), polygon: z.array(point).min(3).max(200) }),
]);
const body = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["SAFE", "CAUTION", "DANGER", "RESTRICTED", "REST_POINT"]),
  risk_level: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  description: z.string().trim().max(1000).optional(),
  active: z.boolean().default(true),
  shape,
});

// Everyone signed in can read zones (tourists need them for the map and offline cache).
router.get("/", async (req, res) => {
  const filter = req.query.all === "true" && req.user.role === "authority" ? {} : { active: true };
  res.json(pubList(await Zone.find(filter).sort({ created_at: -1 }).limit(1000)));
});

router.post("/", requireRole("authority"), async (req, res) => {
  const zone = await Zone.create({ ...body.parse(req.body), created_by: req.user.id });
  invalidateZones();
  await audit(req.user, "ZONE_CREATED", "Zone", zone._id, { name: zone.name, type: zone.type });
  emitToAuthority("zone:changed", { id: String(zone._id) });
  res.status(201).json(pub(zone));
});

router.put("/:id", requireRole("authority"), async (req, res) => {
  const zone = await Zone.findById(oid(req.params.id, "Zone"));
  if (!zone) throw notFound("Zone not found");
  zone.set(body.partial().parse(req.body));
  await zone.save();
  invalidateZones();
  await audit(req.user, "ZONE_UPDATED", "Zone", zone._id, { name: zone.name, type: zone.type, active: zone.active });
  emitToAuthority("zone:changed", { id: String(zone._id) });
  res.json(pub(zone));
});

router.delete("/:id", requireRole("authority"), async (req, res) => {
  const zone = await Zone.findByIdAndDelete(oid(req.params.id, "Zone"));
  if (!zone) throw notFound("Zone not found");
  invalidateZones();
  await audit(req.user, "ZONE_DELETED", "Zone", zone._id, { name: zone.name });
  res.json({ ok: true });
});

module.exports = router;
