const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const { api, auth } = h;

before(h.setup);
after(h.teardown);

test("authority and responder tokens never leak company-scoped data", async () => {
  const co = await h.newCompany("leakC");
  const t = await h.newTouristOnTrip(co, "leakT");
  await api().post("/api/incidents/sos").set(auth(t.token)).send({});
  const authy = await h.newAuthority("leakA");
  const unit = await h.newUnit(authy, "leakU");

  for (const [who, token] of [["authority", authy.token], ["responder", unit.token]]) {
    const r = await api().get("/api/trips").set(auth(token));
    assert.ok(r.status === 403 || (r.status === 200 && r.body.length === 0), `${who} GET /trips -> ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
    for (const path of ["/api/tourists", "/api/guides", "/api/location/live", `/api/trips/${t.trip.id}`, `/api/tourists/${t.tourist.id}`, `/api/location/tourist/${t.tourist.id}`, `/api/safety/checks/${t.tourist.id}`, "/api/me/profile"]) {
      const x = await api().get(path).set(auth(token));
      assert.ok(x.status === 403 || x.status === 404, `${who} GET ${path} -> ${x.status}`);
    }
  }
  // a responder cannot read the incident list unless assigned
  assert.equal((await api().get("/api/incidents").set(auth(unit.token))).body.length, 0);
  // responders can't change incident status through the general endpoint or see notifications
  const inc = (await api().get("/api/incidents").set(auth(authy.token))).body[0];
  assert.equal((await api().put(`/api/incidents/${inc.id}/status`).set(auth(unit.token)).send({ status: "RESOLVED" })).status, 403);
  assert.equal((await api().get("/api/notifications").set(auth(unit.token))).status, 403);
  assert.equal((await api().get("/api/authority/overview").set(auth(unit.token))).status, 403);
});
