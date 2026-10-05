const rateLimit = require("express-rate-limit");
const env = require("../config/env");

const make = (windowMs, limit, message, keyGenerator) =>
  rateLimit({
    windowMs,
    limit: env.NODE_ENV === "test" ? 10000 : limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: message },
    ...(keyGenerator && { keyGenerator }),
  });

const byUser = (req) => req.user?.id || req.ip;

module.exports = {
  globalLimiter: make(15 * 60 * 1000, 600, "Too many requests, please slow down"),
  authLimiter: make(15 * 60 * 1000, 20, "Too many login attempts, try again in 15 minutes"),
  sosLimiter: make(60 * 1000, 10, "Too many emergency requests", byUser),
  locationLimiter: make(60 * 1000, 120, "Location updates too frequent", byUser),
};
