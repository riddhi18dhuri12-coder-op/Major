const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");
const pinoHttp = require("pino-http");
const env = require("./config/env");
const logger = require("./utils/logger");
const { globalLimiter } = require("./middleware/rateLimit");
const { notFoundHandler, errorHandler } = require("./middleware/error");

function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // no Origin header = curl / server-to-server / mobile webview; browsers must be on the allow-list
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", globalLimiter);

  // Liveness: process is up. Readiness: database is reachable (use this for load balancer checks).
  app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.get("/api/ready", (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ ready });
  });

  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/trips", require("./routes/trips"));
  app.use("/api/location", require("./routes/location"));
  app.use("/api/incidents", require("./routes/incidents"));
  app.use("/api/safety", require("./routes/safety"));
  app.use("/api/notifications", require("./routes/notifications"));
  app.use("/api/zones", require("./routes/zones"));
  app.use("/api/authority", require("./routes/authority"));
  app.use("/api/responder", require("./routes/responder"));
  app.use("/api/verification", require("./routes/verification"));
  app.use("/api/routes", require("./routes/routing"));
  app.use("/api", require("./routes/people")); // /guides, /tourists, /me/*

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
