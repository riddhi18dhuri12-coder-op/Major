const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { io: connect } = require("socket.io-client");
const h = require("./helpers");
const { initRealtime, closeRealtime } = require("../src/services/realtime");
const { createApp } = require("../src/app");
const { notify } = require("../src/services/notify");

let server, url;
before(async () => {
  await h.setup();
  server = http.createServer(createApp());
  initRealtime(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await closeRealtime();
  await h.teardown();
});

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const connected = (token) =>
  new Promise((resolve, reject) => {
    const s = connect(url, { auth: { token }, transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });

test("sockets reject missing or bad tokens", async () => {
  await assert.rejects(connected("garbage"));
  await assert.rejects(connected(undefined));
});

test("SOS reaches the right company live, and not other companies", async () => {
  const a = await h.newCompany("rtA");
  const b = await h.newCompany("rtB");
  const t = await h.newTouristOnTrip(a, "rt");
  const sockA = await connected(a.token);
  const sockB = await connected(b.token);
  let leaked = false;
  sockB.on("sos:alert", () => (leaked = true));

  const got = once(sockA, "sos:alert");
  const res = await h.api().post("/api/incidents/sos").set(h.auth(t.token)).send({ latitude: 19, longitude: 72 });
  const alert = await got;
  assert.equal(alert.id, res.body.id);
  assert.equal(alert.tourist_name, "Tourist rt");

  await new Promise((r) => setTimeout(r, 200));
  assert.equal(leaked, false);
  sockA.close();
  sockB.close();
});

test("live location + tourist-targeted events", async () => {
  const co = await h.newCompany("rtL");
  const t = await h.newTouristOnTrip(co, "rtL");
  const dash = await connected(co.token);
  const phone = await connected(t.token);
  await h.api().post("/api/location/toggle").set(h.auth(t.token)).send({ enabled: true });

  const loc = once(dash, "location:update");
  await h.api().post("/api/location").set(h.auth(t.token)).send({ latitude: 18.5, longitude: 73.8 });
  assert.equal((await loc).latitude, 18.5);

  const note = once(dash, "notification:new");
  await notify({ company_id: co.user.id, type: "STALE_LOCATION", message: "test" });
  assert.equal((await note).message, "test");

  const { emitToTourist } = require("../src/services/realtime");
  const rem = once(phone, "checkin:reminder");
  emitToTourist(t.tourist.id, "checkin:reminder", { interval_hours: 12 });
  assert.equal((await rem).interval_hours, 12);
  dash.close();
  phone.close();
});
