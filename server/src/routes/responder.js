const express = require("express");
const { z } = require("zod");
const { ResponseUnit, Incident, Tourist, EmergencyContact } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { applyStatus } = require("./incidents");
const { emitToAuthority } = require("../services/realtime");
const { pub } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { bad, forbidden, notFound } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth, requireRole("responder"));

router.get("/me", async (req, res) => {
  const unit = await ResponseUnit.findById(req.user.id);
  if (!unit) throw notFound("Unit not found");
  res.json(pub(unit));
});

// The unit reports its own position so dispatchers can pick the nearest one.
router.put("/location", async (req, res) => {
  const b = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).parse(req.body);
  const unit = await ResponseUnit.findByIdAndUpdate(req.user.id, { location: { ...b, updated_at: new Date() } }, { new: true });
  emitToAuthority("unit:location", { id: String(unit._id), ...b });
  res.json({ ok: true });
});

// Go on/off duty. Not allowed mid-incident.
router.put("/availability", async (req, res) => {
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  const unit = await ResponseUnit.findById(req.user.id);
  if (unit.current_incident_id) throw bad("Finish your current incident first");
  unit.status = available ? "AVAILABLE" : "OFFLINE";
  await unit.save();
  emitToAuthority("unit:status", { id: String(unit._id), status: unit.status });
  res.json(pub(unit));
});

// Incident detail for the assigned unit, including what the team needs on arrival.
router.get("/incidents/:id", async (req, res) => {
  const incident = await Incident.findOne({ _id: oid(req.params.id, "Incident"), assigned_unit_id: req.user.id });
  if (!incident) throw notFound("Incident not found");
  const tourist = await Tourist.findById(incident.tourist_id).select("name tourist_code digital_id phone tourist_type nationality risk last_location");
  const contacts = await EmergencyContact.find({ tourist_id: incident.tourist_id }).select("name relationship phone");
  res.json({ ...pub(incident), tourist: pub(tourist), emergency_contacts: contacts.map(pub) });
});

// Responders may only move their own incident forward: RESPONDING -> ON_SITE -> RESOLVED
const NEXT = { ACKNOWLEDGED: ["RESPONDING"], RESPONDING: ["ON_SITE", "RESOLVED"], ON_SITE: ["RESOLVED"] };
router.put("/incidents/:id/status", async (req, res) => {
  const b = z.object({ status: z.enum(["RESPONDING", "ON_SITE", "RESOLVED"]), note: z.string().trim().max(1000).optional() }).parse(req.body);
  const incident = await Incident.findOne({ _id: oid(req.params.id, "Incident"), assigned_unit_id: req.user.id });
  if (!incident) throw notFound("Incident not found");
  if (!(NEXT[incident.status] || []).includes(b.status)) throw forbidden(`Cannot move an incident from ${incident.status} to ${b.status}`);
  res.json(pub(await applyStatus(incident, b, req.user.name)));
});

module.exports = router;
