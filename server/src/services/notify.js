const { Notification } = require("../models");
const { pub } = require("../utils/serialize");
const { emitToCompany, emitToAuthority } = require("./realtime");

/**
 * Store a notification and push it live. By default it goes to the tourist's company;
 * pass authority: true to also alert the authority dashboard (stored as a separate copy
 * so each audience can mark its own as read).
 */
async function notify({ company_id = null, tourist_id = null, type, message, authority = false }) {
  let payload = null;
  if (company_id) {
    payload = pub(await Notification.create({ audience: "COMPANY", company_id, tourist_id, type, message }));
    emitToCompany(company_id, "notification:new", payload);
  }
  if (authority) {
    const a = pub(await Notification.create({ audience: "AUTHORITY", tourist_id, type, message }));
    emitToAuthority("notification:new", a);
    payload ||= a;
  }
  return payload;
}

module.exports = { notify };
