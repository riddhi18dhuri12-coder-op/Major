const mongoose = require("mongoose");
const env = require("../config/env");
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const opts = { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } };
const email = { type: String, required: true, unique: true, lowercase: true, trim: true };

// ---- Accounts ---------------------------------------------------------------
const Company = mongoose.model(
  "Company",
  new Schema({ name: { type: String, required: true, trim: true }, email, phone: String, address: String, password_hash: { type: String, required: true } }, opts)
);

const Guide = mongoose.model(
  "Guide",
  new Schema(
    { company_id: { type: ObjectId, ref: "Company", required: true, index: true }, name: { type: String, required: true, trim: true }, email, phone: String, password_hash: { type: String, required: true } },
    opts
  )
);

const Tourist = mongoose.model(
  "Tourist",
  new Schema(
    {
      company_id: { type: ObjectId, ref: "Company", required: true, index: true },
      tourist_code: { type: String, required: true, unique: true },
      name: { type: String, required: true, trim: true },
      email,
      phone: String,
      password_hash: String, // empty until the tourist activates their invite
      activated: { type: Boolean, default: false },
      status: { type: String, enum: ["NORMAL", "ATTENTION", "EMERGENCY"], default: "NORMAL", index: true },
      location_sharing: { type: Boolean, default: false },
      tourist_type: { type: String, enum: ["DOMESTIC", "FOREIGN"], default: "DOMESTIC" },
      nationality: String,
      digital_id: { type: String, unique: true, sparse: true }, // STID-2026-0001, issued once verified
      // The ID is only valid for the visit: window comes from the tourist's trip dates (capped by visa expiry for foreign tourists)
      id_validity: {
        valid_from: Date,
        valid_until: Date, // null = open-ended (a trip has no end date)
        status: { type: String, enum: ["PENDING", "ACTIVE", "EXPIRED"] },
        synced_at: Date,
      },
      verification: {
        status: { type: String, enum: ["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED"], default: "NOT_SUBMITTED" },
        document_type: String, // AADHAAR | PASSPORT | DRIVING_LICENSE | VOTER_ID
        document_last4: String, // raw numbers are never stored, only a masked tail + salted hash
        document_hash: String,
        visa_expiry: Date,
        submitted_at: Date,
        reviewed_at: Date,
        reviewed_by: ObjectId,
        rejection_reason: String,
        proof_hash: String, // hash recorded on the proof ledger when verified
      },
      risk: {
        score: { type: Number, default: 0 },
        level: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "LOW" },
        factors: [String],
        updated_at: Date,
      },
      current_zone: { id: String, name: String, type: { type: String } }, // "type" must be declared this way or Mongoose reads the whole object as a String
      // latest comparison against the planned route (see services/routeDeviation.js)
      route_state: { trip_id: ObjectId, level: { type: String, enum: ["ON_ROUTE", "WARNING", "DEVIATION"] }, distance_m: Number, streak: Number, updated_at: Date },
      last_check_in_at: Date, // last "I'm Safe" (or last missed-check reminder); starts when the trip goes ACTIVE
      // denormalised latest position so the live map is one query, not N+1
      last_location: { latitude: Number, longitude: Number, accuracy: Number, recorded_at: Date },
    },
    opts
  )
);

// ---- Trips ------------------------------------------------------------------
const Trip = mongoose.model(
  "Trip",
  new Schema(
    {
      company_id: { type: ObjectId, ref: "Company", required: true, index: true },
      name: { type: String, required: true, trim: true },
      description: String,
      start_date: String, // yyyy-mm-dd as entered
      end_date: String,
      start_location: String,
      end_location: String,
      guide_id: { type: ObjectId, ref: "Guide", default: null, index: true },
      status: { type: String, enum: ["UPCOMING", "ACTIVE", "COMPLETED"], default: "UPCOMING", index: true },
      // Planned GPS route (polyline). While the trip is ACTIVE every location update is compared against it.
      planned_route: {
        points: [{ latitude: Number, longitude: Number, _id: false }],
        point_count: { type: Number, default: 0 }, // kept so trip lists can skip the heavy points array
        distance_km: Number,
        source: { type: String, enum: ["OSRM", "STRAIGHT", "MANUAL"] },
        set_at: Date,
      },
      deviation: { warn_m: Number, alert_m: Number }, // per-trip thresholds; defaults 200 m / 500 m
    },
    opts
  )
);

const tripMemberSchema = new Schema(
  { trip_id: { type: ObjectId, ref: "Trip", required: true }, tourist_id: { type: ObjectId, ref: "Tourist", required: true, index: true } },
  opts
);
tripMemberSchema.index({ trip_id: 1, tourist_id: 1 }, { unique: true });
const TripMember = mongoose.model("TripMember", tripMemberSchema);

// ---- Location ---------------------------------------------------------------
const locationSchema = new Schema({
  tourist_id: { type: ObjectId, ref: "Tourist", required: true },
  company_id: { type: ObjectId, ref: "Company", required: true },
  trip_id: { type: ObjectId, ref: "Trip", default: null },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracy: Number,
  recorded_at: { type: Date, default: Date.now },
});
locationSchema.index({ tourist_id: 1, recorded_at: -1 });
// Old GPS points are deleted automatically (retention is set in env.js via LOCATION_RETENTION_DAYS)
locationSchema.index({ recorded_at: 1 }, { expireAfterSeconds: Math.round(env.LOCATION_RETENTION_DAYS * 86400) });
const Location = mongoose.model("Location", locationSchema);

// ---- Incidents --------------------------------------------------------------
const incidentSchema = new Schema(
  {
    incident_code: { type: String, required: true, unique: true },
    company_id: { type: ObjectId, ref: "Company", required: true },
    trip_id: { type: ObjectId, ref: "Trip", default: null },
    tourist_id: { type: ObjectId, ref: "Tourist", required: true, index: true },
    type: { type: String, required: true, enum: ["SOS", "MEDICAL", "ACCIDENT", "LOST", "THEFT", "HARASSMENT", "UNSAFE", "TRANSPORT", "ROUTE_DEVIATION", "ZONE_ALERT", "RISK_ALERT", "OTHER"] },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
    description: String,
    latitude: Number,
    longitude: Number,
    status: { type: String, enum: ["NEW", "ACKNOWLEDGED", "RESPONDING", "ON_SITE", "RESOLVED", "FALSE_ALARM"], default: "NEW", index: true },
    source: { type: String, enum: ["TOURIST", "SYSTEM"], default: "TOURIST" },
    assigned_unit_id: { type: ObjectId, ref: "ResponseUnit", default: null, index: true },
    assigned_at: Date,
    on_site_at: Date,
    resolution_note: String,
    resolved_at: Date,
    updates: [{ note: { type: String, required: true }, created_at: { type: Date, default: Date.now }, _id: false }],
  },
  opts
);
incidentSchema.index({ company_id: 1, created_at: -1 });
incidentSchema.index({ created_at: -1 });
const Incident = mongoose.model("Incident", incidentSchema);

// ---- Safety -----------------------------------------------------------------
const safetyCheckSchema = new Schema(
  { tourist_id: { type: ObjectId, ref: "Tourist", required: true }, status: { type: String, enum: ["SAFE", "MISSED"], required: true }, latitude: Number, longitude: Number },
  opts
);
safetyCheckSchema.index({ tourist_id: 1, created_at: -1 });
const SafetyCheck = mongoose.model("SafetyCheck", safetyCheckSchema);

const travelSchema = new Schema(
  {
    tourist_id: { type: ObjectId, ref: "Tourist", required: true, index: true },
    destination: String,
    expected_return: { type: Date, required: true },
    started_at: { type: Date, default: Date.now },
    ended_at: Date,
    status: { type: String, enum: ["ACTIVE", "OVERDUE", "RETURNED"], default: "ACTIVE" },
  },
  opts
);
travelSchema.index({ status: 1, expected_return: 1 });
const TravelSession = mongoose.model("TravelSession", travelSchema);

const EmergencyContact = mongoose.model(
  "EmergencyContact",
  new Schema({ tourist_id: { type: ObjectId, ref: "Tourist", required: true, index: true }, name: { type: String, required: true }, relationship: String, phone: { type: String, required: true } }, opts)
);

const notificationSchema = new Schema(
  {
    audience: { type: String, enum: ["COMPANY", "AUTHORITY"], default: "COMPANY" },
    company_id: { type: ObjectId, ref: "Company", default: null },
    tourist_id: { type: ObjectId, ref: "Tourist", default: null },
    message: { type: String, required: true },
    type: { type: String, enum: ["SOS", "OVERDUE_TRAVEL", "STALE_LOCATION", "MISSED_CHECKIN", "ZONE_ALERT", "HIGH_RISK", "VERIFICATION", "ID_EXPIRED", "ID_RENEWED", "ROUTE_DEVIATION", "SOS_CLEARED"], required: true },
    read: { type: Boolean, default: false },
  },
  opts
);
notificationSchema.index({ company_id: 1, created_at: -1 });
notificationSchema.index({ audience: 1, created_at: -1 });
const Notification = mongoose.model("Notification", notificationSchema);

// ---- Authority, zones, response units, proof ledger -------------------------------
const Authority = mongoose.model(
  "Authority",
  new Schema({ name: { type: String, required: true, trim: true }, email, department: String, region: String, password_hash: { type: String, required: true } }, opts)
);

const Zone = mongoose.model(
  "Zone",
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      type: { type: String, enum: ["SAFE", "CAUTION", "DANGER", "RESTRICTED", "REST_POINT"], required: true, index: true },
      risk_level: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "LOW" },
      description: String,
      active: { type: Boolean, default: true, index: true },
      shape: {
        kind: { type: String, enum: ["CIRCLE", "POLYGON"], required: true },
        center: { latitude: Number, longitude: Number },
        radius_m: Number,
        polygon: [{ latitude: Number, longitude: Number, _id: false }],
      },
      created_by: { type: ObjectId, ref: "Authority" },
    },
    opts
  )
);

const ResponseUnit = mongoose.model(
  "ResponseUnit",
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      type: { type: String, enum: ["POLICE", "RESCUE", "MEDICAL", "LOCAL"], required: true },
      email,
      phone: String,
      password_hash: { type: String, required: true },
      status: { type: String, enum: ["AVAILABLE", "DISPATCHED", "EN_ROUTE", "ON_SCENE", "OFFLINE"], default: "AVAILABLE", index: true },
      location: { latitude: Number, longitude: Number, updated_at: Date },
      current_incident_id: { type: ObjectId, ref: "Incident", default: null },
    },
    opts
  )
);

// Tamper-evident ledger of verification proofs: each block hashes the previous one.
// This is a simulated chain for the prototype; it can later anchor to a real blockchain.
const proofSchema = new Schema({
  index: { type: Number, required: true, unique: true },
  tourist_id: { type: ObjectId, ref: "Tourist", required: true, index: true },
  digital_id: String,
  event: { type: String, default: "ISSUED" }, // ISSUED | ID_EXPIRED | ID_RENEWED
  record_hash: { type: String, required: true },
  prev_hash: { type: String, required: true },
  block_hash: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
});
const ProofBlock = mongoose.model("ProofBlock", proofSchema);

const AuditLog = mongoose.model(
  "AuditLog",
  new Schema(
    { actor_id: ObjectId, actor_role: String, actor_name: String, action: { type: String, required: true, index: true }, target_type: String, target_id: String, detail: Schema.Types.Mixed },
    { timestamps: { createdAt: "created_at", updatedAt: false } }
  )
);

// ---- Infrastructure ---------------------------------------------------------
const Counter = mongoose.model("Counter", new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }));

const refreshSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  user_id: { type: ObjectId, required: true, index: true },
  role: { type: String, required: true },
  revoked: { type: Boolean, default: false },
  revoked_at: Date,
  expires_at: { type: Date, required: true },
});
refreshSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // expired tokens vanish
const RefreshToken = mongoose.model("RefreshToken", refreshSchema);

const SchedulerLock = mongoose.model("SchedulerLock", new Schema({ _id: String, owner: String, locked_until: Date }, { versionKey: false }));

/** Atomic, gap-free-enough sequence generator (safe across multiple server instances). */
async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return c.seq;
}

module.exports = { AuditLog, Authority, Zone, ResponseUnit, ProofBlock, Company, Guide, Tourist, Trip, TripMember, Location, Incident, SafetyCheck, TravelSession, EmergencyContact, Notification, Counter, RefreshToken, SchedulerLock, nextSeq };
