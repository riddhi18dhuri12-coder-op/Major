const http = require("http");
const env = require("./config/env");
const logger = require("./utils/logger");
const { connectDb, disconnectDb } = require("./config/db");
const { createApp } = require("./app");
const { initRealtime, closeRealtime } = require("./services/realtime");
const { startScheduler } = require("./services/scheduler");

async function main() {
  await connectDb();
  const server = http.createServer(createApp());
  initRealtime(server);
  server.listen(env.PORT, () => logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`));
  const timer = startScheduler();

  let closing = false;
  async function shutdown(signal) {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "shutting down");
    clearInterval(timer);
    const force = setTimeout(() => process.exit(1), 10_000).unref();
    await closeRealtime();
    server.close(async () => {
      await disconnectDb();
      clearTimeout(force);
      process.exit(0);
    });
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (err) => logger.error({ err }, "unhandled rejection"));
main().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
