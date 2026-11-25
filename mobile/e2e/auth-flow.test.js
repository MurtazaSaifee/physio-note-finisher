const {
  launchApp,
  terminateApp,
  tapElementByTestId,
  assertElementExists,
  waitFor,
} = require("./helpers");

async function runAuthFlowTests() {
  console.log("=== Auth Flow E2E Tests ===");
  let passed = 0;
  let failed = 0;

  // Test 1: App boots to sign-in or dashboard screen
  try {
    console.log("[TEST] App boots to sign-in screen");
    terminateApp();
    waitFor(1000);
    launchApp();
    waitFor(3000);
    try {
      assertElementExists("signin-submit-button");
      console.log("  PASS: Sign-in screen visible");
    } catch {
      assertElementExists("Clinical Dashboard");
      console.log("  PASS: Dashboard visible (already signed in)");
    }
    passed++;
  } catch (e) {
    console.error("  FAIL:", e.message);
    failed++;
  }

  // Test 2: Dev clinician sign-in works
  try {
    console.log("[TEST] Dev clinician sign-in works");
    // Only sign in if on sign-in screen
    try {
      assertElementExists("signin-submit-button");
      tapElementByTestId("signin-submit-button");
      waitFor(4000);
    } catch {
      // Already signed in
    }
    assertElementExists("Clinical Dashboard");
    console.log("  PASS: Signed in and dashboard visible");
    passed++;
  } catch (e) {
    console.error("  FAIL:", e.message);
    failed++;
  }

  // Test 3: Session restore after restart
  try {
    console.log("[TEST] Session restore after restart");
    terminateApp();
    waitFor(1000);
    launchApp();
    waitFor(4000);
    assertElementExists("bottom-nav-sessions");
    console.log("  PASS: Session restored, dashboard visible after restart");
    passed++;
  } catch (e) {
    console.error("  FAIL:", e.message);
    failed++;
  }

  console.log(`\n=== Auth Flow Results: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}

if (require.main === module) {
  runAuthFlowTests().then((results) => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}

module.exports = { runAuthFlowTests };
