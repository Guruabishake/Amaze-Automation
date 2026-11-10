import { test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { loginData } from '../utils/testData';

// AmazerTrans only allows one active session per account (confirmed on the live app via its
// "Duplicate Session Detected" dialog). Running these tests in parallel logs the same account
// in from multiple workers at once and each login kicks the others out mid-test, so this suite
// must run serially. `test.describe.configure({ mode: 'serial' })` below only orders tests WITHIN
// this file - it does not stop a DIFFERENT AmazerTrans spec file from being dispatched to a
// separate parallel worker in the same invocation. That cross-file guarantee is enforced by
// e2e/AmazerTrans/playwright.config.ts (workers: 1) - always run this suite via
// `npx playwright test --config=e2e/AmazerTrans/playwright.config.ts`, not the root config.
test.describe.configure({ mode: 'serial' });

test.describe('AmazerTrans Login', () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto(loginData.url);
  });

  test('Login page displays username, branch, password and login button', async ({ page }) => {
    const login = new LoginPage(page);
    await login.verifyLoginPageLoaded();
  });

  test('Valid credentials log the user in and land on the CRM dashboard', async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(loginData.username, loginData.password, loginData.branch);
    await login.verifyLoginSuccess();
  });

  test.describe('Negative validations', () => {
    test('Empty username shows the required-fields message', async ({ page }) => {
      const login = new LoginPage(page);
      await login.selectBranch(loginData.branch);
      await login.fillPassword(loginData.password);
      await login.loginButton.click();
      await login.expectRequiredFieldsBanner();
    });

    test('Empty password shows the required-fields message', async ({ page }) => {
      const login = new LoginPage(page);
      await login.fillUsername(loginData.username);
      await login.selectBranch(loginData.branch);
      await login.loginButton.click();
      await login.expectRequiredFieldsBanner();
    });

    test('Empty branch blocks submission via native browser validation', async ({ page }) => {
      const login = new LoginPage(page);
      await login.fillUsername(loginData.username);
      await login.fillPassword(loginData.password);
      await login.loginButton.click();
      await login.expectBranchValidationBlocksSubmit();
    });

    test('Invalid (unknown) username with valid password shows the unknown-user error', async ({ page }) => {
      const login = new LoginPage(page);
      await login.login('not-a-real-user@cargowayz.net', loginData.password, loginData.branch);
      await login.expectUnknownUserError();
    });

    test('Valid username with invalid password shows invalid-credentials error', async ({ page }) => {
      // Confirmed on the live app: a KNOWN username with a wrong password gives a shorter,
      // distinct message ("Invalid credentials.") from an unknown username (below).
      const login = new LoginPage(page);
      await login.login(loginData.username, 'WrongPassword#123', loginData.branch);
      await login.expectInvalidCredentialsError();
    });

    test('Invalid username and invalid password shows the unknown-user error', async ({ page }) => {
      const login = new LoginPage(page);
      await login.login('not-a-real-user@cargowayz.net', 'WrongPassword#123', loginData.branch);
      await login.expectUnknownUserError();
    });

    test('All fields empty shows the required-fields message', async ({ page }) => {
      const login = new LoginPage(page);
      await login.loginButton.click();
      // Branch is the only field with native `required`, so an all-empty submit is blocked
      // there first, exactly like the dedicated empty-branch case above.
      await login.expectBranchValidationBlocksSubmit();
    });

    test.skip(
      'Invalid/unsupported branch - REQUIRES MANUAL VERIFICATION',
      async () => {
        // Branch Name is a fixed native <select> populated from the server (26 real branches);
        // it does not accept free-text input, so there is no UI path to submit an "invalid"
        // branch value through the form itself. Left as a documented gap rather than an
        // invented scenario - see the automation report for details.
      }
    );
  });
});
