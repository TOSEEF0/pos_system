// electron/licensing/deviceFingerprint.js
// Multi-source, privacy-conscious Windows device fingerprinting
const { execSync } = require("child_process");
const os = require("os");
const crypto = require("crypto");

let cachedFingerprint = null;

function getWindowsMachineGuid() {
  try {
    const stdout = execSync(
      'powershell -NoProfile -Command "(Get-ItemPropertyValue -Path \'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\' -Name \'MachineGuid\')"',
      { encoding: "utf8", timeout: 3000 }
    );
    return stdout.trim();
  } catch (e) {
    try {
      const regOut = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
        encoding: "utf8",
        timeout: 3000
      });
      const match = regOut.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
      return match ? match[1].trim() : "";
    } catch (_) {
      return "";
    }
  }
}

function getSystemUuid() {
  try {
    const stdout = execSync(
      'powershell -NoProfile -Command "try { (Get-CimInstance Win32_ComputerSystemProduct).UUID } catch { \'\' }"',
      { encoding: "utf8", timeout: 3000 }
    );
    return stdout.trim();
  } catch (e) {
    return "";
  }
}

function getCpuIdentifier() {
  return process.env.PROCESSOR_IDENTIFIER || os.cpus()[0]?.model || "unknown-cpu";
}

/**
 * Computes a stable, privacy-conscious hardware binding for this machine.
 * Returns: { deviceBinding: string, rawComponentsSummary: object }
 */
function getDeviceFingerprint() {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  const machineGuid = getWindowsMachineGuid();
  const systemUuid = getSystemUuid();
  const cpuId = getCpuIdentifier();
  const hostname = os.hostname();

  // Combine multiple independent signals
  const rawString = [
    machineGuid || "no-machine-guid",
    systemUuid || "no-system-uuid",
    cpuId,
    hostname
  ].join("|#|");

  const hash = crypto.createHash("sha256").update(rawString, "utf8").digest("hex");
  
  // Format as readable device binding ID: DEV-XXXX-XXXX-XXXX-XXXX
  const p1 = hash.substring(0, 4).toUpperCase();
  const p2 = hash.substring(4, 8).toUpperCase();
  const p3 = hash.substring(8, 12).toUpperCase();
  const p4 = hash.substring(12, 16).toUpperCase();
  const deviceBinding = `DEV-${p1}-${p2}-${p3}-${p4}`;

  cachedFingerprint = {
    deviceBinding,
    rawHash: hash,
    components: {
      hasMachineGuid: Boolean(machineGuid),
      hasSystemUuid: Boolean(systemUuid),
      cpu: cpuId.substring(0, 30),
      platform: process.platform,
      arch: process.arch
    }
  };

  return cachedFingerprint;
}

module.exports = {
  getDeviceFingerprint
};
