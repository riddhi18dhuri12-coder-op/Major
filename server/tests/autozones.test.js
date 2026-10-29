const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const { api, auth } = h;
const M = require("../src/models");
const auto = require("../src/services/autoZones");
const { invalidateZones } = require("../src/services/zones");

before(h.setup);
after(h.teardown);

const ring = (lat, lon, d) => [[lat - d, lon - d], [lat - d, lon + d], [lat + d, lon + d], [lat + d, lon - d], [lat - d, lon - d]].map(([la, lo]) => ({ lat: la, lon: lo }));
const fixture = { elements: [
  { type: "way", id: 77, tags: { landuse: "military", name: "Test Naval Base" }, geometry: ring(12.0, 12.0, 0.002) },
  { type: "node", id: 78, lat: 12.02, lon: 12.02, tags: { amenity: "police", name: "Test Police Station" } },
] };

describe("automatic zones in the live geofence", () => {
  before(() => { auto._test.reset(); auto._test.setFetcher(async () => fixture); auto._test.setEnabled(true); });
  after(() => { auto._test.setEnabled(false); auto._test.reset(); });

  test("a tourist outside any authority zone is still covered; authority zones take precedence", async () => {
    const authy = await h.newAuthority("autoA");
    const co = await h.newCompany("autoC");
    const t = await h.newTouristOnTrip(co, "autoT");
    await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true });

    // automatic zones load in the background, so the very first fix never waits for them
    const first = await api().post("/api/location").set(auth(t.token)).send({ latitude: 12.0, longitude: 12.0 });
    assert.equal(first.status, 201);

    // the map endpoint waits for the load and returns the zones with their basis
    const list = await api().get("/api/zones/auto?lat=12.0&lon=12.0").set(auth(t.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.enabled, true);
    const base = list.body.zones.find((z) => z.name === "Test Naval Base");
    assert.equal(base.type, "RESTRICTED");
    assert.equal(base.source, "AUTO");
    assert.match(base.basis, /OpenStreetMap/);
    assert.ok(list.body.zones.some((z) => z.type === "SAFE" && z.name === "Test Police Station"));

    // the next fix is inside the restricted outline: warned and alerted like any restricted zone
    const second = await api().post("/api/location").set(auth(t.token)).send({ latitude: 12.0005, longitude: 12.0005 });
    assert.equal(second.body.zone.type, "RESTRICTED");
    assert.equal(second.body.zone.name, "Test Naval Base");
    assert.equal(second.body.warnings.length, 1);
    assert.ok((await api().get("/api/notifications").set(auth(co.token))).body.some((n) => n.type === "ZONE_ALERT" && /Test Naval Base/.test(n.message)));

    // an authority zone covering the same spot wins over the automatic one
    await api().post("/api/zones").set(auth(authy.token)).send({ name: "Official Safe Area", type: "SAFE", shape: { kind: "CIRCLE", center: { latitude: 12.0, longitude: 12.0 }, radius_m: 600 } });
    invalidateZones();
    const third = await api().post("/api/location").set(auth(t.token)).send({ latitude: 12.0006, longitude: 12.0006 });
    assert.equal(third.body.zone.name, "Official Safe Area");
  });

  test("repeated incidents nearby become a DANGER hotspot", async () => {
    const co = await h.newCompany("hotC");
    const t = await h.newTouristOnTrip(co, "hotT");
    for (let i = 0; i < 3; i++) await M.Incident.create({ incident_code: `INC-HOT${i}`, company_id: co.user.id, tourist_id: t.tourist.id, type: "THEFT", severity: "MEDIUM", status: "NEW", latitude: 30 + i * 0.0004, longitude: 40 });
    const r = await api().get("/api/zones/auto?lat=30.0&lon=40.0").set(auth(t.token));
    const hot = r.body.zones.find((z) => z.basis?.startsWith("Incident history"));
    assert.ok(hot, "hotspot present");
    assert.equal(hot.type, "DANGER");
  });

  test("when switched off the endpoint reports it and returns nothing", async () => {
    auto._test.setEnabled(false);
    const co = await h.newCompany("offC");
    const r = await api().get("/api/zones/auto?lat=12&lon=12").set(auth(co.token));
    assert.deepEqual(r.body, { enabled: false, zones: [] });
    auto._test.setEnabled(true);
  });
});
