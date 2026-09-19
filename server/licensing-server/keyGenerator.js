// server/licensing-server/keyGenerator.js
// Utility to generate official Ed25519 signing and verification keypairs
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function generateKeys() {
  console.log("Generating official Ed25519 licensing cryptographic keypair...");

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  const serverKeysDir = path.join(__dirname, "keys");
  if (!fs.existsSync(serverKeysDir)) {
    fs.mkdirSync(serverKeysDir, { recursive: true });
  }

  const serverPrivateKeyPath = path.join(serverKeysDir, "license_private_key.pem");
  const serverPublicKeyPath = path.join(serverKeysDir, "license_public_key.pem");

  fs.writeFileSync(serverPrivateKeyPath, privateKey, "utf8");
  fs.writeFileSync(serverPublicKeyPath, publicKey, "utf8");

  // Also output client verification public key
  const clientPublicKeyPath = path.join(__dirname, "..", "..", "electron", "licensing", "licensePublicKeys.js");
  const clientKeyContent = `// electron/licensing/licensePublicKeys.js
// Embedded official public verification key for Aaj Cash & Carry POS
// NOTE: This file contains ONLY the public verification key.
// The private signing key NEVER resides on the client machine.

const LICENSING_PUBLIC_KEY = ${JSON.stringify(publicKey)};

module.exports = {
  LICENSING_PUBLIC_KEY
};
`;

  fs.writeFileSync(clientPublicKeyPath, clientKeyContent, "utf8");

  console.log("✅ Keypair generated successfully!");
  console.log("Server Private Key saved to:", serverPrivateKeyPath);
  console.log("Server Public Key saved to:", serverPublicKeyPath);
  console.log("Client Public Key written to:", clientPublicKeyPath);
}

if (require.main === module) {
  generateKeys();
}

module.exports = { generateKeys };
