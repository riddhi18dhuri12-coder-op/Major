// Must run before anything requires config/env
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET ||= "test-access-secret-test-access-secret-0001";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-refresh-secret-02";
const base = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";
process.env.MONGODB_URI = `${base.replace(/\/$/, "")}/sts_test_${Date.now()}`;
process.env.SCHEDULER_ENABLED = "false";
process.env.CHECKIN_INTERVAL_HOURS = "12";
process.env.STALE_LOCATION_MINUTES = "30";

const request = require("supertest");
const mongoose = require("mongoose");
const { connectDb } = require("../src/config/db");
const { createApp } = require("../src/app");

const app = createApp();
const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function setup() {
  await connectDb();
}
async function teardown() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

/** Registers a company and returns { token, refresh, user }. */
async function newCompany(tag) {
  const r = await api().post("/api/auth/register-company").send({ name: `Co ${tag}`, email: `${tag}@co.test`, password: "password123" });
  return { token: r.body.access_token, refresh: r.body.refresh_token, user: r.body.user };
}

/** Company creates a trip + tourist, tourist activates and logs in. */
async function newTouristOnTrip(company, tag, { status = "ACTIVE" } = {}) {
  const trip = (await api().post("/api/trips").set(auth(company.token)).send({ name: `Trip ${tag}` })).body;
  await api().put(`/api/trips/${trip.id}`).set(auth(company.token)).send({ status });
  const tourist = (await api().post(`/api/trips/${trip.id}/tourists`).set(auth(company.token)).send({ name: `Tourist ${tag}`, email: `${tag}@tourist.test` })).body;
  const act = await api().post("/api/auth/activate-tourist").send({ tourist_code: tourist.tourist_code, email: tourist.email, password: "password123" });
  return { trip, tourist, token: act.body.access_token, refresh: act.body.refresh_token };
}

module.exports = { api, auth, setup, teardown, newCompany, newTouristOnTrip };

const bcrypt = require("bcryptjs");
const M = require("../src/models");

/** Authorities are created by an admin/seed, never self-registered. Returns { token, user }. */
async function newAuthority(tag) {
  await M.Authority.create({ name: `Auth ${tag}`, email: `${tag}@auth.test`, password_hash: await bcrypt.hash("password123", 4) });
  const r = await api().post("/api/auth/login").send({ email: `${tag}@auth.test`, password: "password123", role: "authority" });
  return { token: r.body.access_token, user: r.body.user };
}

/** Authority creates a response unit; the unit logs in. Returns { id, token, ... }. */
async function newUnit(authority, tag, { type = "RESCUE", latitude, longitude } = {}) {
  const c = await api().post("/api/authority/units").set(auth(authority.token)).send({ name: `Unit ${tag}`, type, email: `${tag}@unit.test`, password: "password123", latitude, longitude });
  const l = await api().post("/api/auth/login").send({ email: `${tag}@unit.test`, password: "password123", role: "responder" });
  return { id: c.body.id, token: l.body.access_token };
}

module.exports.newAuthority = newAuthority;
module.exports.newUnit = newUnit;
