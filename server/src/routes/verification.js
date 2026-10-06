const express = require("express");
const { z } = require("zod");
const { Tourist, ProofBlock, nextSeq } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { appendProof, verifyChain, hashDocument } = require("../services/ledger");
const { syncIdValidity, currentValidity } = require("../services/idValidity");
const { notify } = require("../services/notify");
const { audit } = require("../services/audit");
const { emitToTourist } = require("../services/realtime");
const { pub } = require("../utils/serialize");
const { oid } = require("../utils/ids");
const { bad, conflict, notFound } = require("../utils/errors");

const router = express.Router();
router.use(requireAuth);

const DOMESTIC_DOCS = ["AADHAAR", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT"];

// ---- Tourist submits identity details (simulated verification - no government lookup) -----
router.post("/submit", requireRole("tourist"), async (req, res) => {
  const b = z.object({
    document_type: z.enum(["AADHAAR", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT"]),
    document_number: z.string().trim().min(5).max(30),
    nationality: z.string().trim().max(60).optional(),
    visa_expiry: z.coerce.date().optional(),
  }).parse(req.body);

  const tourist = await Tourist.findById(req.user.id);
  if (tourist.verification?.status === "VERIFIED") throw conflict("You are already verified");
  if (tourist.verification?.status === "PENDING") throw conflict("Your verification is already under review");

  if (tourist.tourist_type === "FOREIGN") {
    if (b.document_type !== "PASSPORT") throw bad("Foreign tourists must provide a passport");
    if (!b.visa_expiry) throw bad("Visa expiry date is required for foreign tourists");
    if (b.visa_expiry <= new Date()) throw bad("Your visa has expired");
  } else if (!DOMESTIC_DOCS.includes(b.document_type)) throw bad("Unsupported document");

  tourist.nationality = b.nationality || tourist.nationality;
  tourist.verification = {
    status: "PENDING",
    document_type: b.document_type,
    document_last4: b.document_number.slice(-4), // the number itself is never stored
    document_hash: hashDocument(b.document_type, b.document_number),
    visa_expiry: b.visa_expiry,
    submitted_at: new Date(),
  };
  await tourist.save();
  await notify({ company_id: tourist.company_id, tourist_id: tourist._id, type: "VERIFICATION", message: `${tourist.name} (${tourist.tourist_code}) submitted ${b.document_type.replace("_", " ")} for verification.` });
  res.status(201).json({ status: "PENDING" });
});

// ---- Tourist: my status + Digital Tourist ID + proof --------------------------------------
router.get("/me", requireRole("tourist"), async (req, res) => {
  const t = await Tourist.findById(req.user.id).lean();
  const v = t.verification || {};
  const proof = v.status === "VERIFIED" ? await ProofBlock.findOne({ tourist_id: t._id }).sort({ index: -1 }).lean() : null;
  res.json({
    status: v.status || "NOT_SUBMITTED",
    digital_id: t.digital_id || null,
    id_validity: currentValidity(t),
    tourist_type: t.tourist_type,
    document_type: v.document_type || null,
    document_last4: v.document_last4 || null,
    rejection_reason: v.rejection_reason || null,
    verified_at: v.reviewed_at && v.status === "VERIFIED" ? v.reviewed_at : null,
    proof: proof && { block_index: proof.index, record_hash: proof.record_hash, block_hash: proof.block_hash, recorded_at: proof.created_at },
  });
});

// ---- Agency / authority review queue --------------------------------------------------------
router.get("/pending", requireRole("company", "authority"), async (req, res) => {
  const filter = { "verification.status": "PENDING" };
  if (req.user.role === "company") filter.company_id = req.user.company_id;
  const rows = await Tourist.find(filter).sort({ "verification.submitted_at": 1 }).limit(200).lean();
  res.json(rows.map((t) => ({
    id: String(t._id), tourist_code: t.tourist_code, name: t.name, email: t.email, tourist_type: t.tourist_type, nationality: t.nationality,
    document_type: t.verification.document_type, document_last4: t.verification.document_last4, visa_expiry: t.verification.visa_expiry, submitted_at: t.verification.submitted_at,
  })));
});

router.put("/:touristId/decision", requireRole("company", "authority"), async (req, res) => {
  const b = z.object({ decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().max(500).optional() }).parse(req.body);
  const filter = { _id: oid(req.params.touristId, "Tourist"), "verification.status": "PENDING" };
  if (req.user.role === "company") filter.company_id = req.user.company_id;
  const tourist = await Tourist.findOne(filter);
  if (!tourist) throw notFound("No pending verification for this tourist");

  if (b.decision === "REJECT") {
    if (!b.reason) throw bad("Please give a reason for rejecting");
    tourist.verification.status = "REJECTED";
    tourist.verification.rejection_reason = b.reason;
  } else {
    if (tourist.tourist_type === "FOREIGN" && tourist.verification.visa_expiry <= new Date()) throw bad("Visa has expired; cannot approve");
    const verified_at = new Date();
    tourist.digital_id ||= `STID-${verified_at.getFullYear()}-${String(await nextSeq("stid")).padStart(4, "0")}`;
    tourist.verification.status = "VERIFIED";
    tourist.verification.rejection_reason = undefined;
    await appendProof({ tourist_id: tourist._id, digital_id: tourist.digital_id, document_hash: tourist.verification.document_hash, verified_at });
    tourist.verification.proof_hash = (await ProofBlock.findOne({ tourist_id: tourist._id }).sort({ index: -1 })).block_hash;
  }
  tourist.verification.reviewed_at = new Date();
  tourist.verification.reviewed_by = req.user.id;
  await tourist.save();
  await audit(req.user, b.decision === "APPROVE" ? "VERIFICATION_APPROVED" : "VERIFICATION_REJECTED", "Tourist", tourist._id, { digital_id: tourist.digital_id, reason: b.reason });
  const id_validity = b.decision === "APPROVE" ? await syncIdValidity(tourist._id) : null; // starts the visit-only validity window
  emitToTourist(tourist._id, "verification:updated", { status: tourist.verification.status, digital_id: tourist.digital_id });
  res.json({ status: tourist.verification.status, digital_id: tourist.digital_id || null, id_validity });
});

// ---- Proof checks -----------------------------------------------------------------------------
// Look up the proof for a Digital ID (e.g. police checking a tourist's ID) and confirm the chain is intact.
router.get("/proof/:digitalId", requireRole("company", "authority"), async (req, res) => {
  const t = await Tourist.findOne({ digital_id: req.params.digitalId }).select("company_id name tourist_code digital_id id_validity verification.status");
  if (!t || (req.user.role === "company" && String(t.company_id) !== req.user.company_id)) throw notFound("Digital ID not found");
  const block = await ProofBlock.findOne({ tourist_id: t._id }).sort({ index: -1 }).lean();
  const id_validity = currentValidity(t);
  const chain = await verifyChain();
  // "valid" is what a checkpoint officer needs: verified identity, intact ledger AND the visit is in progress
  res.json({ digital_id: t.digital_id, name: t.name, status: t.verification?.status, id_validity, valid: t.verification?.status === "VERIFIED" && chain.valid && id_validity?.status === "ACTIVE", chain, proof: block && { block_index: block.index, event: block.event || "ISSUED", record_hash: block.record_hash, block_hash: block.block_hash, recorded_at: block.created_at } });
});

router.get("/ledger", requireRole("authority"), async (req, res) => {
  const [chain, latest] = await Promise.all([verifyChain(), ProofBlock.find().sort({ index: -1 }).limit(20).lean()]);
  res.json({ ...chain, latest: latest.map((b) => ({ index: b.index, digital_id: b.digital_id, event: b.event || "ISSUED", record_hash: b.record_hash, block_hash: b.block_hash, created_at: b.created_at })) });
});

module.exports = router;
