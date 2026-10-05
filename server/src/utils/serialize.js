const HIDDEN = new Set(["password_hash", "__v"]);

/** Turn a mongoose doc / lean object into a plain API object: _id -> id, hide secrets. */
function pub(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (HIDDEN.has(k)) continue;
    if (k === "_id") out.id = String(v);
    else out[k] = v;
  }
  // never expose the stored document hash / reviewer id outside the verification service
  if (out.verification) {
    const { document_hash, reviewed_by, ...safe } = out.verification;
    out.verification = safe;
  }
  return out;
}
const pubList = (docs) => docs.map(pub);

module.exports = { pub, pubList };
