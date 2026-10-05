const express = require("express");
const { z } = require("zod");
const { SafetyCheck, TravelSession, Tourist } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { pub, pubList } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { bad, conflict, notFound } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth);

// ---- "I'm Safe" -----------------------------------------------------------------
router.post("/check-in", requireRole("tourist"), async (req, res) => {
  const b = z.object({ latitude: z.number().min(-90).max(90).nullish(), longitude: z.number().min(-180).max(180).nullish() }).parse(req.body);
  await SafetyCheck.create({ tourist_id: req.user.id, status: "SAFE", latitude: b.latitude ?? undefined, longitude: b.longitude ?? undefined });
  // checking in clears an Attention flag but never silences an active Emergency
  await Tourist.updateOne({ _id: req.user.id }, { last_check_in_at: new Date() });
  await Tourist.updateOne({ _id: req.user.id, status: "ATTENTION" }, { status: "NORMAL" });
  res.status(201).json({ ok: true, checked_in_at: new Date().toISOString() });
});

router.get("/checks/:touristId", requireRole("company", "guide"), async (req, res) => {
  const tourist_id = oid(req.params.touristId, "Tourist");
  if (!(await Tourist.exists({ _id: tourist_id, company_id: req.user.company_id }))) throw notFound("Tourist not found");
  res.json(pubList(await SafetyCheck.find({ tourist_id }).sort({ created_at: -1 }).limit(50)));
});

// ---- Independent travel -----------------------------------------------------------
router.post("/independent-travel", requireRole("tourist"), async (req, res) => {
  const b = z.object({ destination: z.string().trim().max(160).optional(), expected_return: z.coerce.date() }).parse(req.body);
  if (b.expected_return.getTime() < Date.now() - 60_000) throw bad("expected_return must be in the future");
  if (await TravelSession.exists({ tourist_id: req.user.id, status: { $in: ["ACTIVE", "OVERDUE"] } })) {
    throw conflict("You already have an independent trip in progress. End it first.");
  }
  res.status(201).json(pub(await TravelSession.create({ tourist_id: req.user.id, destination: b.destination, expected_return: b.expected_return })));
});

router.put("/independent-travel/:id/end", requireRole("tourist"), async (req, res) => {
  const session = await TravelSession.findOneAndUpdate(
    { _id: oid(req.params.id, "Session"), tourist_id: req.user.id, status: { $in: ["ACTIVE", "OVERDUE"] } },
    { status: "RETURNED", ended_at: new Date() },
    { new: true }
  );
  if (!session) throw notFound("No open session found");
  await Tourist.updateOne({ _id: req.user.id, status: "ATTENTION" }, { status: "NORMAL" });
  res.json(pub(session));
});

router.get("/independent-travel/current", requireRole("tourist"), async (req, res) => {
  const row = await TravelSession.findOne({ tourist_id: req.user.id, status: { $in: ["ACTIVE", "OVERDUE"] } }).sort({ created_at: -1 });
  res.json(row ? pub(row) : null);
});

// Company/guide: sessions currently past their expected return
router.get("/independent-travel/overdue", requireRole("company", "guide"), async (req, res) => {
  const tourists = await Tourist.find({ company_id: req.user.company_id }).select("name tourist_code").lean();
  const byId = new Map(tourists.map((t) => [String(t._id), t]));
  const rows = await TravelSession.find({ tourist_id: { $in: tourists.map((t) => t._id) }, status: { $in: ["ACTIVE", "OVERDUE"] }, expected_return: { $lt: new Date() } });
  res.json(rows.map((s) => ({ ...pub(s), tourist_name: byId.get(String(s.tourist_id))?.name, tourist_code: byId.get(String(s.tourist_id))?.tourist_code })));
});

module.exports = router;
