const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { Tourist, Incident, Zone, ResponseUnit, Company, AuditLog } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { distanceM } = require("../services/geo");
const { applyStatus, broadcast, OPEN_STATES } = require("./incidents");
const { audit } = require("../services/audit");
const { emitToUnit, emitToAuthority } = require("../services/realtime");
const { revokeAllFor } = require("../services/tokens");
const { pub, pubList } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { bad, conflict, notFound } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth);

// ---- Dashboard numbers (authority + response coordinators) ---------------------------
router.get("/overview", requireRole("authority"), async (req, res) => {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [tourists, riskAgg, activeIncidents, units, zoneAgg, resolvedToday, sosOpen] = await Promise.all([
    Tourist.countDocuments({ activated: true }),
    Tourist.aggregate([{ $group: { _id: "$risk.level", n: { $sum: 1 } } }]),
    Incident.countDocuments({ status: { $in: OPEN_STATES } }),
    ResponseUnit.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Zone.aggregate([{ $match: { active: true } }, { $group: { _id: "$type", n: { $sum: 1 } } }]),
    Incident.countDocuments({ status: "RESOLVED", resolved_at: { $gte: startOfDay } }),
    Incident.countDocuments({ type: "SOS", status: { $in: OPEN_STATES } }),
  ]);
  const by = (rows, key) => Object.fromEntries(rows.map((r) => [r._id || key, r.n]));
  const risk = by(riskAgg, "LOW");
  res.json({
    active_tourists: tourists,
    risk: { LOW: risk.LOW || 0, MEDIUM: risk.MEDIUM || 0, HIGH: (risk.HIGH || 0) + (risk.CRITICAL || 0) },
    active_incidents: activeIncidents,
    active_sos: sosOpen,
    resolved_today: resolvedToday,
    units: { AVAILABLE: 0, DISPATCHED: 0, EN_ROUTE: 0, ON_SCENE: 0, OFFLINE: 0, ...by(units) },
    zones: { SAFE: 0, CAUTION: 0, DANGER: 0, RESTRICTED: 0, REST_POINT: 0, ...by(zoneAgg) },
  });
});

// ---- Monitoring: all tourists, optionally by risk ------------------------------------
router.get("/tourists", requireRole("authority"), async (req, res) => {
  const filter = { activated: true };
  if (req.query.risk) filter["risk.level"] = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).parse(req.query.risk);
  const rows = await Tourist.find(filter).sort({ "risk.score": -1 }).limit(500).lean();
  const companies = await Company.find({ _id: { $in: [...new Set(rows.map((t) => String(t.company_id)))] } }).select("name").lean();
  const names = new Map(companies.map((c) => [String(c._id), c.name]));
  res.json(rows.map(({ _id, password_hash, __v, verification, ...t }) => ({ id: String(_id), ...t, verification_status: verification?.status, agency: names.get(String(t.company_id)) })));
});

// ---- Response units ------------------------------------------------------------------
router.get("/units", requireRole("authority"), async (req, res) => {
  res.json(pubList(await ResponseUnit.find().sort({ name: 1 })));
});

router.post("/units", requireRole("authority"), async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(1).max(120), type: z.enum(["POLICE", "RESCUE", "MEDICAL", "LOCAL"]),
    email: z.string().trim().toLowerCase().email(), phone: z.string().trim().max(30).optional(), password: z.string().min(8).max(128),
    latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  }).parse(req.body);
  if (await ResponseUnit.exists({ email: b.email })) throw conflict("A unit with this email already exists");
  const { password, latitude, longitude, ...rest } = b;
  const unit = await ResponseUnit.create({ ...rest, password_hash: await bcrypt.hash(password, 12), ...(latitude != null && longitude != null && { location: { latitude, longitude, updated_at: new Date() } }) });
  await audit(req.user, "UNIT_CREATED", "ResponseUnit", unit._id, { name: unit.name, type: unit.type });
  res.status(201).json(pub(unit));
});

router.delete("/units/:id", requireRole("authority"), async (req, res) => {
  const unit = await ResponseUnit.findById(oid(req.params.id, "Unit"));
  if (!unit) throw notFound("Unit not found");
  if (unit.current_incident_id) throw conflict("This unit is on an active incident. Reassign or resolve it first.");
  await unit.deleteOne();
  await revokeAllFor(unit._id);
  await audit(req.user, "UNIT_DELETED", "ResponseUnit", unit._id, { name: unit.name });
  res.json({ ok: true });
});

// ---- Dispatch -------------------------------------------------------------------------
// Available units sorted by distance to the incident (nearest first), optionally by type.
router.get("/incidents/:id/nearby-units", requireRole("authority"), async (req, res) => {
  const incident = await Incident.findById(oid(req.params.id, "Incident"));
  if (!incident) throw notFound("Incident not found");
  const filter = { status: "AVAILABLE" };
  if (req.query.type) filter.type = z.enum(["POLICE", "RESCUE", "MEDICAL", "LOCAL"]).parse(req.query.type);
  const units = await ResponseUnit.find(filter).lean();
  const here = incident.latitude != null ? { latitude: incident.latitude, longitude: incident.longitude } : null;
  res.json(
    units
      .map(({ _id, password_hash, __v, ...u }) => ({ id: String(_id), ...u, distance_km: here && u.location?.latitude != null ? +(distanceM(here, u.location) / 1000).toFixed(2) : null }))
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
  );
});

router.put("/incidents/:id/assign", requireRole("authority"), async (req, res) => {
  const { unit_id } = z.object({ unit_id: z.string().length(24) }).parse(req.body);
  const incident = await Incident.findById(oid(req.params.id, "Incident"));
  if (!incident) throw notFound("Incident not found");
  if (!OPEN_STATES.includes(incident.status)) throw bad("This incident is already closed");

  // atomic claim: two dispatchers can't grab the same unit
  const unit = await ResponseUnit.findOneAndUpdate({ _id: oid(unit_id, "Unit"), status: "AVAILABLE" }, { status: "DISPATCHED", current_incident_id: incident._id }, { new: true });
  if (!unit) throw conflict("That unit is not available");

  // release a previously assigned unit
  if (incident.assigned_unit_id && String(incident.assigned_unit_id) !== String(unit._id)) {
    await ResponseUnit.updateOne({ _id: incident.assigned_unit_id, current_incident_id: incident._id }, { status: "AVAILABLE", current_incident_id: null });
    emitToUnit(incident.assigned_unit_id, "incident:unassigned", { id: String(incident._id) });
  }
  incident.assigned_unit_id = unit._id;
  incident.assigned_at = new Date();
  if (incident.status === "NEW") incident.status = "ACKNOWLEDGED";
  incident.updates.push({ note: `Assigned to ${unit.name} (${unit.type}) by ${req.user.name}` });
  await incident.save();
  await audit(req.user, "INCIDENT_ASSIGNED", "Incident", incident._id, { unit: unit.name });

  broadcast(incident, "incident:updated", { unit_name: unit.name });
  emitToUnit(unit._id, "incident:assigned", pub(incident));
  res.json({ ...pub(incident), unit_name: unit.name });
});

// ---- Audit log --------------------------------------------------------------------------
router.get("/audit", requireRole("authority"), async (req, res) => {
  res.json(pubList(await AuditLog.find().sort({ created_at: -1 }).limit(Math.min(Number(req.query.limit) || 100, 500))));
});

module.exports = router;
