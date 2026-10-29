const express = require("express");
const { z } = require("zod");
const { Incident, Tourist, ResponseUnit, nextSeq } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sosLimiter } = require("../middleware/rateLimit");
const { emitToCompany, emitToAuthority, emitToUnit } = require("../services/realtime");
const { notify } = require("../services/notify");
const { pub } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { notFound, bad } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth);

const coords = { latitude: z.number().min(-90).max(90).nullish(), longitude: z.number().min(-180).max(180).nullish(), trip_id: z.string().length(24).nullish() };
const OPEN_STATES = ["NEW", "ACKNOWLEDGED", "RESPONDING", "ON_SITE"];
const STATUSES = ["NEW", "ACKNOWLEDGED", "RESPONDING", "ON_SITE", "RESOLVED", "FALSE_ALARM"];

// authorities see every company; companies/guides/tourists only their own
const scopeFor = (user) => (user.role === "authority" || user.role === "responder" ? {} : { company_id: user.company_id }); // responders are narrowed to their assigned incidents by the routes

/** Push to every audience that should see this incident. */
function broadcast(incident, event, extra = {}) {
  const payload = { ...pub(incident), ...extra };
  emitToCompany(incident.company_id, event, payload);
  emitToAuthority(event, payload);
  if (incident.assigned_unit_id) emitToUnit(incident.assigned_unit_id, event, payload);
}

const newCode = async () => `INC-${1000 + (await nextSeq("incident"))}`;

// ---- SOS: tourist presses the emergency button ------------------------------
router.post("/sos", requireRole("tourist"), sosLimiter, async (req, res) => {
  const b = z.object(coords).parse(req.body);
  const tourist = await Tourist.findById(req.user.id);

  // A second press while an SOS is still open re-sends the alert but doesn't create a duplicate case.
  let incident = await Incident.findOne({ tourist_id: tourist._id, type: "SOS", status: { $in: OPEN_STATES } });
  if (!incident) {
    incident = await Incident.create({
      incident_code: await newCode(),
      company_id: tourist.company_id,
      trip_id: b.trip_id || null,
      tourist_id: tourist._id,
      type: "SOS",
      severity: "CRITICAL",
      description: "Emergency SOS triggered",
      latitude: b.latitude ?? undefined,
      longitude: b.longitude ?? undefined,
      updates: [{ note: "SOS triggered by tourist" }],
    });
  }
  await Tourist.updateOne({ _id: tourist._id }, { status: "EMERGENCY" });

  broadcast(incident, "sos:alert", { tourist_name: tourist.name, tourist_code: tourist.tourist_code });
  await notify({ company_id: tourist.company_id, tourist_id: tourist._id, type: "SOS", authority: true, message: `SOS from ${tourist.name} (${tourist.tourist_code}) — ${incident.incident_code}` });
  res.status(201).json(pub(incident));
});

// ---- Report a non-SOS incident ----------------------------------------------
router.post("/", requireRole("tourist"), async (req, res) => {
  const b = z
    .object({
      ...coords,
      type: z.enum(["MEDICAL", "ACCIDENT", "LOST", "THEFT", "HARASSMENT", "UNSAFE", "TRANSPORT", "OTHER"]),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      description: z.string().trim().max(2000).optional(),
    })
    .parse(req.body);
  const tourist = await Tourist.findById(req.user.id);
  const incident = await Incident.create({
    incident_code: await newCode(),
    company_id: tourist.company_id,
    tourist_id: tourist._id,
    trip_id: b.trip_id || null,
    type: b.type,
    severity: b.severity,
    description: b.description,
    latitude: b.latitude ?? undefined,
    longitude: b.longitude ?? undefined,
    updates: [{ note: "Incident reported by tourist" }],
  });
  broadcast(incident, "incident:new", { tourist_name: tourist.name, tourist_code: tourist.tourist_code });
  res.status(201).json(pub(incident));
});

// ---- List / view ----------------------------------------------------------------
router.get("/", async (req, res) => {
  const filter = scopeFor(req.user);
  if (req.user.role === "tourist") filter.tourist_id = req.user.id;
  if (req.user.role === "responder") filter.assigned_unit_id = req.user.id;
  if (req.query.status) filter.status = z.enum(STATUSES).parse(req.query.status);
  if (req.query.active === "true") filter.status = { $in: OPEN_STATES };
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const rows = await Incident.find(filter).sort({ created_at: -1 }).limit(limit).populate("tourist_id", "name tourist_code");
  res.json(rows.map((i) => ({ ...pub({ ...i.toObject(), tourist_id: i.tourist_id?._id }), tourist_name: i.tourist_id?.name, tourist_code: i.tourist_id?.tourist_code })));
});

router.get("/:id", async (req, res) => {
  const filter = { _id: oid(req.params.id, "Incident"), ...scopeFor(req.user) };
  if (req.user.role === "tourist") filter.tourist_id = req.user.id;
  if (req.user.role === "responder") filter.assigned_unit_id = req.user.id;
  const incident = await Incident.findOne(filter).populate("tourist_id", "tourist_code name email phone");
  if (!incident) throw notFound("Incident not found");
  const t = incident.tourist_id;
  res.json({ ...pub({ ...incident.toObject(), tourist_id: t?._id }), tourist: t ? { id: String(t._id), tourist_code: t.tourist_code, name: t.name, email: t.email, phone: t.phone } : null });
});

// ---- Update status (company, guide, authority; responders use /responder/...) -------
async function applyStatus(incident, { status, note }, actorName) {
  const closing = status === "RESOLVED" || status === "FALSE_ALARM";
  incident.status = status;
  if (note) incident.resolution_note = note;
  incident.resolved_at = closing ? new Date() : undefined;
  if (status === "ON_SITE") incident.on_site_at = new Date();
  incident.updates.push({ note: note || `Status changed to ${status} by ${actorName}` });
  await incident.save();

  if (closing) {
    // free the response unit
    if (incident.assigned_unit_id) await ResponseUnit.updateOne({ _id: incident.assigned_unit_id, current_incident_id: incident._id }, { status: "AVAILABLE", current_incident_id: null });
    // tourist returns to NORMAL only when no other emergency of theirs is still open
    if (!(await Incident.exists({ tourist_id: incident.tourist_id, type: "SOS", status: { $in: OPEN_STATES }, _id: { $ne: incident._id } }))) {
      await Tourist.updateOne({ _id: incident.tourist_id, status: "EMERGENCY" }, { status: "NORMAL" });
    }
  } else if (incident.assigned_unit_id) {
    const unitStatus = { RESPONDING: "EN_ROUTE", ON_SITE: "ON_SCENE" }[status];
    if (unitStatus) await ResponseUnit.updateOne({ _id: incident.assigned_unit_id }, { status: unitStatus });
  }
  broadcast(incident, "incident:updated");
  return incident;
}

router.put("/:id/status", requireRole("company", "guide", "authority"), async (req, res) => {
  const b = z.object({ status: z.enum(STATUSES), note: z.string().trim().max(1000).optional() }).parse(req.body);
  const incident = await Incident.findOne({ _id: oid(req.params.id, "Incident"), ...scopeFor(req.user) });
  if (!incident) throw notFound("Incident not found");
  res.json(pub(await applyStatus(incident, b, req.user.name)));
});

// ---- Tourist closes their own case: "the problem is solved" / "pressed by mistake" -------------
// Stops the alert for the agency, the authorities and any assigned unit (which is freed).
router.put("/:id/self-resolve", requireRole("tourist"), async (req, res) => {
  const b = z.object({ outcome: z.enum(["RESOLVED", "FALSE_ALARM"]).default("RESOLVED"), note: z.string().trim().max(500).optional() }).parse(req.body || {});
  const incident = await Incident.findOne({ _id: oid(req.params.id, "Incident"), tourist_id: req.user.id });
  if (!incident) throw notFound("Incident not found");
  if (!OPEN_STATES.includes(incident.status)) throw bad("This case is already closed");

  const tourist = await Tourist.findById(req.user.id);
  const what = b.outcome === "RESOLVED" ? "the problem is solved" : "the alert was sent by mistake";
  const note = `Closed by the tourist: ${what}${b.note ? ` — ${b.note}` : ""}`;
  await applyStatus(incident, { status: b.outcome, note }, tourist.name);
  await notify({ company_id: tourist.company_id, tourist_id: tourist._id, type: "SOS_CLEARED", authority: true, message: `${tourist.name} (${tourist.tourist_code}) reports ${what} — ${incident.incident_code} closed` });
  res.json(pub(incident));
});

module.exports = router;
module.exports.applyStatus = applyStatus;
module.exports.broadcast = broadcast;
module.exports.STATUSES = STATUSES;
module.exports.OPEN_STATES = OPEN_STATES;
