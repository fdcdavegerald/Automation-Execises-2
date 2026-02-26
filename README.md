# Teacher Workflow Test - Production-Ready Playwright Test

This repository contains a production-ready Playwright test suite for the teacher workflow, specifically designed to handle race conditions, page reloads, and dynamic UI changes.

## Overview

The test suite covers the following test cases:

- **TC1**: Teacher Login
- **TC2**: Change Teacher Status to STANDBY
- **TC3**: Wait for Student to Join (with 3-minute timeout)
- **TC4**: Open New Tab (BBC Website)
- **TC5**: Close Tab with Confirmation

## Key Features

✅ **Resilient to Timing Issues** - No arbitrary delays or `waitForTimeout()` (except for necessary brief pauses)
✅ **Soft Assertions** - Test continues even after failures
✅ **Comprehensive Screenshot Capture** - Screenshots taken after every step
✅ **Human-Readable Error Messages** - Clean, non-technical error messages in filenames
✅ **Video Recording** - Full test execution recorded
✅ **Synchronization Handling** - Properly handles page reloads and DOM re-renders
✅ **State Management** - Elements re-located before interaction to avoid stale references

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running Tests

### Run the teacher workflow test:
```bash
npm run test:teacher
```

### Run with headed browser (visible):
```bash
npm run test:headed
```

### Run in debug mode:
```bash
npm run test:debug
```

### Run all tests:
```bash
npm test
```

## Output

### Screenshots
- Located in: `./screenshots/`
- Naming convention:
  - Success: `TC# - description.png`
  - Failure: `TC# - ERROR: human-readable-error.png`

### Videos
- Located in: `./recordings/`
- File: `TC1.webm`

### Test Reports
- HTML report generated after test execution
- View with: `npx playwright show-report`

## Test Flow

### TC1: Teacher Login
1. Navigate to login page
2. Fill email: `fdc.davegeraldbooc2@gmail.com`
3. Fill password: `admin123`
4. Click Sign In
5. Verify redirection to `/teacher/home`

### TC2: Change Status to STANDBY
6. Close all modals
7. Click "NOT STANDBY" dropdown
8. Select "STANDBY" option
9. Wait for page reload
10. Verify status changed to "STANDBY"
11. Grant microphone and camera permissions

### TC3: Wait for Student to Join
12. Wait up to 3 minutes for status to change from "STANDBY" to "ON GOING LESSON"
13. If student joins, check all checkboxes in modal
14. Verify modal closes successfully
15. **If no student joins within 3 minutes, test stops with error**

### TC4: Open New Tab
16. Open new browser tab
17. Navigate to `https://www.bbc.com/`
18. Verify page loads

### TC5: Close Tab with Confirmation
19. Return to first tab
20. Close the tab
21. Handle browser confirmation dialog
22. Click "Leave" button
23. Verify tab successfully closed

## Important Notes

⚠️ **Student Join Timeout**: TC3 requires a student to join within 3 minutes. If no student joins, the test will:
- Take a screenshot with error message
- Log the timeout
- Stop execution (TC4 and TC5 will not run)

⚠️ **Soft Assertions**: The test uses soft assertions, meaning:
- Failed steps are logged and screenshot is taken
- Test continues to execute remaining steps
- All failures are reported at the end

⚠️ **Synchronization**: The test handles:
- Page reloads triggered by status changes
- DOM re-renders
- Element replacements
- Network latency

## Configuration

### Playwright Config (`playwright.config.ts`)
- Video recording: Enabled for all tests
- Screenshot: Enabled on failure (manual screenshots also taken in test)
- Browsers: Chromium, Firefox, WebKit

### Test Timeout
- Total test timeout: 5 minutes (300,000ms)
- Student join timeout: 3 minutes (180,000ms)

## Troubleshooting

### TypeScript Errors
If you see TypeScript errors, ensure dependencies are installed:
```bash
npm install
```

### Browser Not Found
Install Playwright browsers:
```bash
npx playwright install
```

### Test Hangs at TC3
This is expected behavior if no student joins. The test will wait up to 3 minutes and then stop with an error screenshot.

## Technical Implementation

### Anti-Flakiness Patterns Used

1. **Element Re-location**: Elements are located immediately before interaction
2. **Explicit Waits**: Using Playwright's auto-waiting with `.waitFor()` and `.toBeVisible()`
3. **Navigation Synchronization**: Proper handling with `Promise.all()` for navigation events
4. **State Verification**: Always verify UI state after actions
5. **No Cached Handles**: Never reuse element handles across page reloads

### No Forbidden Patterns
- ❌ No `waitForTimeout()` for synchronization (only used for brief UI animations)
- ❌ No arbitrary sleeps
- ❌ No cached element handles
- ❌ No parallel UI actions
- ❌ No immediate assertions without waiting

## File Structure

```
optimize-case/
├── tests/
│   └── teacher-workflow.spec.ts    # Main test file
├── screenshots/                      # Test screenshots
├── recordings/                       # Test videos
├── playwright.config.ts             # Playwright configuration
├── package.json                     # Dependencies and scripts
└── README.md                        # This file
```

## Support

For issues or questions, please review:
1. Screenshot files in `./screenshots/` for visual debugging
2. Video recording in `./recordings/` for full test execution
3. Console output for soft assertion errors
4. Playwright HTML report: `npx playwright show-report`
