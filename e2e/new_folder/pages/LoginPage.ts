import { Page } from '@playwright/test';
import { loginData } from '../utils/testData';

export class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto(loginData.url);
  }

  async login(username: string, password: string, branch: string = loginData.branch) {
    await this.page.fill('input[type="text"]', username);
    await this.page.fill('input[type="password"]', password);
    await this.page.getByRole('combobox').selectOption(branch);
    await this.page.click('button:has-text("Login")');
  }
}

