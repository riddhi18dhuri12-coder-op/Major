const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { RefreshToken } = require("../models");
const { unauthorized } = require("../utils/errors");

const REUSE_GRACE_MS = 10_000;

/** What goes into the access token (and what req.user looks like). */
function claims(user) {
  const c = { sub: String(user.id), role: user.role, name: user.name, email: user.email };
  if (user.company_id) c.company_id = String(user.company_id); // authorities and response units are not tied to a company
  return c;
}

function signAccess(user) {
  return jwt.sign(claims(user), env.JWT_ACCESS_SECRET, { algorithm: "HS256", expiresIn: env.ACCESS_TOKEN_TTL });
}

function verifyAccess(token) {
  const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  return { id: p.sub, role: p.role, company_id: p.company_id, name: p.name, email: p.email };
}

async function issueRefresh(user) {
  const jti = crypto.randomUUID();
  const expires_at = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000);
  await RefreshToken.create({ jti, user_id: user.id, role: user.role, expires_at });
  return jwt.sign({ sub: String(user.id), role: user.role, jti }, env.JWT_REFRESH_SECRET, { algorithm: "HS256", expiresIn: Math.floor((expires_at - Date.now()) / 1000) });
}

/** Both tokens for a login / refresh response. */
async function issuePair(user) {
  return { access_token: signAccess(user), refresh_token: await issueRefresh(user), token_type: "Bearer", expires_in: env.ACCESS_TOKEN_TTL };
}

/**
 * Validates a refresh token and rotates it. A token that was already used is
 * treated as stolen: every session of that user is revoked.
 */
async function consumeRefresh(token) {
  let p;
  try {
    p = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw unauthorized("Invalid refresh token");
  }
  const rec = await RefreshToken.findOneAndUpdate({ jti: p.jti, revoked: false }, { revoked: true, revoked_at: new Date() });
  if (!rec) {
    // Two tabs (or a retried request) refreshing at the same instant is normal: just refuse the loser.
    // Replaying a token that was rotated a while ago is a theft signal: kill every session.
    const old = await RefreshToken.findOne({ jti: p.jti }).lean();
    const justRotated = old?.revoked_at && Date.now() - old.revoked_at.getTime() < REUSE_GRACE_MS;
    if (!justRotated) await RefreshToken.updateMany({ user_id: p.sub }, { revoked: true, revoked_at: new Date() });
    throw unauthorized(justRotated ? "Refresh token was just used" : "Refresh token reuse detected; please sign in again");
  }
  return { id: p.sub, role: p.role };
}

async function revokeRefresh(token) {
  try {
    const p = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"], ignoreExpiration: true });
    await RefreshToken.updateOne({ jti: p.jti }, { revoked: true, revoked_at: new Date() });
  } catch {
    /* already invalid; nothing to revoke */
  }
}

const revokeAllFor = (userId) => RefreshToken.updateMany({ user_id: userId }, { revoked: true, revoked_at: new Date() });

module.exports = { signAccess, verifyAccess, issuePair, consumeRefresh, revokeRefresh, revokeAllFor };
