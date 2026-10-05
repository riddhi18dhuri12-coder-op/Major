const mongoose = require("mongoose");
const { notFound } = require("./errors");

/** Throws 404 for a malformed ObjectId so routes never leak CastErrors. */
function oid(value, label = "Resource") {
  if (!mongoose.isValidObjectId(value) || String(value).length !== 24) throw notFound(`${label} not found`);
  return new mongoose.Types.ObjectId(String(value));
}
module.exports = { oid };
