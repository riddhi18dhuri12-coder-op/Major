const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");
require("../models");

async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  logger.info("MongoDB connected");
  // Build indexes; a failure (e.g. a provider lacking TTL support) is logged, not fatal.
  const results = await Promise.allSettled(Object.values(mongoose.models).map((m) => m.init()));
  results.forEach((r, i) => {
    if (r.status === "rejected") logger.warn({ model: Object.keys(mongoose.models)[i], err: r.reason?.message }, "index build failed");
  });
}

async function disconnectDb() {
  await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb };
