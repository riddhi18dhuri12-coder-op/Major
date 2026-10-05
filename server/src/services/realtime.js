const { Server } = require("socket.io");
const env = require("../config/env");
const logger = require("../utils/logger");
const { verifyAccess } = require("./tokens");

let io = null;

/** Attach Socket.IO to the HTTP server. Sockets use the same access token as REST. */
function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.corsOrigins, credentials: true } });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Missing token"));
      socket.user = verifyAccess(token);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const { company_id, role, id } = socket.user;
    if (company_id) socket.join(`company:${company_id}`);
    if (role === "tourist") socket.join(`tourist:${id}`);
    if (role === "authority") socket.join("authority");
    if (role === "responder") socket.join(`unit:${id}`);
    logger.debug({ role, id }, "socket connected");
  });
  return io;
}

// No-ops when sockets aren't running (tests, scripts) so services never need to check.
const emitToCompany = (companyId, event, payload) => io?.to(`company:${companyId}`).emit(event, payload);
const emitToTourist = (touristId, event, payload) => io?.to(`tourist:${touristId}`).emit(event, payload);
const emitToAuthority = (event, payload) => io?.to("authority").emit(event, payload);
const emitToUnit = (unitId, event, payload) => io?.to(`unit:${unitId}`).emit(event, payload);
const closeRealtime = () => new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));

module.exports = { initRealtime, emitToCompany, emitToTourist, emitToAuthority, emitToUnit, closeRealtime };
