const { ZodError } = require("zod");
const { HttpError } = require("../utils/errors");
const logger = require("../utils/logger");
const env = require("../config/env");

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  if (err?.code === 11000) return res.status(409).json({ error: "A record with this value already exists" });
  if (err?.name === "CastError" || err?.name === "ValidationError") return res.status(400).json({ error: "Invalid request data" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });

  (req.log || logger).error({ err }, "unhandled error");
  res.status(500).json({ error: env.isProd ? "Internal server error" : err.message });
}

module.exports = { notFoundHandler, errorHandler };
