// Demo data for local development. Refuses to run in production.
const bcrypt = require("bcryptjs");
const env = require("./config/env");
const { connectDb, disconnectDb } = require("./config/db");
const M = require("./models");

// demo trip runs from yesterday to a week from now, so the seeded Digital ID is valid whenever you run the seed
const dayOffset = (n) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);

async function seed() {
  if (env.isProd) throw new Error("Refusing to seed demo data in production");
  await connectDb();
  const reset = process.argv.includes("--reset");
  if (!reset && (await M.Company.exists({ email: "company@test.com" }))) {
    console.log("Demo data already present. Run with --reset to wipe and recreate.");
    return disconnectDb();
  }
  if (reset) await Promise.all(Object.values(M).filter((m) => m.deleteMany).map((m) => m.deleteMany({})));

  const hash = await bcrypt.hash("test1234", 12);
  const company = await M.Company.create({ name: "Sahyadri Tours", email: "company@test.com", phone: "9000000001", address: "Mumbai", password_hash: hash });
  const guide = await M.Guide.create({ company_id: company._id, name: "Rahul Sharma", email: "guide@test.com", phone: "9000000002", password_hash: hash });
  const trip = await M.Trip.create({
    company_id: company._id, name: "Maharashtra Explorer", description: "7-day Maharashtra tour (seed data)",
    start_date: dayOffset(-1), end_date: dayOffset(7), start_location: "Mumbai", end_location: "Pune", guide_id: guide._id, status: "ACTIVE",
  });

  const tourists = [];
  for (const [name, email] of [["Riddhi Shah", "tourist@test.com"], ["Aarav Mehta", "aarav@test.com"], ["Sara Khan", "sara@test.com"]]) {
    const code = `TST-${new Date().getFullYear()}-${String(await M.nextSeq("tourist")).padStart(5, "0")}`;
    const activated = email === "tourist@test.com";
    const t = await M.Tourist.create({ company_id: company._id, tourist_code: code, name, email, activated, password_hash: activated ? hash : undefined });
    await M.TripMember.create({ trip_id: trip._id, tourist_id: t._id });
    tourists.push(t);
  }
  // ---- Authority, response units, zones, verification ----
  await M.Authority.create({ name: "State Tourism Police", email: "authority@test.com", department: "Tourist Police", region: "Maharashtra", password_hash: hash });
  const units = [
    ["Rescue Team Alpha", "RESCUE", "responder@test.com", 18.7557, 73.4091],
    ["Police Patrol 12", "POLICE", "police@test.com", 18.9220, 72.8347],
    ["Medical Unit 3", "MEDICAL", "medical@test.com", 18.5204, 73.8567],
  ];
  for (const [name, type, email, latitude, longitude] of units) {
    await M.ResponseUnit.create({ name, type, email, password_hash: hash, location: { latitude, longitude, updated_at: new Date() } });
  }
  const c = (name, type, risk_level, latitude, longitude, radius_m, description) =>
    M.Zone.create({ name, type, risk_level, description, shape: { kind: "CIRCLE", center: { latitude, longitude }, radius_m } });
  await c("Gateway Safe Area", "SAFE", "LOW", 18.922, 72.8347, 1500, "Well-patrolled tourist area");
  await c("Lonavala Trek Base (rest point)", "REST_POINT", "LOW", 18.7557, 73.4091, 300, "Water, food and shelter available");
  await c("Rajmachi Trail", "CAUTION", "MEDIUM", 18.8, 73.38, 2500, "Uneven terrain, limited mobile signal");
  await c("Tiger Point Cliff Edge", "DANGER", "HIGH", 18.7345, 73.4018, 600, "Steep drop. Stay behind the railing.");
  await M.Zone.create({ name: "Forest Reserve Core", type: "RESTRICTED", risk_level: "HIGH", description: "Entry prohibited without a permit",
    shape: { kind: "POLYGON", polygon: [{ latitude: 18.70, longitude: 73.30 }, { latitude: 18.70, longitude: 73.34 }, { latitude: 18.67, longitude: 73.34 }, { latitude: 18.67, longitude: 73.30 }] } });

  const { appendProof, hashDocument } = require("./services/ledger");
  const riddhi = tourists[0];
  riddhi.digital_id = `STID-${new Date().getFullYear()}-${String(await M.nextSeq("stid")).padStart(4, "0")}`;
  const document_hash = hashDocument("AADHAAR", "123412341234");
  const block = await appendProof({ tourist_id: riddhi._id, digital_id: riddhi.digital_id, document_hash, verified_at: new Date() });
  riddhi.verification = { status: "VERIFIED", document_type: "AADHAAR", document_last4: "1234", document_hash, submitted_at: new Date(), reviewed_at: new Date(), proof_hash: block.block_hash };
  await riddhi.save();
  await require("./services/idValidity").syncIdValidity(riddhi._id); // visit-only validity window from the trip dates
  const aarav = tourists[1];
  aarav.verification = { status: "PENDING", document_type: "AADHAAR", document_last4: "9876", document_hash: hashDocument("AADHAAR", "555566669876"), submitted_at: new Date() };
  await aarav.save();

  console.log("Also: authority@test.com (authority), responder@test.com / police@test.com / medical@test.com (response units)");
  console.log("Seeded. Logins (password test1234): company@test.com (company), guide@test.com (guide), tourist@test.com (tourist)");
  console.log("Not yet activated (use /auth/activate-tourist):", tourists.slice(1).map((t) => `${t.tourist_code} ${t.email}`).join(", "));
  await disconnectDb();
}

seed().catch((e) => { console.error(e.message); process.exit(1); });
