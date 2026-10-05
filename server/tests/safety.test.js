const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const { api, auth } = h;
const M = require("../src/models");
const { distanceM, inPolygon, zonesAt } = require("../src/services/geo");
const { assessRisk, stationaryMinutes } = require("../src/services/risk");
const { verifyChain } = require("../src/services/ledger");
const { invalidateZones } = require("../src/services/zones");

before(h.setup);
after(h.teardown);

const circle = (name, type, latitude, longitude, radius_m, extra = {}) => ({ name, type, shape: { kind: "CIRCLE", center: { latitude, longitude }, radius_m }, ...extra });

describe("geo + risk (pure logic)", () => {
  test("distance and point-in-polygon", () => {
    const d = distanceM({ latitude: 18.9220, longitude: 72.8347 }, { latitude: 18.5204, longitude: 73.8567 });
    assert.ok(d > 110_000 && d < 125_000, `Mumbai-Pune ~ 120km, got ${d}`);
    const sq = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 2 }, { latitude: 2, longitude: 2 }, { latitude: 2, longitude: 0 }];
    assert.equal(inPolygon({ latitude: 1, longitude: 1 }, sq), true);
    assert.equal(inPolygon({ latitude: 3, longitude: 1 }, sq), false);
  });

  test("overlapping zones: most restrictive wins; inactive zones ignored", () => {
    const zs = [
      { _id: 1, type: "SAFE", active: true, shape: { kind: "CIRCLE", center: { latitude: 0, longitude: 0 }, radius_m: 5000 } },
      { _id: 2, type: "DANGER", active: true, shape: { kind: "CIRCLE", center: { latitude: 0, longitude: 0 }, radius_m: 500 } },
      { _id: 3, type: "RESTRICTED", active: false, shape: { kind: "CIRCLE", center: { latitude: 0, longitude: 0 }, radius_m: 500 } },
    ];
    assert.equal(zonesAt({ latitude: 0, longitude: 0 }, zs)[0]._id, 2);
  });

  const base = { zone: null, atRestPoint: false, stationaryMin: 0, minutesSinceUpdate: 0, localHour: 12, activeSos: false, overdueTravel: false, missedCheckIn: false, nearbyIncidents: 0 };

  test("normal rest at a rest point is NOT risky (README scenario 1)", () => {
    const r = assessRisk({ ...base, zone: { type: "SAFE", name: "Base" }, atRestPoint: true, stationaryMin: 130 });
    assert.equal(r.level, "LOW");
    assert.match(r.factors.join(" "), /normal behaviour/);
  });

  test("danger zone + inactivity + silence + night raises risk with reasons (scenario 2)", () => {
    const r = assessRisk({ ...base, zone: { type: "DANGER", name: "Cliff" }, stationaryMin: 150, minutesSinceUpdate: 40, localHour: 23 });
    assert.ok(r.score >= 60 && ["HIGH", "CRITICAL"].includes(r.level), `score ${r.score}`);
    assert.ok(r.factors.length >= 3);
  });

  test("an active SOS is critical; score is capped at 100", () => {
    const r = assessRisk({ ...base, activeSos: true, zone: { type: "RESTRICTED", name: "X" }, overdueTravel: true });
    assert.equal(r.level, "CRITICAL");
    assert.equal(r.score, 100);
  });

  test("stationary minutes measured from the oldest nearby point", () => {
    const now = new Date();
    const pts = [0, 30, 60, 90].map((m) => ({ latitude: 18.5, longitude: 73.8, recorded_at: new Date(now - m * 60000) }));
    assert.ok(Math.abs(stationaryMinutes(pts, now) - 90) < 0.1);
    pts.push({ latitude: 19.5, longitude: 73.8, recorded_at: new Date(now - 200 * 60000) }); // far away -> ignored
    assert.ok(Math.abs(stationaryMinutes(pts, now) - 90) < 0.1);
  });
});

describe("zones API + geofencing", () => {
  test("only authorities manage zones; everyone can read active ones; validation", async () => {
    const auth1 = await h.newAuthority("zonesA");
    const co = await h.newCompany("zonesC");
    const t = await h.newTouristOnTrip(co, "zonesT");
    const body = circle("Cliff", "DANGER", 18.7345, 73.4018, 600, { risk_level: "HIGH", description: "Steep drop" });
    assert.equal((await api().post("/api/zones").set(auth(co.token)).send(body)).status, 403);
    assert.equal((await api().post("/api/zones").set(auth(t.token)).send(body)).status, 403);
    assert.equal((await api().post("/api/zones").set(auth(auth1.token)).send({ ...body, type: "BOGUS" })).status, 400);
    assert.equal((await api().post("/api/zones").set(auth(auth1.token)).send({ ...body, shape: { kind: "POLYGON", polygon: [{ latitude: 1, longitude: 1 }] } })).status, 400);
    const ok = await api().post("/api/zones").set(auth(auth1.token)).send(body);
    assert.equal(ok.status, 201);
    assert.ok((await api().get("/api/zones").set(auth(t.token))).body.some((z) => z.id === ok.body.id));
    // deactivate -> hidden from tourists
    await api().put(`/api/zones/${ok.body.id}`).set(auth(auth1.token)).send({ active: false });
    assert.ok(!(await api().get("/api/zones").set(auth(t.token))).body.some((z) => z.id === ok.body.id));
    assert.equal((await api().delete(`/api/zones/${ok.body.id}`).set(auth(auth1.token))).status, 200);
    assert.ok((await api().get("/api/authority/audit").set(auth(auth1.token))).body.some((a) => a.action === "ZONE_CREATED"));
  });

  test("entering a danger zone warns the tourist once and alerts company + authority; risk rises", async () => {
    const authy = await h.newAuthority("geoA");
    const co = await h.newCompany("geoC");
    const t = await h.newTouristOnTrip(co, "geoT");
    await api().post("/api/zones").set(auth(authy.token)).send(circle("Cliff Edge", "DANGER", 10.0, 10.0, 500, { description: "Steep drop" }));
    invalidateZones();
    await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true });

    const outside = await api().post("/api/location").set(auth(t.token)).send({ latitude: 11, longitude: 11 });
    assert.equal(outside.body.zone, null);
    assert.deepEqual(outside.body.warnings, []);

    const inside = await api().post("/api/location").set(auth(t.token)).send({ latitude: 10.001, longitude: 10.001 });
    assert.equal(inside.body.zone.name, "Cliff Edge");
    assert.equal(inside.body.warnings.length, 1);
    assert.ok(inside.body.risk.factors.some((f) => /danger zone/.test(f)));

    // staying inside doesn't spam
    assert.equal((await api().post("/api/location").set(auth(t.token)).send({ latitude: 10.0012, longitude: 10.0012 })).body.warnings.length, 0);

    assert.ok((await api().get("/api/notifications").set(auth(co.token))).body.some((n) => n.type === "ZONE_ALERT"));
    assert.ok((await api().get("/api/notifications").set(auth(authy.token))).body.some((n) => n.type === "ZONE_ALERT" && /Cliff Edge/.test(n.message)));
    // company notifications are not visible to another company
    const other = await h.newCompany("geoOther");
    assert.ok(!(await api().get("/api/notifications").set(auth(other.token))).body.some((n) => n.type === "ZONE_ALERT"));
    const live = (await api().get("/api/location/live").set(auth(co.token))).body[0];
    assert.equal(live.current_zone.type, "DANGER");
    assert.ok(live.risk.score >= 35);
  });

  test("a restricted zone with night + silence + inactivity reaches HIGH and raises an attention event, not an emergency", async () => {
    const authy = await h.newAuthority("riskA");
    const co = await h.newCompany("riskC");
    const t = await h.newTouristOnTrip(co, "riskT");
    await api().post("/api/zones").set(auth(authy.token)).send(circle("No Entry", "RESTRICTED", 20.0, 20.0, 800));
    invalidateZones();
    await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true });
    // 3 hours of no movement inside the restricted zone
    for (const mins of [180, 120, 60]) {
      await M.Location.create({ tourist_id: t.tourist.id, company_id: co.user.id, latitude: 20.0, longitude: 20.0, recorded_at: new Date(Date.now() - mins * 60000) });
    }
    const r = await api().post("/api/location").set(auth(t.token)).send({ latitude: 20.0, longitude: 20.0 });
    assert.ok(r.body.risk.score >= 60, `score ${r.body.risk.score}`);
    const profile = (await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body;
    assert.equal(profile.status, "ATTENTION"); // not EMERGENCY
    assert.equal((await api().get("/api/incidents").set(auth(co.token))).body.length, 0);
    assert.ok((await api().get("/api/notifications").set(auth(authy.token))).body.some((n) => n.type === "HIGH_RISK"));
  });
});

describe("incident dispatch workflow", () => {
  test("SOS -> acknowledge via assignment -> responder en route -> on site -> resolved", async () => {
    const authy = await h.newAuthority("dispA");
    const co = await h.newCompany("dispC");
    const t = await h.newTouristOnTrip(co, "dispT");
    const near = await h.newUnit(authy, "dispNear", { type: "RESCUE", latitude: 18.76, longitude: 73.41 });
    const far = await h.newUnit(authy, "dispFar", { type: "RESCUE", latitude: 28.6, longitude: 77.2 });
    await api().post("/api/me/contacts").set(auth(t.token)).send({ name: "Mom", phone: "9999999999" });

    const sos = (await api().post("/api/incidents/sos").set(auth(t.token)).send({ latitude: 18.7557, longitude: 73.4091 })).body;
    assert.equal(sos.status, "NEW");
    // authority sees it (any company), a different company does not
    assert.ok((await api().get("/api/incidents").set(auth(authy.token))).body.some((i) => i.id === sos.id));
    assert.ok((await api().get("/api/notifications").set(auth(authy.token))).body.some((n) => n.type === "SOS"));
    const other = await h.newCompany("dispOther");
    assert.equal((await api().get(`/api/incidents/${sos.id}`).set(auth(other.token))).status, 404);

    // nearest unit first
    const nearby = (await api().get(`/api/authority/incidents/${sos.id}/nearby-units`).set(auth(authy.token))).body;
    assert.equal(nearby[0].id, near.id);
    assert.ok(nearby[0].distance_km < nearby[1].distance_km);

    // only authorities dispatch
    assert.equal((await api().put(`/api/authority/incidents/${sos.id}/assign`).set(auth(co.token)).send({ unit_id: near.id })).status, 403);
    const assigned = await api().put(`/api/authority/incidents/${sos.id}/assign`).set(auth(authy.token)).send({ unit_id: near.id });
    assert.equal(assigned.body.status, "ACKNOWLEDGED");
    assert.equal(assigned.body.assigned_unit_id, near.id);
    // the same unit can't be double-booked
    const sos2Tourist = await h.newTouristOnTrip(co, "dispT2");
    const sos2 = (await api().post("/api/incidents/sos").set(auth(sos2Tourist.token)).send({})).body;
    assert.equal((await api().put(`/api/authority/incidents/${sos2.id}/assign`).set(auth(authy.token)).send({ unit_id: near.id })).status, 409);

    // responder sees only their incident, with the tourist's emergency contacts
    assert.equal((await api().get("/api/incidents").set(auth(near.token))).body.length, 1);
    assert.equal((await api().get("/api/incidents").set(auth(far.token))).body.length, 0);
    const detail = (await api().get(`/api/responder/incidents/${sos.id}`).set(auth(near.token))).body;
    assert.equal(detail.emergency_contacts[0].name, "Mom");
    assert.equal((await api().get(`/api/responder/incidents/${sos.id}`).set(auth(far.token))).status, 404);

    // status must move forward in order
    assert.equal((await api().put(`/api/responder/incidents/${sos.id}/status`).set(auth(near.token)).send({ status: "ON_SITE" })).status, 403);
    assert.equal((await api().put(`/api/responder/incidents/${sos.id}/status`).set(auth(near.token)).send({ status: "RESPONDING" })).body.status, "RESPONDING");
    assert.equal((await api().get("/api/authority/units").set(auth(authy.token))).body.find((u) => u.id === near.id).status, "EN_ROUTE");
    assert.equal((await api().put(`/api/responder/incidents/${sos.id}/status`).set(auth(near.token)).send({ status: "ON_SITE" })).body.status, "ON_SITE");
    assert.equal((await api().get("/api/authority/units").set(auth(authy.token))).body.find((u) => u.id === near.id).status, "ON_SCENE");
    const done = await api().put(`/api/responder/incidents/${sos.id}/status`).set(auth(near.token)).send({ status: "RESOLVED", note: "Tourist is safe" });
    assert.equal(done.body.status, "RESOLVED");

    // unit freed, tourist back to normal, full timeline recorded
    assert.equal((await api().get("/api/authority/units").set(auth(authy.token))).body.find((u) => u.id === near.id).status, "AVAILABLE");
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "NORMAL");
    const full = (await api().get(`/api/incidents/${sos.id}`).set(auth(authy.token))).body;
    assert.ok(full.updates.length >= 5);
    assert.ok(full.on_site_at);
    // closed incidents can't be reassigned
    assert.equal((await api().put(`/api/authority/incidents/${sos.id}/assign`).set(auth(authy.token)).send({ unit_id: far.id })).status, 400);
  });

  test("overview numbers, tourist monitoring list, unit management rules", async () => {
    const authy = await h.newAuthority("ovA");
    const co = await h.newCompany("ovC");
    await h.newTouristOnTrip(co, "ovT");
    const ov = (await api().get("/api/authority/overview").set(auth(authy.token))).body;
    assert.ok(ov.active_tourists >= 1);
    assert.ok("HIGH" in ov.risk && "AVAILABLE" in ov.units && "DANGER" in ov.zones);
    assert.equal((await api().get("/api/authority/overview").set(auth(co.token))).status, 403);
    assert.ok((await api().get("/api/authority/tourists").set(auth(authy.token))).body.length >= 1);
    assert.equal((await api().get("/api/authority/tourists").set(auth(co.token))).status, 403);

    const unit = await h.newUnit(authy, "ovUnit");
    assert.equal((await api().post("/api/authority/units").set(auth(authy.token)).send({ name: "Dup", type: "RESCUE", email: "ovUnit@unit.test", password: "password123" })).status, 409);
    // responder availability toggle
    assert.equal((await api().put("/api/responder/availability").set(auth(unit.token)).send({ available: false })).body.status, "OFFLINE");
    assert.equal((await api().put("/api/responder/location").set(auth(unit.token)).send({ latitude: 18.5, longitude: 73.8 })).status, 200);
    assert.equal((await api().get("/api/responder/me").set(auth(h.api && authy.token))).status, 403);
    assert.equal((await api().delete(`/api/authority/units/${unit.id}`).set(auth(authy.token))).status, 200);
  });
});

describe("verification + proof ledger", () => {
  test("tourist submits, agency approves, Digital ID issued, proof recorded without personal data", async () => {
    const co = await h.newCompany("verC");
    const t = await h.newTouristOnTrip(co, "verT");
    assert.equal((await api().get("/api/verification/me").set(auth(t.token))).body.status, "NOT_SUBMITTED");
    assert.equal((await api().post("/api/verification/submit").set(auth(t.token)).send({ document_type: "AADHAAR", document_number: "12" })).status, 400);
    const sub = await api().post("/api/verification/submit").set(auth(t.token)).send({ document_type: "AADHAAR", document_number: "1234 5678 9012" });
    assert.equal(sub.status, 201);
    assert.equal((await api().post("/api/verification/submit").set(auth(t.token)).send({ document_type: "AADHAAR", document_number: "1234 5678 9012" })).status, 409);

    const queue = (await api().get("/api/verification/pending").set(auth(co.token))).body;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].document_last4, "9012");
    assert.equal(JSON.stringify(queue).includes("123456789012"), false); // the number is never exposed
    // another company can't see or decide it
    const other = await h.newCompany("verOther");
    assert.equal((await api().get("/api/verification/pending").set(auth(other.token))).body.length, 0);
    assert.equal((await api().put(`/api/verification/${t.tourist.id}/decision`).set(auth(other.token)).send({ decision: "APPROVE" })).status, 404);
    // tourists can't decide
    assert.equal((await api().put(`/api/verification/${t.tourist.id}/decision`).set(auth(t.token)).send({ decision: "APPROVE" })).status, 403);

    const ok = await api().put(`/api/verification/${t.tourist.id}/decision`).set(auth(co.token)).send({ decision: "APPROVE" });
    assert.equal(ok.body.status, "VERIFIED");
    assert.match(ok.body.digital_id, /^STID-\d{4}-\d{4}$/);
    const me = (await api().get("/api/verification/me").set(auth(t.token))).body;
    assert.equal(me.status, "VERIFIED");
    assert.equal(me.digital_id, ok.body.digital_id);
    assert.ok(me.proof.block_hash);
    // the stored block holds hashes only
    const block = await M.ProofBlock.findOne({ tourist_id: t.tourist.id }).lean();
    assert.equal(JSON.stringify(block).includes("123456789012"), false);
    assert.equal(JSON.stringify(block).includes("Tourist verT"), false);
    // company-facing tourist data does not leak the document hash
    const seen = (await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body;
    assert.equal(seen.verification.document_hash, undefined);
    assert.equal(seen.verification.status, "VERIFIED");
  });

  test("rejection needs a reason; foreign tourists need passport + valid visa", async () => {
    const co = await h.newCompany("forC");
    const trip = (await api().post("/api/trips").set(auth(co.token)).send({ name: "T" })).body;
    const f = (await api().post(`/api/trips/${trip.id}/tourists`).set(auth(co.token)).send({ name: "Hans", email: "hans@f.test", tourist_type: "FOREIGN", nationality: "Germany" })).body;
    const act = await api().post("/api/auth/activate-tourist").send({ tourist_code: f.tourist_code, email: "hans@f.test", password: "password123" });
    const tok = act.body.access_token;
    assert.equal((await api().post("/api/verification/submit").set(auth(tok)).send({ document_type: "AADHAAR", document_number: "123456789012" })).status, 400);
    assert.equal((await api().post("/api/verification/submit").set(auth(tok)).send({ document_type: "PASSPORT", document_number: "P1234567" })).status, 400); // no visa
    assert.equal((await api().post("/api/verification/submit").set(auth(tok)).send({ document_type: "PASSPORT", document_number: "P1234567", visa_expiry: "2020-01-01" })).status, 400);
    assert.equal((await api().post("/api/verification/submit").set(auth(tok)).send({ document_type: "PASSPORT", document_number: "P1234567", visa_expiry: "2030-01-01" })).status, 201);
    assert.equal((await api().put(`/api/verification/${f.id}/decision`).set(auth(co.token)).send({ decision: "REJECT" })).status, 400);
    assert.equal((await api().put(`/api/verification/${f.id}/decision`).set(auth(co.token)).send({ decision: "REJECT", reason: "Blurry scan" })).body.status, "REJECTED");
    assert.equal((await api().get("/api/verification/me").set(auth(tok))).body.rejection_reason, "Blurry scan");
    // can resubmit after rejection
    assert.equal((await api().post("/api/verification/submit").set(auth(tok)).send({ document_type: "PASSPORT", document_number: "P1234567", visa_expiry: "2030-01-01" })).status, 201);
  });

  test("ledger chain is valid, lookups work, and tampering is detected", async () => {
    const authy = await h.newAuthority("ledA");
    const co = await h.newCompany("ledC");
    const ids = [];
    for (const tag of ["led1", "led2", "led3"]) {
      const t = await h.newTouristOnTrip(co, tag);
      await api().post("/api/verification/submit").set(auth(t.token)).send({ document_type: "AADHAAR", document_number: `99990000${tag.length}${tag}` });
      ids.push((await api().put(`/api/verification/${t.tourist.id}/decision`).set(auth(co.token)).send({ decision: "APPROVE" })).body.digital_id);
    }
    assert.equal(new Set(ids).size, 3);
    const ledger = (await api().get("/api/verification/ledger").set(auth(authy.token))).body;
    assert.equal(ledger.valid, true);
    assert.ok(ledger.length >= 3);
    assert.equal((await api().get("/api/verification/ledger").set(auth(co.token))).status, 403);
    const lookup = await api().get(`/api/verification/proof/${ids[1]}`).set(auth(authy.token));
    assert.equal(lookup.body.status, "VERIFIED");
    assert.equal(lookup.body.chain.valid, true);
    assert.equal((await api().get(`/api/verification/proof/${ids[1]}`).set(auth((await h.newCompany("ledOther")).token))).status, 404);

    // an attacker edits a past record in the database
    const victim = await M.ProofBlock.findOne({ digital_id: ids[1] });
    await M.ProofBlock.updateOne({ _id: victim._id }, { record_hash: "f".repeat(64) });
    const broken = await verifyChain();
    assert.equal(broken.valid, false);
    assert.equal(broken.broken_at, victim.index);
    await M.ProofBlock.updateOne({ _id: victim._id }, { record_hash: victim.record_hash });
    assert.equal((await verifyChain()).valid, true);
  });
});

describe("safer route recommendation", () => {
  test("recommends the longer route that avoids a danger zone, with an explanation", async () => {
    const authy = await h.newAuthority("rtA");
    await api().post("/api/zones").set(auth(authy.token)).send(circle("Landslide Area", "DANGER", 30.0, 30.05, 700));
    invalidateZones();
    const direct = { name: "Route A", distance_km: 4.2, points: [{ latitude: 30.0, longitude: 30.0 }, { latitude: 30.0, longitude: 30.1 }] }; // passes through the zone
    const detour = { name: "Route B", distance_km: 4.8, points: [{ latitude: 30.0, longitude: 30.0 }, { latitude: 30.05, longitude: 30.05 }, { latitude: 30.0, longitude: 30.1 }] };
    const r = (await api().post("/api/routes/assess").set(auth(authy.token)).send({ routes: [direct, detour] })).body;
    assert.equal(r.recommended, "Route B");
    const a = r.routes.find((x) => x.name === "Route A");
    assert.equal(a.passes_through[0].zone, "Landslide Area");
    assert.notEqual(a.risk_level, "LOW");
    assert.equal(r.routes.find((x) => x.name === "Route B").risk_level, "LOW");
    assert.match(r.explanation, /Route B.*lower safety risk.*0\.6 km longer/);
    assert.equal((await api().post("/api/routes/assess").send({ routes: [direct] })).status, 401);
    assert.equal((await api().post("/api/routes/assess").set(auth(authy.token)).send({ routes: [] })).status, 400);
  });
});
