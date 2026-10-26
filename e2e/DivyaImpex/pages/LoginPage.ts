import { Page, Locator, expect } from '@playwright/test';

/**
 * DivyaImpex login (staging-fc.cargowayz.net/login/DIVYAIMPEX). Same login widget as AmazerTrans:
 * unassociated labels (so type-based input locators), a native <select> for Branch, and a
 * "Duplicate Session Detected" modal when the account already has an active session.
 */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly branchDropdown: Locator;
  readonly loginButton: Locator;
  readonly forceLoginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('input[type="text"]').first();
    this.passwordInput = page.locator('input[type="password"]');
    this.branchDropdown = page.getByRole('combobox');
    this.loginButton = page.getByRole('button', { name: 'Login', exact: true });
    this.forceLoginButton = page.getByRole('button', { name: 'Yes, Force Login' });
  }

  async goto(url: string) {
    await this.page.goto(url);
    await expect(this.loginButton).toBeVisible();
  }

  async availableBranches(): Promise<string[]> {
    return (await this.branchDropdown.locator('option').allInnerTexts()).map((b) => b.trim());
  }

  async login(username: string, password: string, branch: string) {
    await this.usernameInput.fill(username);
    await this.branchDropdown.selectOption({ label: branch });
    await expect(this.branchDropdown.locator('option:checked')).toHaveText(branch);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    try {
      await this.forceLoginButton.waitFor({ state: 'visible', timeout: 6000 });
      await this.forceLoginButton.click();
    } catch {
      // No duplicate-session dialog - normal path.
    }
  }

  /** Login is verified by the CRM Dashboard landing page AND the branch the app actually stored for the session. */
  async verifyLoginSuccess(expectedBranch: string) {
    await expect(this.page.getByRole('heading', { name: 'CRM Dashboard' })).toBeVisible({ timeout: 30000 });
    await expect(this.page).toHaveURL(/\/crm\/crmDashboard/);
    await expect(this.page.getByRole('button', { name: 'Logout' })).toBeVisible();
    const storedBranch = await this.page.evaluate(() => {
      try {
        const data = JSON.parse(localStorage.getItem('data') || '{}');
        return data?.branch?.branch_name ?? null;
      } catch {
        return null;
      }
    });
    if (storedBranch !== null) {
      expect(storedBranch, 'Active session branch').toBe(expectedBranch);
    }
  }
}
