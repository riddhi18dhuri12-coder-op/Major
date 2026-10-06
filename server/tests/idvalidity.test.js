const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const { api, auth } = h;
const M = require("../src/models");
const bcrypt = require("bcryptjs");
const { computeWindow, idStatus, parseDay, checkIdValidity } = require("../src/services/idValidity");
const { verifyChain } = require("../src/services/ledger");

before(h.setup);
after(h.teardown);

// yyyy-mm-dd for "today + n days" in India time (the zone the validity rules use)
const day = (n = 0) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);

describe("ID validity window (pure logic)", () => {
  test("parseDay: start of day / end of day in IST, blank and junk -> null", () => {
    assert.equal(parseDay("2026-10-06").toISOString(), "2026-10-05T18:30:00.000Z");
    assert.equal(parseDay("2026-10-06", true).toISOString(), "2026-10-06T18:29:59.999Z");
    assert.equal(parseDay(""), null);
    assert.equal(parseDay("soon"), null);
  });

  test("window spans earliest start to latest end; any open-ended trip means no expiry", () => {
    const w = computeWindow([{ start_date: "2026-10-10", end_date: "2026-10-12" }, { start_date: "2026-10-08", end_date: "2026-10-20" }]);
    assert.equal(w.valid_from.toISOString(), parseDay("2026-10-08").toISOString());
    assert.equal(w.valid_until.toISOString(), parseDay("2026-10-20", true).toISOString());
    assert.equal(computeWindow([{ start_date: "2026-10-10", end_date: "2026-10-12" }, { start_date: "2026-10-11" }]).valid_until, null);
    assert.deepEqual(computeWindow([{}]), { valid_from: null, valid_until: null });
  });

  test("visa expiry caps the window; a completed trip ends the visit early", () => {
    const visa = new Date("2026-10-15T00:00:00Z");
    assert.equal(computeWindow([{ start_date: "2026-10-10", end_date: "2026-10-30" }], { visa_expiry: visa }).valid_until.toISOString(), visa.toISOString());
    const done = computeWindow([{ start_date: "2026-10-01", end_date: "2026-12-31", status: "COMPLETED", updated_at: "2026-10-05T10:00:00Z" }]);
    assert.equal(done.valid_until.toISOString(), "2026-10-05T10:00:00.000Z");
  });

  test("status: PENDING before, ACTIVE during, EXPIRED after", () => {
    const w = { valid_from: new Date("2026-10-10T00:00:00Z"), valid_until: new Date("2026-10-12T00:00:00Z") };
    assert.equal(idStatus(w, new Date("2026-10-09T00:00:00Z")), "PENDING");
    assert.equal(idStatus(w, new Date("2026-10-11T00:00:00Z")), "ACTIVE");
    assert.equal(idStatus(w, new Date("2026-10-13T00:00:00Z")), "EXPIRED");
    assert.equal(idStatus({ valid_from: null, valid_until: null }), "ACTIVE");
  });
});

/** Company + tourist on a trip with the given dates, verified by the agency. */
async function verifiedTourist(tag, dates) {
  const co = await h.newCompany(tag + "C");
  const trip = (await api().post("/api/trips").set(auth(co.token)).send({ name: "Trip " + tag, ...dates })).body;
  const tourist = (await api().post(`/api/trips/${trip.id}/tourists`).set(auth(co.token)).send({ name: "T " + tag, email: `${tag}@id.test` })).body;
  const act = await api().post("/api/auth/activate-tourist").send({ tourist_code: tourist.tourist_code, email: tourist.email, password: "password123" });
  const token = act.body.access_token;
  await api().post("/api/verification/submit").set(auth(token)).send({ document_type: "AADHAAR", document_number: "9999 8888 7777" });
  const decision = await api().put(`/api/verification/${tourist.id}/decision`).set(auth(co.token)).send({ decision: "APPROVE" });
  return { co, trip, tourist, token, decision };
}

async function newAuthority(tag) {
  await M.Authority.create({ name: "Auth " + tag, email: `${tag}@auth.test`, password_hash: await bcrypt.hash("password123", 4) });
  return (await api().post("/api/auth/login").send({ email: `${tag}@auth.test`, password: "password123", role: "authority" })).body.access_token;
}

describe("Digital ID valid only for the visit", () => {
  test("ID issued during the visit is ACTIVE and shown to the tourist", async () => {
    const v = await verifiedTourist("idact", { start_date: day(-1), end_date: day(2) });
    assert.equal(v.decision.body.id_validity.status, "ACTIVE");
    const me = (await api().get("/api/verification/me").set(auth(v.token))).body;
    assert.equal(me.id_validity.status, "ACTIVE");
    assert.equal(new Date(me.id_validity.valid_until).toISOString(), parseDay(day(2), true).toISOString());
  });

  test("a visit that has not started is PENDING; one that already ended is EXPIRED", async () => {
    const future = await verifiedTourist("idfut", { start_date: day(3), end_date: day(5) });
    assert.equal(future.decision.body.id_validity.status, "PENDING");
    const past = await verifiedTourist("idpast", { start_date: day(-6), end_date: day(-2) });
    assert.equal(past.decision.body.id_validity.status, "EXPIRED");
  });

  test("scheduler expires an ID when the trip end passes; ledger records it and stays valid; agency is notified", async () => {
    const v = await verifiedTourist("idsched", { start_date: day(-1), end_date: day(1) });
    // simulate time passing: the trip's last day is now behind us, but nothing has re-synced the stored window yet
    await M.Trip.updateOne({ _id: v.trip.id }, { end_date: day(-1) });
    await M.Tourist.updateOne({ _id: v.tourist.id }, { "id_validity.valid_until": new Date(Date.now() - 3600_000) });
    assert.equal((await api().get("/api/verification/me").set(auth(v.token))).body.id_validity.status, "EXPIRED"); // live-computed, never stale
    assert.equal(await checkIdValidity(), 1);
    assert.equal((await M.Tourist.findById(v.tourist.id)).id_validity.status, "EXPIRED");
    assert.equal(await checkIdValidity(), 0); // idempotent

    const events = (await M.ProofBlock.find({ tourist_id: v.tourist.id }).sort({ index: 1 })).map((b) => b.event);
    assert.deepEqual(events, ["ISSUED", "ID_EXPIRED"]);
    assert.equal((await verifyChain()).valid, true);
    assert.ok(await M.Notification.findOne({ company_id: v.co.user.company_id, tourist_id: v.tourist.id, type: "ID_EXPIRED" }));
  });

  test("extending the trip renews the ID and logs ID_RENEWED", async () => {
    const v = await verifiedTourist("idrenew", { start_date: day(-5), end_date: day(-3) });
    assert.equal(v.decision.body.id_validity.status, "EXPIRED");
    const upd = await api().put(`/api/trips/${v.trip.id}`).set(auth(v.co.token)).send({ end_date: day(4) });
    assert.equal(upd.status, 200);
    assert.equal((await api().get("/api/verification/me").set(auth(v.token))).body.id_validity.status, "ACTIVE");
    assert.ok(await M.ProofBlock.findOne({ tourist_id: v.tourist.id, event: "ID_RENEWED" }));
    assert.equal((await verifyChain()).valid, true);
  });

  test("checkpoint proof lookup says valid only while the visit is in progress", async () => {
    const authority = await newAuthority("idauth");
    const live = await verifiedTourist("idlive", { start_date: day(-1), end_date: day(1) });
    const ended = await verifiedTourist("idended", { start_date: day(-6), end_date: day(-2) });
    const ok = (await api().get(`/api/verification/proof/${live.decision.body.digital_id}`).set(auth(authority))).body;
    assert.equal(ok.valid, true);
    assert.equal(ok.id_validity.status, "ACTIVE");
    const bad = (await api().get(`/api/verification/proof/${ended.decision.body.digital_id}`).set(auth(authority))).body;
    assert.equal(bad.valid, false);
    assert.equal(bad.id_validity.status, "EXPIRED");
    assert.equal(bad.chain.valid, true); // identity is genuine, it just isn't valid today
  });

  test("authority tourist list carries ID validity", async () => {
    const authority = await newAuthority("idauth2");
    await verifiedTourist("idlist", { start_date: day(-1), end_date: day(1) });
    const rows = (await api().get("/api/authority/tourists").set(auth(authority))).body;
    assert.ok(rows.some((t) => t.id_validity?.status === "ACTIVE"));
  });
});
