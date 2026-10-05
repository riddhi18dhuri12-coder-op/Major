const express = require("express");
const { Notification } = require("../models");
const { requireAuth, requireRole } = require("../middleware/auth");
const { pubList } = require("../utils/serialize");
const { oid } = require("../utils/ids");

const router = express.Router();
router.use(requireAuth, requireRole("company", "guide", "authority"));

const scope = (user) => (user.role === "authority" ? { audience: "AUTHORITY" } : { audience: "COMPANY", company_id: user.company_id });

router.get("/", async (req, res) => {
  res.json(pubList(await Notification.find(scope(req.user)).sort({ created_at: -1 }).limit(50)));
});

router.put("/read-all", async (req, res) => {
  await Notification.updateMany({ ...scope(req.user), read: false }, { read: true });
  res.json({ ok: true });
});

router.put("/:id/read", async (req, res) => {
  await Notification.updateOne({ _id: oid(req.params.id, "Notification"), ...scope(req.user) }, { read: true });
  res.json({ ok: true });
});

module.exports = router;
