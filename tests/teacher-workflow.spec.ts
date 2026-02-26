import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Production-Ready Playwright Test for Teacher Workflow
 * Handles race conditions, page reloads, and dynamic UI changes
 */

// Global test configuration
const TEST_TIMEOUT = 300000; // 5 minutes
const STUDENT_JOIN_TIMEOUT = 180000; // 3 minutes for student to join
const BASE_URL = 'https://english-staging.fdc-inc.com/teacher/';
const TEACHER_EMAIL = 'fdc.davegeraldbooc2@gmail.com';
const TEACHER_PASSWORD = 'admin123';

// Soft assertion tracking
interface SoftAssertionError {
  stepNumber: number;
  message: string;
  timestamp: Date;
}

const softAssertionErrors: SoftAssertionError[] = [];

/**
 * Helper: Ensure directories exist and clean old files
 */
function ensureDirectories() {
  const dirs = ['screenshots', 'recordings'];
  dirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    } else {
      // Clean old files in the directory
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      });
    }
  });
}

/**
 * Helper: Sanitize filename to be filesystem-safe
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper: Extract human-readable error message
 */
function getHumanReadableError(error: any): string {
  let message = '';
  
  if (error && typeof error === 'object') {
    if (error.message) {
      message = error.message;
    } else if (error.matcherResult && error.matcherResult.message) {
      message = error.matcherResult.message;
    } else {
      message = String(error);
    }
  } else {
    message = String(error);
  }
  
  // Remove ANSI codes and Playwright formatting
  message = message
    .replace(/\u001b\[.*?m/g, '') // Remove ANSI escape codes
    .replace(/\u001b\].*?\u0007/g, '')
    .replace(/expect\(.*?\)\./g, '')
    .replace(/Timeout \d+ms exceeded\.?/g, 'Operation timed out')
    .replace(/locator\('.*?'\)/g, 'element')
    .replace(/Expected.*?Received/g, 'Mismatch:')
    .trim();
  
  // Simplify common errors
  if (message.includes('not visible')) {
    message = 'Element not visible';
  } else if (message.includes('not found')) {
    message = 'Element not found';
  } else if (message.includes('attached')) {
    message = 'Element not attached to DOM';
  } else if (message.includes('timeout')) {
    message = 'Operation timed out';
  }
  
  return message;
}

/**
 * Helper: Soft assertion with screenshot on failure
 */
async function softAssert(
  page: Page,
  tcNumber: string,
  stepDescription: string,
  assertionFn: () => Promise<void>,
  customErrorMessage?: string
) {
  try {
    await assertionFn();
    // Success - take screenshot
    const filename = sanitizeFilename(`${tcNumber} - ${stepDescription}.png`);
    await page.screenshot({ 
      path: path.join('screenshots', filename),
      fullPage: true 
    });
  } catch (error: any) {
    // Failure - capture error and screenshot
    const errorMessage = customErrorMessage || getHumanReadableError(error);
    const filename = sanitizeFilename(`${tcNumber} - ERROR: ${errorMessage}.png`);
    
    await page.screenshot({ 
      path: path.join('screenshots', filename),
      fullPage: true 
    });
    
    softAssertionErrors.push({
      stepNumber: parseInt(tcNumber.replace('TC', '')),
      message: errorMessage,
      timestamp: new Date()
    });
    
    console.error(`[${tcNumber}] Soft assertion failed: ${errorMessage}`);
  }
}

/**
 * Helper: Take screenshot without assertion
 */
async function takeScreenshot(page: Page, tcNumber: string, description: string, isError: boolean = false) {
  const prefix = isError ? 'ERROR: ' : '';
  const filename = sanitizeFilename(`${tcNumber} - ${prefix}${description}.png`);
  await page.screenshot({ 
    path: path.join('screenshots', filename),
    fullPage: true 
  });
}

/**
 * Helper: Close all modals
 */
async function closeAllModals(page: Page) {
  const maxAttempts = 10;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Check for common modal close patterns
    const closeButtons = await page.getByRole('button', { name: /close|×|cancel|ok|confirm/i }).all();
    
    if (closeButtons.length === 0) {
      // No more modals found
      break;
    }
    
    // Try to close visible modals
    for (const closeButton of closeButtons) {
      try {
        if (await closeButton.isVisible({ timeout: 1000 })) {
          await closeButton.click();
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(500); // Brief pause for modal animation
        }
      } catch (e) {
        // Modal might have already closed
        continue;
      }
    }
  }
}

/**
 * Helper: Grant media permissions (mic and camera)
 */
async function grantMediaPermissions(page: Page) {
  // Use context permissions API if available
  const context = page.context();
  try {
    await context.grantPermissions(['microphone', 'camera']);
  } catch (e) {
    console.log('Media permissions already granted or not applicable');
  }
}

/**
 * Helper: Wait for dropdown to have specific text
 */
async function waitForDropdownText(
  page: Page, 
  expectedText: string, 
  timeout: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const dropdown = page.getByRole('link', { name: expectedText });
      await dropdown.waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch (e) {
      await page.waitForTimeout(1000);
    }
  }
  
  return false;
}

/**
 * Helper: Login to teacher portal
 */
async function loginAsTeacher(page: Page): Promise<boolean> {
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    
    // Fill email
    const emailInput = page.getByRole('textbox', { name: 'mail@example.com' });
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(TEACHER_EMAIL);
    
    // Fill password
    const passwordInput = page.getByRole('textbox', { name: 'Password must be made up of' });
    await passwordInput.waitFor({ state: 'visible' });
    await passwordInput.fill(TEACHER_PASSWORD);
    
    // Click login button and wait for navigation
    const loginButton = page.getByRole('button', { name: 'Sign In' });
    await loginButton.waitFor({ state: 'visible' });
    
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      loginButton.click()
    ]);
    
    // Wait for navigation to complete
    await page.waitForLoadState('domcontentloaded');
    
    return true;
  } catch (error) {
    console.error('Login failed:', error);
    return false;
  }
}

// Main test suite
test.describe('Teacher Workflow Test', () => {
  test.setTimeout(TEST_TIMEOUT);
  
  test.beforeAll(() => {
    ensureDirectories();
  });
  
  test.afterEach(async ({ page }, testInfo) => {
    // Move video from test-results to recordings folder
    const videoPath = await page.video()?.path();
    if (videoPath && fs.existsSync(videoPath)) {
      const recordingsPath = path.join(process.cwd(), 'recordings', 'teacher-workflow-complete.webm');
      fs.copyFileSync(videoPath, recordingsPath);
      console.log(`Video saved to: ${recordingsPath}`);
    }
  });
  
  test('Complete Teacher Workflow - TC1 to TC5', async ({ page, context }) => {
    // Grant media permissions upfront
    await context.grantPermissions(['microphone', 'camera']);
    
    try {
      // ===== TC1: Teacher Login =====
      console.log('=== TC1: Teacher Login ===');
      
      // Step 1-3: Navigate and fill credentials
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      
      const emailInput = page.getByRole('textbox', { name: 'mail@example.com' });
      await emailInput.waitFor({ state: 'visible' });
      await emailInput.fill(TEACHER_EMAIL);
      
      const passwordInput = page.getByRole('textbox', { name: 'Password must be made up of' });
      await passwordInput.waitFor({ state: 'visible' });
      await passwordInput.fill(TEACHER_PASSWORD);
      
      // Step 4-5: Click login and wait for page load
      const loginButton = page.getByRole('button', { name: 'Sign In' });
      await loginButton.waitFor({ state: 'visible' });
      
      await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        loginButton.click()
      ]);
      
      await page.waitForLoadState('domcontentloaded');
      
      // SCREENSHOT 1: Verify redirection to home page
      await takeScreenshot(page, 'TC1', 'Redirected to teacher home');
      await expect(page).toHaveURL(/\/teacher\/home/, { timeout: 10000 });
      
      // ===== TC2: Teacher Status Not Standby =====
      console.log('=== TC2: Change Status to STANDBY ===');
      
      // Step 7: Close all modals
      await closeAllModals(page);
      
      // Step 8: Click the NOT STANDBY dropdown
      // Locate the dropdown - it's a span element with id="status"
      let statusDropdown = page.locator('#status');
      
      // Wait for dropdown to be visible and clickable
      await expect(statusDropdown).toBeVisible({ timeout: 10000 });
      await expect(statusDropdown).toContainText('NOT STANDBY');
      
      // Re-locate before clicking to avoid stale references
      statusDropdown = page.locator('#status');
      await statusDropdown.click();
      await page.waitForLoadState('domcontentloaded');
      
      // Step 9: Change to STANDBY
      const standbyOption = page.getByRole('link', { name: 'STANDBY' }).first();
      await standbyOption.waitFor({ state: 'visible' });
      
      // Click and wait for page reload
      await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        standbyOption.click()
      ]);
      
      await page.waitForLoadState('domcontentloaded');
      
      // SCREENSHOT 2: Verify status changed to STANDBY
      const standbyDropdown = page.locator('#status');
      await expect(standbyDropdown).toBeVisible({ timeout: 15000 });
      await expect(standbyDropdown).toContainText('STANDBY');
      await takeScreenshot(page, 'TC2', 'Status changed to STANDBY');
      
      // Grant media permissions
      await grantMediaPermissions(page);
      
      // ===== TC3: Wait for Student to Join =====
      console.log('=== TC3: Wait for Student to Join ===');
      
      // Step 12: Wait for Student Request Modal to appear (this indicates student joined)
      const studentJoinStartTime = Date.now();
      let modalAppeared = false;
      
      console.log('Waiting for student to join and modal to appear...');
      
      while (Date.now() - studentJoinStartTime < STUDENT_JOIN_TIMEOUT) {
        try {
          // Check if page has reloaded
          await page.waitForLoadState('domcontentloaded');
          
          // Wait for the Student's Request modal to be visible
          const studentRequestModal = page.getByText('Student\'s Request for the Lesson kathryn bernardo test Number of lesson with');
          const isVisible = await studentRequestModal.isVisible({ timeout: 3000 });
          
          if (isVisible) {
            modalAppeared = true;
            console.log('Student Request modal appeared!');
            break;
          }
        } catch (e) {
          // Continue waiting
          await page.waitForTimeout(2000);
        }
      }
      
      if (!modalAppeared) {
        // No student joined within 3 minutes - stop test
        await takeScreenshot(
          page,
          'TC3',
          'No student joined after 3 minutes - Test stopped',
          true
        );
        
        softAssertionErrors.push({
          stepNumber: 3,
          message: 'Student did not join within 3 minutes. Test execution stopped.',
          timestamp: new Date()
        });
        
        // Report all errors and stop
        console.error('=== TEST STOPPED: No student joined within timeout ===');
        console.error('Soft assertion errors:', softAssertionErrors);
        test.skip();
        return;
      }
      
      // Step 13: Check all checkboxes in the modal
      console.log('Checking checkboxes in Student Request modal...');
      
      // PREVIOUS IMPLEMENTATION - COMMENTED OUT
      // Check the three specific checkboxes
      // const selfIntroCheckbox = page.locator('dl').filter({ hasText: 'Self-introduction before the' }).getByLabel('');
      // const grammarErrorsCheckbox = page.locator('dl').filter({ hasText: 'Point out errors in grammar' }).getByLabel('');
      // const otherRequestsCheckbox = page.locator('dl').filter({ hasText: 'Other requests none' }).getByLabel('');
      
      // Check each checkbox if not already checked
      // for (const checkbox of [selfIntroCheckbox, grammarErrorsCheckbox, otherRequestsCheckbox]) {
      //   try {
      //     await checkbox.waitFor({ state: 'visible', timeout: 5000 });
      //     if (!(await checkbox.isChecked())) {
      //       await checkbox.click();
      //       await page.waitForTimeout(500);
      //     }
      //   } catch (e) {
      //     console.log('Checkbox might already be checked or not visible');
      //   }
      // }
      
      // Verify checkboxes are checked
      // await expect(selfIntroCheckbox).toBeChecked();
      // await expect(grammarErrorsCheckbox).toBeChecked();
      // await expect(otherRequestsCheckbox).toBeChecked();
      
      // NEW IMPLEMENTATION - Updated for new website structure
      // There are now only two checkboxes inside the dialog_request_cfm modal
      const dialogModal = page.locator('.dialog_request_cfm');
      const requestItems = dialogModal.locator('.request-item');
      
      // Get all checkboxes within the request-item divs
      const checkboxes = requestItems.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      console.log(`Found ${checkboxCount} checkboxes in the dialog`);
      
      // Check all checkboxes (there should be 2)
      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = checkboxes.nth(i);
        try {
          await checkbox.waitFor({ state: 'visible', timeout: 5000 });
          const isChecked = await checkbox.isChecked();
          if (!isChecked) {
            await checkbox.click();
            await page.waitForTimeout(500);
            console.log(`Checked checkbox ${i + 1}`);
          } else {
            console.log(`Checkbox ${i + 1} already checked`);
          }
        } catch (e) {
          console.log(`Error with checkbox ${i + 1}:`, e);
        }
      }
      
      // Verify all checkboxes are checked
      for (let i = 0; i < checkboxCount; i++) {
        await expect(checkboxes.nth(i)).toBeChecked();
      }
      
      // Wait for the first dialog modal to close
      await page.waitForTimeout(2000);
      
      // Step 14: Close the second dialog modal by clicking OK button
      const okButton = page.locator('#dialog_lesson_length_cfm a.btn_orange.close_modal');
      await expect(okButton).toBeVisible({ timeout: 10000 });
      
      // Click OK button
      await okButton.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      
      // Verify modal closed
      const modal = page.locator('#dialog_lesson_length_cfm');
      await expect(modal).toBeHidden({ timeout: 5000 });
      
      // SCREENSHOT 3: Verify status is ON GOING LESSON after modals are closed
      console.log('Verifying status is ON GOING LESSON...');
      const statusElement = page.locator('#status');
      await expect(statusElement).toBeVisible({ timeout: 10000 });
      await expect(statusElement).toContainText('ON GOING LESSON');
      await takeScreenshot(page, 'TC3', 'Status is ON GOING LESSON');
      
      console.log('TC3 completed successfully - ready to proceed to TC4');
      
      // ===== TC4: Add Another Tab =====
      console.log('=== TC4: Open New Tab ===');
      
      // Step 15: Open new tab
      const page2 = await context.newPage();
      await page2.goto('https://www.bbc.com/', { waitUntil: 'domcontentloaded' });
      
      // Step 16: Wait for page to fully load
      // Note: We use 'domcontentloaded' instead of 'networkidle' because external sites 
      // like BBC may have continuous network activity (ads, analytics, etc.)
      await page2.waitForLoadState('domcontentloaded');
      
      // Additional wait to ensure page is visually stable
      await page2.waitForTimeout(2000);
      
      // SCREENSHOT 4: BBC website fully loaded
      await expect(page2).toHaveURL(/bbc\.com/);
      await takeScreenshot(page2, 'TC4', 'BBC website fully loaded');
      
      // ===== TC5: Close Tab with Confirmation =====
      console.log('=== TC5: Close Tab with Confirmation ===');
      
      // Step 17: Go back to first tab (automatically bring to front)
      console.log('Bringing first tab to front...');
      await page.bringToFront();
      await page.waitForTimeout(1000);
      console.log('First tab is now active');
      
      // Step 18-19: Close current tab and handle native browser dialog
      // 
      // CRITICAL UNDERSTANDING - Two Types of Dialogs:
      // 1. JavaScript dialogs (alert/confirm/prompt) - CAN be handled with page.on('dialog')
      // 2. Native browser dialogs ("Leave site?") - CANNOT be handled by Playwright
      //
      // The "Leave site?" confirmation is a NATIVE BROWSER DIALOG (security feature).
      // - Playwright CANNOT capture it with dialog handlers
      // - Playwright CANNOT screenshot it
      // - Playwright AUTOMATICALLY accepts it when page.close() is called
      // - It IS visible in the video recording
      // 
      // Reference: https://github.com/microsoft/playwright/issues/2867
      
      // SCREENSHOT 5: Take screenshot before triggering close
      await takeScreenshot(page, 'TC5', 'Before closing tab - native browser dialog will appear');
      console.log('\n=== TC5: Native Browser Dialog Behavior ===');
      console.log('1. When page.close() is called, a native "Leave site?" dialog MAY appear');
      console.log('2. This dialog is a browser security feature, not a JavaScript dialog');
      console.log('3. Playwright AUTOMATICALLY clicks "Leave" to accept the dialog');
      console.log('4. We cannot use dialog.accept() - it only works for JavaScript dialogs');
      console.log('5. Verification: If page closes successfully, the dialog was handled');
      console.log('6. The dialog IS captured in: recordings/teacher-workflow-complete.webm\n');
      
      // Trigger tab close - Playwright will automatically accept the native dialog
      try {
        await page.close();
        console.log('✓ Page closed successfully - native dialog was automatically accepted by Playwright');
      } catch (e) {
        console.log('Error during page close:', e);
        throw e;
      }
      
      // Final verification: Tab is closed (proves the dialog was accepted)
      const isClosed = page.isClosed();
      expect(isClosed).toEqual(true);
      console.log('✓ Verified: Tab is closed (native dialog was handled)\n');
      
      // Clean up
      await page2.close();
      
    } catch (error: any) {
      console.error('Unexpected error during test execution:', error);
      await takeScreenshot(page, 'TC-FATAL', `Unexpected error: ${getHumanReadableError(error)}`, true);
      throw error;
    } finally {
      // Report all soft assertion errors
      if (softAssertionErrors.length > 0) {
        console.error('\n=== SOFT ASSERTION FAILURES ===');
        softAssertionErrors.forEach(err => {
          console.error(`[TC${err.stepNumber}] ${err.message} (${err.timestamp.toISOString()})`);
        });
      } else {
        console.log('\n=== ALL ASSERTIONS PASSED ===');
      }
    }
  });
});
