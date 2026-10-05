const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { Guide, Tourist, Trip, EmergencyContact } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { revokeAllFor } = require("../services/tokens");
const { pub, pubList } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { conflict, notFound } = require("../utils/errors");

const router = express.Router();
router.use(["/guides", "/tourists", "/me"], requireAuth); // scoped so unknown /api URLs fall through to a clean 404

// ---- Guides (company only) ----------------------------------------------------
router.get("/guides", requireRole("company"), async (req, res) => {
  const company_id = oid(req.user.company_id);
  const [guides, counts] = await Promise.all([
    Guide.find({ company_id }).sort({ created_at: -1 }),
    Trip.aggregate([{ $match: { company_id, guide_id: { $ne: null } } }, { $group: { _id: "$guide_id", n: { $sum: 1 } } }]),
  ]);
  const byGuide = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(guides.map((g) => ({ ...pub(g), trip_count: byGuide.get(String(g._id)) || 0 })));
});

router.post("/guides", requireRole("company"), async (req, res) => {
  const b = z
    .object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(30).optional(),
      password: z.string().min(8).max(128),
    })
    .parse(req.body);
  if (await Guide.exists({ email: b.email })) throw conflict("A guide with this email already exists");
  const guide = await Guide.create({ company_id: req.user.company_id, name: b.name, email: b.email, phone: b.phone, password_hash: await bcrypt.hash(b.password, 12) });
  res.status(201).json(pub(guide));
});

router.delete("/guides/:id", requireRole("company"), async (req, res) => {
  const guide = await Guide.findOneAndDelete({ _id: oid(req.params.id, "Guide"), company_id: req.user.company_id });
  if (!guide) throw notFound("Guide not found");
  await Promise.all([Trip.updateMany({ guide_id: guide._id }, { guide_id: null }), revokeAllFor(guide._id)]);
  res.json({ ok: true });
});

// ---- Tourists (company / guide view) --------------------------------------------
router.get("/tourists", requireRole("company", "guide"), async (req, res) => {
  const rows = await Tourist.find({ company_id: req.user.company_id }).sort({ created_at: -1 }).limit(1000);
  res.json(pubList(rows));
});

router.get("/tourists/:id", requireRole("company", "guide"), async (req, res) => {
  const tourist = await Tourist.findOne({ _id: oid(req.params.id, "Tourist"), company_id: req.user.company_id });
  if (!tourist) throw notFound("Tourist not found");
  res.json(pub(tourist));
});

// ---- Tourist self-service ---------------------------------------------------------
router.get("/me/profile", requireRole("tourist"), async (req, res) => {
  const tourist = await Tourist.findById(req.user.id);
  if (!tourist) throw notFound("Tourist not found");
  res.json(pub(tourist));
});

router.get("/me/contacts", requireRole("tourist"), async (req, res) => {
  res.json(pubList(await EmergencyContact.find({ tourist_id: req.user.id }).sort({ created_at: 1 })));
});

router.post("/me/contacts", requireRole("tourist"), async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(120), relationship: z.string().trim().max(60).optional(), phone: z.string().trim().min(5).max(30) }).parse(req.body);
  if ((await EmergencyContact.countDocuments({ tourist_id: req.user.id })) >= 10) throw conflict("You can store up to 10 emergency contacts");
  res.status(201).json(pub(await EmergencyContact.create({ ...b, tourist_id: req.user.id })));
});

router.delete("/me/contacts/:id", requireRole("tourist"), async (req, res) => {
  const r = await EmergencyContact.deleteOne({ _id: oid(req.params.id, "Contact"), tourist_id: req.user.id });
  if (!r.deletedCount) throw notFound("Contact not found");
  res.json({ ok: true });
});

module.exports = router;
