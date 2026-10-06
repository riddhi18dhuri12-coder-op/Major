const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const { api, auth } = h;
const M = require("../src/models");
const { distanceToRoute, effectiveDistance, classify, advance } = require("../src/services/routeDeviation");
const { assessRisk } = require("../src/services/risk");

before(h.setup);
after(h.teardown);

// A straight ~10.5 km road running due east at latitude 18.50.  0.001 deg of latitude is ~111 m.
const ROAD = [{ latitude: 18.5, longitude: 73.8 }, { latitude: 18.5, longitude: 73.85 }, { latitude: 18.5, longitude: 73.9 }];
const at = (north_deg, lon = 73.85) => ({ latitude: 18.5 + north_deg, longitude: lon });
const NEAR = at(0.0001); // ~11 m off the road
const M300 = at(0.0027); // ~300 m off  -> WARNING
const M700 = at(0.0063); // ~700 m off  -> DEVIATION

describe("route deviation (pure logic)", () => {
  test("distance to a polyline: beside the road, and beyond its end", () => {
    assert.ok(Math.abs(distanceToRoute(M300, ROAD).distance_m - 300) < 5);
    assert.ok(distanceToRoute(NEAR, ROAD).distance_m < 15);
    const past = distanceToRoute({ latitude: 18.5, longitude: 73.91 }, ROAD); // 0.01 deg of longitude past the end ~ 1054 m
    assert.ok(past.distance_m > 1000 && past.distance_m < 1100, `got ${past.distance_m}`);
    assert.equal(distanceToRoute(M300, [ROAD[0]]).distance_m, Infinity); // fewer than 2 points = no route
  });

  test("GPS accuracy is credited back (capped) and thresholds classify", () => {
    assert.equal(effectiveDistance(300, 50), 250);
    assert.equal(effectiveDistance(300, 5000), 200); // credit capped at 100 m
    assert.equal(effectiveDistance(30, 100), 0);
    assert.equal(classify(100), "ON_ROUTE");
    assert.equal(classify(200), "WARNING");
    assert.equal(classify(499), "WARNING");
    assert.equal(classify(500), "DEVIATION");
    assert.equal(classify(350, { warn_m: 100, alert_m: 300 }), "DEVIATION");
  });

  test("one stray reading is not a deviation; two in a row are; a good reading resets", () => {
    let s = advance(null, "DEVIATION");
    assert.equal(s.level, "WARNING");
    s = advance(s, "DEVIATION");
    assert.equal(s.level, "DEVIATION");
    s = advance(s, "DEVIATION");
    assert.equal(s.level, "DEVIATION");
    s = advance(s, "ON_ROUTE");
    assert.deepEqual(s, { level: "ON_ROUTE", streak: 0 });
    assert.equal(advance(advance(null, "DEVIATION"), "WARNING").level, "WARNING"); // streak broken
  });

  test("risk engine explains a route deviation", () => {
    const base = { zone: null, atRestPoint: false, stationaryMin: 0, minutesSinceUpdate: 0, localHour: 12, activeSos: false, overdueTravel: false, missedCheckIn: false, nearbyIncidents: 0 };
    const r = assessRisk({ ...base, routeLevel: "DEVIATION", routeDistanceM: 640 });
    assert.equal(r.score, 20);
    assert.match(r.factors.join(" "), /planned route by 640 m/);
    assert.equal(assessRisk({ ...base, routeLevel: "WARNING", routeDistanceM: 250 }).score, 8);
    assert.equal(assessRisk({ ...base, routeLevel: "ON_ROUTE", routeDistanceM: 5 }).score, 0);
  });
});

const setRoute = (co, trip, extra = {}) => api().put(`/api/trips/${trip.id}/route`).set(auth(co.token)).send({ points: ROAD, distance_km: 10.5, source: "MANUAL", ...extra });
const ping = (t, p, extra = {}) => api().post("/api/location").set(auth(t.token)).send({ latitude: p.latitude, longitude: p.longitude, trip_id: t.trip.id, ...extra });

describe("planned route API", () => {
  test("only the owning agency can set or clear it; input is validated", async () => {
    const co = await h.newCompany("rtA");
    const other = await h.newCompany("rtB");
    const t = await h.newTouristOnTrip(co, "rtT1");
    assert.equal((await api().put(`/api/trips/${t.trip.id}/route`).set(auth(t.token)).send({ points: ROAD })).status, 403);
    assert.equal((await setRoute(other, t.trip)).status, 404);
    assert.equal((await api().put(`/api/trips/${t.trip.id}/route`).set(auth(co.token)).send({ points: [ROAD[0]] })).status, 400);
    assert.equal((await setRoute(co, t.trip, { warn_m: 600, alert_m: 300 })).status, 400);

    const ok = await setRoute(co, t.trip);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.planned_route.point_count, 3);
    assert.deepEqual(ok.body.deviation, { warn_m: 200, alert_m: 500 });

    // the trip list stays light (no points), the detail view carries the route, and tourists on the trip can see it
    const list = (await api().get("/api/trips").set(auth(co.token))).body.find((x) => x.id === t.trip.id);
    assert.equal(list.planned_route.point_count, 3);
    assert.equal(list.planned_route.points, undefined);
    assert.equal((await api().get(`/api/trips/${t.trip.id}`).set(auth(t.token))).body.planned_route.points.length, 3);

    assert.equal((await api().delete(`/api/trips/${t.trip.id}/route`).set(auth(co.token))).status, 200);
    assert.equal((await M.Trip.findById(t.trip.id)).planned_route.point_count, 0);
    assert.ok(await M.AuditLog.findOne({ action: "TRIP_ROUTE_SET", target_id: t.trip.id }));
  });
});

describe("route deviation monitoring", () => {
  test("warning -> confirmed deviation (one incident, alerts, risk factor) -> back on route", async () => {
    const co = await h.newCompany("rdA");
    const t = await h.newTouristOnTrip(co, "rdT");
    await setRoute(co, t.trip);
    await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true });

    const on = await ping(t, NEAR);
    assert.equal(on.status, 201);
    assert.equal(on.body.route.level, "ON_ROUTE");
    assert.equal(on.body.warnings.length, 0);

    const warn = await ping(t, M300);
    assert.equal(warn.body.route.level, "WARNING");
    assert.match(warn.body.warnings.join(" "), /off your planned route/);
    assert.equal(await M.Incident.countDocuments({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION" }), 0); // a warning is not an incident

    const first = await ping(t, M700); // first far reading: could be GPS noise
    assert.equal(first.body.route.level, "WARNING");
    assert.equal(await M.Incident.countDocuments({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION" }), 0);

    const second = await ping(t, M700); // confirmed
    assert.equal(second.body.route.level, "DEVIATION");
    assert.match(second.body.warnings.join(" "), /agency has been alerted/);
    assert.match(second.body.risk.factors.join(" "), /planned route/);
    const incidents = await M.Incident.find({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION" });
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].source, "SYSTEM");
    assert.equal(incidents[0].status, "NEW");
    assert.equal(String(incidents[0].trip_id), t.trip.id);
    assert.match(incidents[0].incident_code, /^INC-\d+$/);
    assert.ok(await M.Notification.findOne({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION", audience: "COMPANY" }));
    assert.ok(await M.Notification.findOne({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION", audience: "AUTHORITY" }));

    await ping(t, M700); // still away: no duplicate incident, no repeat warning
    assert.equal(await M.Incident.countDocuments({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION" }), 1);

    const back = await ping(t, NEAR);
    assert.equal(back.body.route.level, "ON_ROUTE");
    const after = await M.Incident.findOne({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION" });
    assert.match(after.updates.map((u) => u.note).join(" | "), /back on the planned route/);
    assert.equal(after.status, "NEW"); // a human closes it

    // the agency sees it in its incident list
    const seen = (await api().get("/api/incidents").set(auth(co.token))).body;
    assert.ok(seen.some((i) => i.type === "ROUTE_DEVIATION" && i.tourist_code === t.tourist.tourist_code));
  });

  test("GPS accuracy prevents a false deviation; custom thresholds are respected", async () => {
    const co = await h.newCompany("rdB");
    const t = await h.newTouristOnTrip(co, "rdT2");
    await setRoute(co, t.trip, { warn_m: 100, alert_m: 300 });
    await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true });

    // 320 m away is a deviation for these tight thresholds ...
    assert.equal((await ping(t, at(0.00288))).body.route.level, "WARNING"); // first reading, unconfirmed
    // ... but a poor GPS fix (+/-100 m) puts the tourist inside the alert distance
    await M.Tourist.updateOne({ _id: t.tourist.id }, { $unset: { route_state: 1 } });
    const fuzzy = await ping(t, at(0.00288), { accuracy: 100 });
    assert.equal(fuzzy.body.route.level, "WARNING");
    assert.equal(fuzzy.body.route.distance_m, 220);
    assert.equal(await M.Incident.countDocuments({ tourist_id: t.tourist.id, type: "ROUTE_DEVIATION" }), 0);
  });

  test("no route, or a trip that is not ACTIVE, means no monitoring", async () => {
    const co = await h.newCompany("rdC");
    const noRoute = await h.newTouristOnTrip(co, "rdT3");
    await api().post("/api/location/toggle").set(auth(noRoute.token)).send({ enabled: true });
    assert.equal((await ping(noRoute, M700)).body.route, null);

    const upcoming = await h.newTouristOnTrip(co, "rdT4", { status: "UPCOMING" });
    await setRoute(co, upcoming.trip);
    await api().post("/api/location/toggle").set(auth(upcoming.token)).send({ enabled: true });
    const r = await ping(upcoming, M700);
    assert.equal(r.status, 201);
    assert.equal(r.body.route, null);
    assert.equal(await M.Incident.countDocuments({ type: "ROUTE_DEVIATION", tourist_id: upcoming.tourist.id }), 0);
  });

  test("replacing the route resets the tourist's previous comparison", async () => {
    const co = await h.newCompany("rdD");
    const t = await h.newTouristOnTrip(co, "rdT5");
    await setRoute(co, t.trip);
    await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true });
    await ping(t, M700); await ping(t, M700);
    assert.equal((await M.Tourist.findById(t.tourist.id)).route_state.level, "DEVIATION");
    await setRoute(co, t.trip);
    assert.equal((await M.Tourist.findById(t.tourist.id)).route_state?.level, undefined);
  });
});
