const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { Company, Guide, Tourist, Authority, ResponseUnit } = require("../models");
const { issuePair, consumeRefresh, revokeRefresh } = require("../services/tokens");
const { authLimiter } = require("../middleware/rateLimit");
const { pub } = require("../utils/serialize");
const { conflict, unauthorized, notFound } = require("../utils/errors");

const router = express.Router();
router.use(authLimiter);

const COST = 12;
const password = z.string().min(8, "Password must be at least 8 characters").max(128);
const email = z.string().trim().toLowerCase().email();
const Models = { company: Company, guide: Guide, tourist: Tourist, authority: Authority, responder: ResponseUnit };

let dummyHash; // compared against when the account doesn't exist, so response time doesn't reveal it
const getDummyHash = () => (dummyHash ||= bcrypt.hashSync("not-a-real-password", COST));

/** Shape used for tokens + responses: { id, role, company_id, name, email } plus public fields. */
function sessionUser(record, role) {
  const base = pub(record);
  const company_id = role === "company" ? base.id : record.company_id ? String(record.company_id) : undefined;
  return { ...base, role, ...(company_id && { company_id }) };
}

router.post("/register-company", async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(120), email, phone: z.string().trim().max(30).optional(), address: z.string().trim().max(300).optional(), password }).parse(req.body);
  if (await Company.exists({ email: b.email })) throw conflict("Email already registered");
  const company = await Company.create({ ...b, password_hash: await bcrypt.hash(b.password, COST) });
  const user = sessionUser(company, "company");
  res.status(201).json({ ...(await issuePair(user)), user });
});

router.post("/login", async (req, res) => {
  const b = z.object({ email, password: z.string().min(1).max(128), role: z.enum(["company", "guide", "tourist", "authority", "responder"]) }).parse(req.body);
  const record = await Models[b.role].findOne({ email: b.email });
  const ok = await bcrypt.compare(b.password, record?.password_hash || getDummyHash());
  if (!record || !record.password_hash || !ok) throw unauthorized("Invalid credentials");
  const user = sessionUser(record, b.role);
  res.json({ ...(await issuePair(user)), user });
});

// A tourist activates the invite their company created. Needs BOTH the tourist ID and the
// email the company registered, and works only once.
router.post("/activate-tourist", async (req, res) => {
  const b = z.object({ tourist_code: z.string().trim().min(1), email, password }).parse(req.body);
  const tourist = await Tourist.findOne({ tourist_code: b.tourist_code, email: b.email });
  if (!tourist) throw notFound("No invite found for that Tourist ID and email");
  if (tourist.activated) throw conflict("This account is already activated. Please sign in.");
  tourist.password_hash = await bcrypt.hash(b.password, COST);
  tourist.activated = true;
  await tourist.save();
  const user = sessionUser(tourist, "tourist");
  res.json({ ...(await issuePair(user)), user });
});

router.post("/refresh", async (req, res) => {
  const { refresh_token } = z.object({ refresh_token: z.string().min(1) }).parse(req.body);
  const { id, role } = await consumeRefresh(refresh_token);
  const record = await Models[role]?.findById(id);
  if (!record) throw unauthorized("Account no longer exists");
  const user = sessionUser(record, role);
  res.json({ ...(await issuePair(user)), user });
});

router.post("/logout", async (req, res) => {
  const { refresh_token } = z.object({ refresh_token: z.string().min(1) }).parse(req.body);
  await revokeRefresh(refresh_token);
  res.json({ ok: true });
});

module.exports = router;
