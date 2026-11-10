import { Page, Locator, expect } from '@playwright/test';

/**
 * Login page for AmazerTrans (staging-fc.cargowayz.net/login/AMAZERTRANS).
 *
 * The username/password inputs have visible <label> text but it is NOT
 * associated to the <input> via for/id or aria-labelledby (verified against
 * the live DOM), so getByLabel() cannot locate them - hence the type-based
 * CSS locators below, which is the only stable option here. Branch is a real
 * native <select>, so it uses getByRole('combobox') + selectOption normally.
 */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly branchDropdown: Locator;
  readonly loginButton: Locator;
  readonly forceLoginButton: Locator;
  readonly welcomeHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('input[type="text"]').first();
    this.passwordInput = page.locator('input[type="password"]');
    this.branchDropdown = page.getByRole('combobox');
    this.loginButton = page.getByRole('button', { name: 'Login', exact: true });
    this.forceLoginButton = page.getByRole('button', { name: 'Yes, Force Login' });
    this.welcomeHeading = page.getByText('Welcome to', { exact: false });
  }

  async goto(url: string) {
    await this.page.goto(url);
  }

  /** Verifies the login page and its key elements are visible before any interaction. */
  async verifyLoginPageLoaded() {
    await expect(this.welcomeHeading).toBeVisible();
    await expect(this.usernameInput).toBeVisible();
    await expect(this.branchDropdown).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
    // A native <select>'s innerText includes every <option>, so assert the unselected state via value instead.
    await expect(this.branchDropdown).toHaveValue('');
  }

  async fillUsername(username: string) {
    await this.usernameInput.fill(username);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async selectBranch(branch: string) {
    await this.branchDropdown.selectOption({ label: branch });
  }

  /** Full login flow, including the "Duplicate Session Detected" dialog the app shows on a second concurrent login. */
  async login(username: string, password: string, branch: string) {
    await this.fillUsername(username);
    await this.selectBranch(branch);
    await this.fillPassword(password);
    await this.loginButton.click();
    await this.handleDuplicateSessionIfPresent();
  }

  /** The app blocks a second concurrent session with a confirmation modal; force it through for automation. */
  async handleDuplicateSessionIfPresent() {
    // Locator.isVisible() checks the DOM synchronously with no auto-wait, so it misses a modal
    // that renders a moment after the login API responds - waitFor() actually waits for it.
    try {
      await this.forceLoginButton.waitFor({ state: 'visible', timeout: 6000 });
      await this.forceLoginButton.click();
    } catch {
      // No duplicate-session dialog appeared - proceed normally.
    }
  }

  async verifyLoginSuccess() {
    await expect(this.page.getByRole('heading', { name: 'CRM Dashboard' })).toBeVisible({ timeout: 15000 });
    await expect(this.page).toHaveURL(/\/crm\/crmDashboard/);
    await expect(this.page.getByRole('button', { name: 'Logout' })).toBeVisible();
  }

  /** Real app text shown when username, password or branch is missing (identical message regardless of which one is missing). */
  async expectRequiredFieldsBanner() {
    await expect(this.page.getByText('Email, password, and branch_id are required.')).toBeVisible();
  }

  /** Real app text shown for a correct/known username with the wrong password. */
  async expectInvalidCredentialsError() {
    await expect(this.page.getByText('Invalid credentials.', { exact: true })).toBeVisible();
  }

  /** Real app text shown when the username itself does not resolve to a known account (different from a wrong password on a known one). */
  async expectUnknownUserError() {
    await expect(this.page.getByText('Invalid credentials or inactive user.')).toBeVisible();
  }

  /** Branch is the only field with native HTML5 `required`; verifies the browser blocks submission. */
  async expectBranchValidationBlocksSubmit() {
    const isValid = await this.branchDropdown.evaluate((el: HTMLSelectElement) => el.checkValidity());
    const message = await this.branchDropdown.evaluate((el: HTMLSelectElement) => el.validationMessage);
    expect(isValid).toBe(false);
    expect(message).toBe('Please select an item in the list.');
    // Native validation prevents the form submit handler from running at all.
    await expect(this.page).toHaveURL(/\/login\/AMAZERTRANS/);
  }
}
