const {
  launchApp,
  terminateApp,
  tapElementByTestId,
  assertElementExists,
  waitFor,
} = require("./helpers");

async function runCalendarFlowTests() {
  console.log("=== Calendar Flow E2E Tests ===");
  let passed = 0;
  let failed = 0;

  // Ensure signed in and on dashboard
  try {
    terminateApp();
    waitFor(1000);
    launchApp();
    waitFor(4000);
    try {
      assertElementExists("signin-submit-button");
      tapElementByTestId("signin-submit-button");
      waitFor(4000);
    } catch {
      // Already signed in
    }
    assertElementExists("Clinical Dashboard");
  } catch (e) {
    console.error("[SETUP] Failed to reach dashboard:", e.message);
    return { passed, failed };
  }

  // Test 1: Calendar day view loads
  try {
    console.log("[TEST] Calendar day view loads");
    tapElementByTestId("bottom-nav-calendar");
    waitFor(2000);
    assertElementExists("calendar-new-appointment-button");
    console.log("  PASS: Calendar day view loads");
    passed++;
  } catch (e) {
    console.error("  FAIL:", e.message);
    failed++;
  }

  // Test 2: New appointment button navigates
  try {
    console.log("[TEST] New appointment button navigates");
    tapElementByTestId("calendar-new-appointment-button");
    waitFor(2000);
    assertElementExists("new-appointment-create-button");
    console.log("  PASS: New appointment screen reached");
    passed++;
  } catch (e) {
    console.error("  FAIL:", e.message);
    failed++;
  }

  console.log(`\n=== Calendar Flow Results: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}

if (require.main === module) {
  runCalendarFlowTests().then((results) => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}

module.exports = { runCalendarFlowTests };
