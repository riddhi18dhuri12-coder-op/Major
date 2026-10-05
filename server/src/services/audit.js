const { AuditLog } = require("../models");
const logger = require("../utils/logger");

/** Record an important action. Never throws: a failed audit write must not break the request. */
async function audit(user, action, target_type, target_id, detail) {
  try {
    await AuditLog.create({ actor_id: user.id, actor_role: user.role, actor_name: user.name, action, target_type, target_id: target_id && String(target_id), detail });
  } catch (err) {
    logger.error({ err, action }, "audit write failed");
  }
}
module.exports = { audit };
