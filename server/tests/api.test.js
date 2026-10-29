const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const { api, auth } = h;
const M = require("../src/models");
const scheduler = require("../src/services/scheduler");

before(h.setup);
after(h.teardown);

describe("health & errors", () => {
  test("health and readiness", async () => {
    assert.equal((await api().get("/api/health")).status, 200);
    assert.equal((await api().get("/api/ready")).body.ready, true);
  });
  test("unknown route -> 404 JSON, malformed JSON -> 400", async () => {
    assert.equal((await api().get("/api/nope")).status, 404);
    const r = await api().post("/api/auth/login").set("Content-Type", "application/json").send("{bad");
    assert.equal(r.status, 400);
  });
  test("security headers present, no x-powered-by", async () => {
    const r = await api().get("/api/health");
    assert.ok(r.headers["x-content-type-options"]);
    assert.equal(r.headers["x-powered-by"], undefined);
  });
});

describe("auth", () => {
  test("register, duplicate, weak password, bad email", async () => {
    const ok = await api().post("/api/auth/register-company").send({ name: "A", email: "Dup@Co.test", password: "password123" });
    assert.equal(ok.status, 201);
    assert.ok(ok.body.access_token && ok.body.refresh_token);
    assert.equal(ok.body.user.password_hash, undefined);
    assert.equal((await api().post("/api/auth/register-company").send({ name: "A", email: "dup@co.test", password: "password123" })).status, 409);
    assert.equal((await api().post("/api/auth/register-company").send({ name: "A", email: "x@co.test", password: "short" })).status, 400);
    assert.equal((await api().post("/api/auth/register-company").send({ name: "A", email: "nope", password: "password123" })).status, 400);
  });

  test("login: success, wrong password, unknown user, wrong role", async () => {
    await h.newCompany("login");
    const ok = await api().post("/api/auth/login").send({ email: "login@co.test", password: "password123", role: "company" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.role, "company");
    assert.equal((await api().post("/api/auth/login").send({ email: "login@co.test", password: "wrongpass1", role: "company" })).status, 401);
    assert.equal((await api().post("/api/auth/login").send({ email: "ghost@co.test", password: "password123", role: "company" })).status, 401);
    assert.equal((await api().post("/api/auth/login").send({ email: "login@co.test", password: "password123", role: "guide" })).status, 401);
  });

  test("protected routes need a valid token", async () => {
    assert.equal((await api().get("/api/trips")).status, 401);
    assert.equal((await api().get("/api/trips").set(auth("garbage"))).status, 401);
  });

  test("refresh rotates tokens and detects reuse", async () => {
    const c = await h.newCompany("refresh");
    const r1 = await api().post("/api/auth/refresh").send({ refresh_token: c.refresh });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.refresh_token, c.refresh);
    // replayed immediately (two tabs racing): refused, but the new session survives
    assert.equal((await api().post("/api/auth/refresh").send({ refresh_token: c.refresh })).status, 401);
    const r2 = await api().post("/api/auth/refresh").send({ refresh_token: r1.body.refresh_token });
    assert.equal(r2.status, 200);
    // replayed long after rotation = theft signal: rejected AND every session is revoked
    await M.RefreshToken.updateMany({ revoked: true }, { revoked_at: new Date(Date.now() - 60_000) });
    assert.equal((await api().post("/api/auth/refresh").send({ refresh_token: c.refresh })).status, 401);
    assert.equal((await api().post("/api/auth/refresh").send({ refresh_token: r2.body.refresh_token })).status, 401);
  });

  test("logout revokes the refresh token", async () => {
    const c = await h.newCompany("logout");
    assert.equal((await api().post("/api/auth/logout").send({ refresh_token: c.refresh })).status, 200);
    assert.equal((await api().post("/api/auth/refresh").send({ refresh_token: c.refresh })).status, 401);
  });

  test("tourist activation needs matching email and works once", async () => {
    const co = await h.newCompany("act");
    const trip = (await api().post("/api/trips").set(auth(co.token)).send({ name: "T" })).body;
    const t = (await api().post(`/api/trips/${trip.id}/tourists`).set(auth(co.token)).send({ name: "Tina", email: "tina@t.test" })).body;
    assert.match(t.tourist_code, /^TST-\d{4}-\d{5}$/);
    // can't log in before activating
    assert.equal((await api().post("/api/auth/login").send({ email: "tina@t.test", password: "password123", role: "tourist" })).status, 401);
    assert.equal((await api().post("/api/auth/activate-tourist").send({ tourist_code: t.tourist_code, email: "other@t.test", password: "password123" })).status, 404);
    assert.equal((await api().post("/api/auth/activate-tourist").send({ tourist_code: t.tourist_code, email: "tina@t.test", password: "password123" })).status, 200);
    // second activation (account takeover attempt) is refused
    assert.equal((await api().post("/api/auth/activate-tourist").send({ tourist_code: t.tourist_code, email: "tina@t.test", password: "hacked12345" })).status, 409);
    assert.equal((await api().post("/api/auth/login").send({ email: "tina@t.test", password: "password123", role: "tourist" })).status, 200);
  });
});

describe("guides, trips, roles", () => {
  test("company manages guides; duplicates and roles enforced", async () => {
    const co = await h.newCompany("guides");
    const g = await api().post("/api/guides").set(auth(co.token)).send({ name: "Gita", email: "gita@g.test", password: "password123" });
    assert.equal(g.status, 201);
    assert.equal(g.body.password_hash, undefined);
    assert.equal((await api().post("/api/guides").set(auth(co.token)).send({ name: "Gita2", email: "gita@g.test", password: "password123" })).status, 409);

    const trip = (await api().post("/api/trips").set(auth(co.token)).send({ name: "Goa", guide_id: g.body.id })).body;
    assert.equal(trip.guide_id, g.body.id);
    const list = (await api().get("/api/trips").set(auth(co.token))).body;
    assert.equal(list[0].guide_name, "Gita");
    const guides = (await api().get("/api/guides").set(auth(co.token))).body;
    assert.equal(guides[0].trip_count, 1);

    // guide logs in: sees own trips, cannot create trips or manage guides
    const gl = await api().post("/api/auth/login").send({ email: "gita@g.test", password: "password123", role: "guide" });
    assert.equal((await api().get("/api/trips").set(auth(gl.body.access_token))).body.length, 1);
    assert.equal((await api().post("/api/trips").set(auth(gl.body.access_token)).send({ name: "X" })).status, 403);
    assert.equal((await api().get("/api/guides").set(auth(gl.body.access_token))).status, 403);

    // removing a guide unassigns their trips
    assert.equal((await api().delete(`/api/guides/${g.body.id}`).set(auth(co.token))).status, 200);
    assert.equal((await api().get(`/api/trips/${trip.id}`).set(auth(co.token))).body.guide_id, null);
    assert.equal((await api().post("/api/auth/login").send({ email: "gita@g.test", password: "password123", role: "guide" })).status, 401);
  });

  test("trip validation: bad guide, bad status, malformed id", async () => {
    const co = await h.newCompany("tripval");
    assert.equal((await api().post("/api/trips").set(auth(co.token)).send({ name: "T", guide_id: "a".repeat(24) })).status, 400);
    const t = (await api().post("/api/trips").set(auth(co.token)).send({ name: "T" })).body;
    assert.equal((await api().put(`/api/trips/${t.id}`).set(auth(co.token)).send({ status: "WHATEVER" })).status, 400);
    assert.equal((await api().get("/api/trips/not-an-id").set(auth(co.token))).status, 404);
    assert.equal((await api().post("/api/trips").set(auth(co.token)).send({})).status, 400);
  });

  test("tourist ids are unique across companies; same email cannot join two companies", async () => {
    const a = await h.newCompany("uniqA");
    const b = await h.newCompany("uniqB");
    const ta = (await api().post("/api/trips").set(auth(a.token)).send({ name: "A" })).body;
    const tb = (await api().post("/api/trips").set(auth(b.token)).send({ name: "B" })).body;
    const x = (await api().post(`/api/trips/${ta.id}/tourists`).set(auth(a.token)).send({ name: "X", email: "x@u.test" })).body;
    const y = (await api().post(`/api/trips/${tb.id}/tourists`).set(auth(b.token)).send({ name: "Y", email: "y@u.test" })).body;
    assert.notEqual(x.tourist_code, y.tourist_code);
    assert.equal((await api().post(`/api/trips/${tb.id}/tourists`).set(auth(b.token)).send({ name: "X", email: "x@u.test" })).status, 409);
    // adding the same tourist twice to a trip is idempotent
    assert.equal((await api().post(`/api/trips/${ta.id}/tourists`).set(auth(a.token)).send({ name: "X", email: "x@u.test" })).status, 201);
    assert.equal((await api().get(`/api/trips/${ta.id}`).set(auth(a.token))).body.tourists.length, 1);
  });
});

describe("tenant isolation", () => {
  test("company B cannot read or change company A's data", async () => {
    const a = await h.newCompany("isoA");
    const b = await h.newCompany("isoB");
    const ta = await h.newTouristOnTrip(a, "isoA");
    await api().post("/api/location/toggle").set(auth(ta.token)).send({ enabled: true });
    await api().post("/api/location").set(auth(ta.token)).send({ latitude: 19.07, longitude: 72.87 });
    const sos = (await api().post("/api/incidents/sos").set(auth(ta.token)).send({ latitude: 19.07, longitude: 72.87 })).body;

    const attempts = [
      api().get(`/api/trips/${ta.trip.id}`).set(auth(b.token)),
      api().get(`/api/tourists/${ta.tourist.id}`).set(auth(b.token)),
      api().get(`/api/location/tourist/${ta.tourist.id}`).set(auth(b.token)),
      api().get(`/api/safety/checks/${ta.tourist.id}`).set(auth(b.token)),
      api().get(`/api/incidents/${sos.id}`).set(auth(b.token)),
      api().put(`/api/incidents/${sos.id}/status`).set(auth(b.token)).send({ status: "RESOLVED" }),
      api().put(`/api/trips/${ta.trip.id}`).set(auth(b.token)).send({ name: "hijack" }),
      api().post(`/api/trips/${ta.trip.id}/tourists`).set(auth(b.token)).send({ name: "Z", email: "z@z.test" }),
    ];
    for (const r of await Promise.all(attempts)) assert.equal(r.status, 404);
    assert.deepEqual((await api().get("/api/tourists").set(auth(b.token))).body, []);
    assert.deepEqual((await api().get("/api/incidents").set(auth(b.token))).body, []);
    assert.deepEqual((await api().get("/api/location/live").set(auth(b.token))).body, []);
    assert.equal((await api().get(`/api/incidents/${sos.id}`).set(auth(a.token))).status, 200);
  });

  test("tourists cannot use company endpoints or see other tourists", async () => {
    const co = await h.newCompany("roles");
    const t1 = await h.newTouristOnTrip(co, "roles1");
    assert.equal((await api().get("/api/tourists").set(auth(t1.token))).status, 403);
    assert.equal((await api().get("/api/location/live").set(auth(t1.token))).status, 403);
    assert.equal((await api().get("/api/notifications").set(auth(t1.token))).status, 403);
    assert.equal((await api().post("/api/trips").set(auth(t1.token)).send({ name: "x" })).status, 403);
    // a company token cannot call tourist-only endpoints
    assert.equal((await api().post("/api/incidents/sos").set(auth(co.token)).send({})).status, 403);
  });
});

describe("location", () => {
  test("must opt in; coordinates validated; live map + history", async () => {
    const co = await h.newCompany("loc");
    const t = await h.newTouristOnTrip(co, "loc");
    assert.equal((await api().post("/api/location").set(auth(t.token)).send({ latitude: 1, longitude: 1 })).status, 403);
    assert.equal((await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true })).status, 200);
    assert.equal((await api().post("/api/location").set(auth(t.token)).send({ latitude: 200, longitude: 1 })).status, 400);
    assert.equal((await api().post("/api/location").set(auth(t.token)).send({ latitude: "x", longitude: 1 })).status, 400);
    assert.equal((await api().post("/api/location").set(auth(t.token)).send({ latitude: 18.52, longitude: 73.85, accuracy: 12, trip_id: t.trip.id })).status, 201);
    const live = (await api().get("/api/location/live").set(auth(co.token))).body;
    assert.equal(live.length, 1);
    assert.equal(live[0].last_location.latitude, 18.52);
    assert.equal(live[0].password_hash, undefined);
    const hist = (await api().get(`/api/location/tourist/${t.tourist.id}`).set(auth(co.token))).body;
    assert.equal(hist.length, 1);
  });
});

describe("tourist closes own emergency", () => {
  test("self-resolve stops the alert, frees status, notifies, and is scoped to the owner", async () => {
    const co = await h.newCompany("selfres");
    const t = await h.newTouristOnTrip(co, "selfres");
    const other = await h.newTouristOnTrip(co, "selfres2");
    const sos = (await api().post("/api/incidents/sos").set(auth(t.token)).send({ latitude: 19, longitude: 72 })).body;
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "EMERGENCY");

    // another tourist, and staff roles, cannot use it
    assert.equal((await api().put(`/api/incidents/${sos.id}/self-resolve`).set(auth(other.token)).send({})).status, 404);
    assert.equal((await api().put(`/api/incidents/${sos.id}/self-resolve`).set(auth(co.token)).send({})).status, 403);

    const r = await api().put(`/api/incidents/${sos.id}/self-resolve`).set(auth(t.token)).send({ outcome: "RESOLVED", note: "got help from a shopkeeper" });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "RESOLVED");
    assert.match(r.body.updates.at(-1).note, /Closed by the tourist/);
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "NORMAL");
    assert.ok((await api().get("/api/notifications").set(auth(co.token))).body.some((n) => n.type === "SOS_CLEARED"));

    // already closed -> 400; false-alarm outcome works on a new SOS
    assert.equal((await api().put(`/api/incidents/${sos.id}/self-resolve`).set(auth(t.token)).send({})).status, 400);
    const sos2 = (await api().post("/api/incidents/sos").set(auth(t.token)).send({})).body;
    assert.equal((await api().put(`/api/incidents/${sos2.id}/self-resolve`).set(auth(t.token)).send({ outcome: "FALSE_ALARM" })).body.status, "FALSE_ALARM");
  });
});

describe("incidents & SOS", () => {
  test("SOS lifecycle", async () => {
    const co = await h.newCompany("sos");
    const t = await h.newTouristOnTrip(co, "sos");
    const sos = await api().post("/api/incidents/sos").set(auth(t.token)).send({ latitude: 19, longitude: 72 });
    assert.equal(sos.status, 201);
    assert.match(sos.body.incident_code, /^INC-\d+$/);
    assert.equal(sos.body.severity, "CRITICAL");
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "EMERGENCY");

    // pressing again does not create a duplicate case
    const again = await api().post("/api/incidents/sos").set(auth(t.token)).send({});
    assert.equal(again.body.id, sos.body.id);
    assert.equal((await api().get("/api/incidents").set(auth(co.token))).body.length, 1);

    // company is notified
    const notes = (await api().get("/api/notifications").set(auth(co.token))).body;
    assert.ok(notes.some((n) => n.type === "SOS"));

    // "I'm safe" must NOT clear an active emergency
    await api().post("/api/safety/check-in").set(auth(t.token)).send({});
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "EMERGENCY");

    // list shows tourist info; detail shows updates
    const list = (await api().get("/api/incidents").set(auth(co.token))).body;
    assert.equal(list[0].tourist_name, "Tourist sos");
    const ack = await api().put(`/api/incidents/${sos.body.id}/status`).set(auth(co.token)).send({ status: "ACKNOWLEDGED" });
    assert.equal(ack.body.status, "ACKNOWLEDGED");
    assert.equal((await api().put(`/api/incidents/${sos.body.id}/status`).set(auth(co.token)).send({ status: "BOGUS" })).status, 400);
    const done = await api().put(`/api/incidents/${sos.body.id}/status`).set(auth(co.token)).send({ status: "RESOLVED", note: "Reached the tourist" });
    assert.equal(done.body.status, "RESOLVED");
    assert.ok(done.body.resolved_at);
    const detail = (await api().get(`/api/incidents/${sos.body.id}`).set(auth(co.token))).body;
    assert.equal(detail.updates.length, 3);
    assert.equal(detail.tourist.name, "Tourist sos");
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "NORMAL");
  });

  test("regular incident report is validated", async () => {
    const co = await h.newCompany("inc");
    const t = await h.newTouristOnTrip(co, "inc");
    assert.equal((await api().post("/api/incidents").set(auth(t.token)).send({})).status, 400);
    assert.equal((await api().post("/api/incidents").set(auth(t.token)).send({ type: "SOS" })).status, 400); // SOS has its own endpoint
    const r = await api().post("/api/incidents").set(auth(t.token)).send({ type: "THEFT", severity: "HIGH", description: "Wallet stolen" });
    assert.equal(r.status, 201);
    // the tourist sees only their own incidents
    assert.equal((await api().get("/api/incidents").set(auth(t.token))).body.length, 1);
  });
});

describe("scheduler", () => {
  test("overdue independent travel -> OVERDUE, Attention, one notification; returning clears it", async () => {
    const co = await h.newCompany("over");
    const t = await h.newTouristOnTrip(co, "over");
    const past = new Date(Date.now() - 3600_000).toISOString();
    assert.equal((await api().post("/api/safety/independent-travel").set(auth(t.token)).send({ destination: "Lonavala", expected_return: past })).status, 400);

    const s = (await api().post("/api/safety/independent-travel").set(auth(t.token)).send({ destination: "Lonavala", expected_return: new Date(Date.now() + 3600_000).toISOString() })).body;
    assert.equal((await api().post("/api/safety/independent-travel").set(auth(t.token)).send({ expected_return: new Date(Date.now() + 7200_000).toISOString() })).status, 409);
    await M.TravelSession.updateOne({ _id: s.id }, { expected_return: new Date(Date.now() - 1000) }); // time passes

    assert.equal(await scheduler.checkOverdueTravel(), 1);
    assert.equal(await scheduler.checkOverdueTravel(), 0); // no duplicate alerts
    assert.equal((await api().get("/api/safety/independent-travel/current").set(auth(t.token))).body.status, "OVERDUE");
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "ATTENTION");
    const notes = (await api().get("/api/notifications").set(auth(co.token))).body.filter((n) => n.type === "OVERDUE_TRAVEL");
    assert.equal(notes.length, 1);
    assert.match(notes[0].message, /Lonavala/);
    assert.equal((await api().get("/api/safety/independent-travel/overdue").set(auth(co.token))).body.length, 1);

    assert.equal((await api().put(`/api/safety/independent-travel/${s.id}/end`).set(auth(t.token))).body.status, "RETURNED");
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "NORMAL");
    assert.equal((await api().get("/api/safety/independent-travel/current").set(auth(t.token))).body, null);
  });

  test("missed check-in: flagged once per interval, cleared by checking in", async () => {
    const co = await h.newCompany("miss");
    const t = await h.newTouristOnTrip(co, "miss");
    await M.Tourist.updateOne({ _id: t.tourist.id }, { last_check_in_at: new Date(Date.now() - 13 * 3600_000) });
    assert.equal(await scheduler.checkMissedCheckIns(), 1);
    assert.equal(await scheduler.checkMissedCheckIns(), 0); // the MISSED row restarted the clock
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "ATTENTION");
    const checks = (await api().get(`/api/safety/checks/${t.tourist.id}`).set(auth(co.token))).body;
    assert.equal(checks[0].status, "MISSED");
    assert.ok((await api().get("/api/notifications").set(auth(co.token))).body.some((n) => n.type === "MISSED_CHECKIN"));
    await api().post("/api/safety/check-in").set(auth(t.token)).send({});
    assert.equal((await api().get(`/api/tourists/${t.tourist.id}`).set(auth(co.token))).body.status, "NORMAL");
  });

  test("the check-in clock starts when the trip becomes ACTIVE", async () => {
    const co = await h.newCompany("clock");
    const t = await h.newTouristOnTrip(co, "clock", { status: "UPCOMING" });
    await M.Tourist.updateOne({ _id: t.tourist.id }, { created_at: new Date(Date.now() - 72 * 3600_000), last_check_in_at: null });
    await api().put(`/api/trips/${t.trip.id}`).set(auth(co.token)).send({ status: "ACTIVE" });
    assert.equal(await scheduler.checkMissedCheckIns(), 0); // added 3 days ago, but the trip only just started
  });

  test("no reminders for trips that are not active", async () => {
    const co = await h.newCompany("idle");
    const t = await h.newTouristOnTrip(co, "idle", { status: "UPCOMING" });
    await M.Tourist.updateOne({ _id: t.tourist.id }, { last_check_in_at: new Date(Date.now() - 48 * 3600_000) });
    assert.equal(await scheduler.checkMissedCheckIns(), 0);
  });

  test("stale location warns once per silence, again after a fresh point goes quiet", async () => {
    const co = await h.newCompany("stale");
    const t = await h.newTouristOnTrip(co, "stale");
    await api().post("/api/location/toggle").set(auth(t.token)).send({ enabled: true });
    await api().post("/api/location").set(auth(t.token)).send({ latitude: 18.5, longitude: 73.8 });
    assert.equal(await scheduler.checkStaleLocations(), 0); // fresh
    await M.Tourist.updateOne({ _id: t.tourist.id }, { "last_location.recorded_at": new Date(Date.now() - 45 * 60_000) });
    assert.equal(await scheduler.checkStaleLocations(), 1);
    assert.equal(await scheduler.checkStaleLocations(), 0);
  });

  test("only one instance holds the scheduler lease", async () => {
    await M.SchedulerLock.deleteMany({});
    assert.ok(await scheduler.runChecks()); // we take the lease
    await M.SchedulerLock.updateOne({ _id: "safety-checks" }, { owner: "another-instance", locked_until: new Date(Date.now() + 60_000) });
    assert.equal(await scheduler.runChecks(), null); // blocked by the other instance
    await M.SchedulerLock.updateOne({ _id: "safety-checks" }, { locked_until: new Date(Date.now() - 1000) });
    assert.ok(await scheduler.runChecks()); // lease expired -> we take over
  });
});

describe("notifications", () => {
  test("list, mark read", async () => {
    const co = await h.newCompany("notif");
    const t = await h.newTouristOnTrip(co, "notif");
    await api().post("/api/incidents/sos").set(auth(t.token)).send({});
    const list = (await api().get("/api/notifications").set(auth(co.token))).body;
    assert.equal(list.filter((n) => !n.read).length, 1);
    await api().put(`/api/notifications/${list[0].id}/read`).set(auth(co.token));
    assert.equal((await api().get("/api/notifications").set(auth(co.token))).body.filter((n) => !n.read).length, 0);
  });

  test("emergency contacts CRUD for a tourist", async () => {
    const co = await h.newCompany("ec");
    const t = await h.newTouristOnTrip(co, "ec");
    const c = await api().post("/api/me/contacts").set(auth(t.token)).send({ name: "Mom", relationship: "Mother", phone: "9999999999" });
    assert.equal(c.status, 201);
    assert.equal((await api().post("/api/me/contacts").set(auth(t.token)).send({ name: "" })).status, 400);
    assert.equal((await api().get("/api/me/contacts").set(auth(t.token))).body.length, 1);
    assert.equal((await api().delete(`/api/me/contacts/${c.body.id}`).set(auth(t.token))).status, 200);
    assert.equal((await api().get("/api/me/profile").set(auth(t.token))).body.password_hash, undefined);
  });
});
