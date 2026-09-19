// electron/licensing/cryptoUtil.js
// Cryptographic utilities for license signature generation and verification
const crypto = require("crypto");

/**
 * Deterministically sorts object keys for canonical serialization.
 * Ensures the signature verifies reliably regardless of property insertion order.
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const items = keys.map((key) => {
    return JSON.stringify(key) + ":" + canonicalize(obj[key]);
  });
  return "{" + items.join(",") + "}";
}

/**
 * Signs a payload object using Ed25519 private key (Server side only)
 */
function signPayload(payload, privateKeyPem) {
  const canonicalData = canonicalize(payload);
  const signature = crypto.sign(null, Buffer.from(canonicalData, "utf8"), privateKeyPem);
  return signature.toString("base64");
}

/**
 * Verifies a payload object using Ed25519 public key (Client & Server)
 */
function verifySignature(payload, signatureBase64, publicKeyPem) {
  try {
    if (!payload || !signatureBase64 || !publicKeyPem) return false;
    const canonicalData = canonicalize(payload);
    const signatureBuffer = Buffer.from(signatureBase64, "base64");
    return crypto.verify(null, Buffer.from(canonicalData, "utf8"), publicKeyPem, signatureBuffer);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

/**
 * Computes SHA-256 digest of a string
 */
function sha256(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex");
}

module.exports = {
  canonicalize,
  signPayload,
  verifySignature,
  sha256
};
