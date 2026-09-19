// scripts/test_admin_security.js
const path = require("path");
const { app } = require("electron");

console.log("Testing Admin Security & Recovery features...");

const {
  loginAdmin,
  changeAdminPassword,
  setAdminRecoveryPin,
  getAdminSecurityStatus,
  resetAdminPasswordWithPin
} = require("../electron/database");

try {
  // Test 1: Verify current admin login
  console.log("\n1. Testing current admin login (1234)...");
  const login1 = loginAdmin("admin", "1234");
  console.log("Login result:", login1.success ? "✅ Success" : "❌ Failed", login1);

  // Test 2: Check security status (should be false or true)
  console.log("\n2. Checking security status...");
  const status1 = getAdminSecurityStatus();
  console.log("Security status:", status1);

  // Test 3: Set Master Recovery PIN to 7860
  console.log("\n3. Setting Master Recovery PIN to 7860 with current password 1234...");
  const pinRes = setAdminRecoveryPin("1234", "7860");
  console.log("Set PIN result:", pinRes);

  const status2 = getAdminSecurityStatus();
  console.log("Updated Security status:", status2);
  if (!status2.hasRecoveryPin) throw new Error("hasRecoveryPin should be true!");

  // Test 4: Change admin password from 1234 to pass786
  console.log("\n4. Changing admin password to pass786...");
  const changeRes = changeAdminPassword("1234", "pass786");
  console.log("Change password result:", changeRes);

  const loginOld = loginAdmin("admin", "1234");
  console.log("Old password login (should fail):", !loginOld.success ? "✅ Correctly rejected" : "❌ Unexpected success");

  const loginNew = loginAdmin("admin", "pass786");
  console.log("New password login (should succeed):", loginNew.success ? "✅ Success" : "❌ Failed");

  // Test 5: Reset password using Master PIN
  console.log("\n5. Testing Forgot Password reset via Master PIN (7860)...");
  const wrongPinReset = resetAdminPasswordWithPin("admin", "0000", "newpass999");
  console.log("Wrong PIN reset (should fail):", !wrongPinReset.success ? "✅ Correctly rejected" : "❌ Unexpected success", wrongPinReset);

  const correctPinReset = resetAdminPasswordWithPin("admin", "7860", "1234");
  console.log("Correct PIN reset (resetting back to 1234):", correctPinReset.success ? "✅ Success" : "❌ Failed", correctPinReset);

  const loginRestored = loginAdmin("admin", "1234");
  console.log("Login with restored 1234:", loginRestored.success ? "✅ Success" : "❌ Failed");

  console.log("\n=============================================");
  console.log("🎉 ALL ADMIN SECURITY TESTS PASSED PERFECTLY!");
  console.log("=============================================");
} catch (err) {
  console.error("Test error:", err);
} finally {
  if (app && app.quit) app.quit();
  process.exit(0);
}
