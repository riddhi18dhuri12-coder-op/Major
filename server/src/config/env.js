require("dotenv").config();
const { z } = require("zod");

const bool = z.enum(["true", "false"]).default("true").transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),
  PROOF_SALT: z.string().min(16).optional(),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.string().default("info"),
  CHECKIN_INTERVAL_HOURS: z.coerce.number().positive().default(12),
  STALE_LOCATION_MINUTES: z.coerce.number().positive().default(30),
  LOCATION_RETENTION_DAYS: z.coerce.number().positive().default(30),
  SCHEDULER_ENABLED: bool,
  AUTO_ZONES: bool, // automatic zones from OpenStreetMap + incident history
  OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter"),
  AUTO_ZONE_HOTSPOT_MIN: z.coerce.number().int().min(2).default(3),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().positive().default(60),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const i of parsed.error.issues) console.error(`  - ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}

const env = parsed.data;
env.corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
env.overpassUrls = env.OVERPASS_URL.split(",").map((s) => s.trim()).filter(Boolean);
env.isProd = env.NODE_ENV === "production";
module.exports = env;
