const { verifyAccess } = require("../services/tokens");
const { unauthorized, forbidden } = require("../utils/errors");

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const [scheme, token] = h.split(" ");
  if (scheme !== "Bearer" || !token) return next(unauthorized("Missing token"));
  try {
    req.user = verifyAccess(token);
    next();
  } catch (e) {
    next(unauthorized(e.name === "TokenExpiredError" ? "Token expired" : "Invalid token"));
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden("You do not have access to this resource"));

module.exports = { requireAuth, requireRole };
