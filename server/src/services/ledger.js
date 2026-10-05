const crypto = require("crypto");
const env = require("../config/env");
const { ProofBlock } = require("../models");

/**
 * Verification proof ledger. Only a hash of the verified record goes in; personal data never does.
 * Every block contains the hash of the previous one, so editing any past record breaks the chain
 * and is detected by verifyChain(). This is a self-contained simulated chain for the prototype;
 * the same record_hash could later be anchored on a public blockchain.
 */
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const GENESIS = "0".repeat(64);

/** Salted one-way hash of a document number (so the raw number is never stored). */
const hashDocument = (type, number) =>
  crypto.createHmac("sha256", env.PROOF_SALT || env.JWT_REFRESH_SECRET).update(`${type}:${String(number).trim().toUpperCase()}`).digest("hex");

const blockHash = (b) => sha(`${b.index}|${b.tourist_id}|${b.record_hash}|${b.prev_hash}|${new Date(b.created_at).toISOString()}`);

async function appendProof({ tourist_id, digital_id, document_hash, verified_at }) {
  const record_hash = sha(JSON.stringify({ digital_id, document_hash, verified_at: new Date(verified_at).toISOString() }));
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await ProofBlock.findOne().sort({ index: -1 });
    const block = { index: (last?.index ?? -1) + 1, tourist_id, digital_id, record_hash, prev_hash: last?.block_hash || GENESIS, created_at: new Date() };
    block.block_hash = blockHash(block);
    try {
      return await ProofBlock.create(block);
    } catch (e) {
      if (e.code !== 11000) throw e; // another request took this index: re-read the tip and retry
    }
  }
  throw new Error("Could not append to the proof ledger");
}

/** Walks the chain and reports the first inconsistency, if any. */
async function verifyChain() {
  const blocks = await ProofBlock.find().sort({ index: 1 }).lean();
  let prev = GENESIS;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.index !== i) return { valid: false, length: blocks.length, broken_at: i, reason: "Missing block" };
    if (b.prev_hash !== prev) return { valid: false, length: blocks.length, broken_at: i, reason: "Chain link broken" };
    if (blockHash(b) !== b.block_hash) return { valid: false, length: blocks.length, broken_at: i, reason: "Block contents were altered" };
    prev = b.block_hash;
  }
  return { valid: true, length: blocks.length, head: prev === GENESIS ? null : prev };
}

module.exports = { appendProof, verifyChain, hashDocument };
