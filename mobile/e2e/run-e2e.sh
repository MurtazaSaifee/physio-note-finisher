#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HEALTH_CHECK_SCRIPT="${PROJECT_ROOT}/.agents/skills/android-emulator-skill/scripts/emu_health_check.sh"
APP_PACKAGE="com.murtazasaifee.physionotefinisher.debug"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TOTAL_PASSED=0
TOTAL_FAILED=0

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Physio Note Finisher - E2E Test Run  ${NC}"
echo -e "${YELLOW}========================================${NC}"

# 1. Check emulator health
echo -e "\n${YELLOW}[1/4] Checking emulator health...${NC}"
if [ -f "${HEALTH_CHECK_SCRIPT}" ]; then
  bash "${HEALTH_CHECK_SCRIPT}"
else
  echo -e "${RED}ERROR: Emulator health check script not found at ${HEALTH_CHECK_SCRIPT}${NC}"
  exit 1
fi

# 2. Verify development build is installed and launch it
echo -e "\n${YELLOW}[2/4] Checking development build (${APP_PACKAGE})...${NC}"
if ! adb shell pm list packages | grep -q "${APP_PACKAGE}"; then
  echo -e "${RED}ERROR: Development build is not installed (${APP_PACKAGE}).${NC}"
  echo -e "${YELLOW}Build it with:${NC}"
  echo -e "  cd mobile && npx expo prebuild && cd android && ./gradlew assembleDebug"
  exit 1
fi

echo -e "${YELLOW}Launching development build...${NC}"
adb shell am force-stop "${APP_PACKAGE}" 2>/dev/null || true
sleep 1
adb shell monkey -p "${APP_PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep 8

# 3. Run all E2E tests
echo -e "\n${YELLOW}[3/4] Running E2E tests...${NC}"

TEST_FILES=(
  "${SCRIPT_DIR}/auth-flow.test.js"
  "${SCRIPT_DIR}/dashboard-flow.test.js"
  "${SCRIPT_DIR}/calendar-flow.test.js"
  "${SCRIPT_DIR}/voice-flow.test.js"
)

for test_file in "${TEST_FILES[@]}"; do
  test_name=$(basename "${test_file}" .test.js)
  echo -e "\n${YELLOW}--- Running: ${test_name} ---${NC}"
  if node "${test_file}"; then
    echo -e "${GREEN}--- ${test_name}: PASSED ---${NC}"
    ((TOTAL_PASSED++)) || true
  else
    echo -e "${RED}--- ${test_name}: FAILED ---${NC}"
    ((TOTAL_FAILED++)) || true
  fi
done

# 4. Report results
echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}  E2E Test Results Summary              ${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "Total test files passed: ${GREEN}${TOTAL_PASSED}${NC}"
echo -e "Total test files failed: ${RED}${TOTAL_FAILED}${NC}"

if [ ${TOTAL_FAILED} -eq 0 ]; then
  echo -e "\n${GREEN}All E2E tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}Some E2E tests failed.${NC}"
  exit 1
fi
