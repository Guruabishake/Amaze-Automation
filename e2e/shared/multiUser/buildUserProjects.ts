import { devices, Project } from '@playwright/test';
import { ResolvedUserAccount, SupportedBrowser, UserConfigEntry, UsersConfigFile } from './types';
import { resolveEnabledUserAccounts } from './loadUsersConfig';

const DEVICE_BY_BROWSER: Record<SupportedBrowser, string> = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
  edge: 'Desktop Edge',
};

/**
 * Edge is not a separate Playwright browser engine - `devices['Desktop Edge']` only supplies a
 * matching user agent/viewport and `defaultBrowserType: 'chromium'`; the actual installed Edge
 * binary is only used once `channel: 'msedge'` is set explicitly (Playwright's own documented
 * mechanism: https://playwright.dev/docs/browsers#google-chrome--microsoft-edge). Every other
 * supported browser leaves `channel` unset, launching Playwright's own bundled build as usual.
 */
function channelFor(browser: SupportedBrowser): { channel?: string } {
  return browser === 'edge' ? { channel: 'msedge' } : {};
}

/**
 * Builds exactly one Playwright project per ENABLED user - never a fixed count. 1 enabled user ->
 * 1 project, 10 enabled users -> 10 projects; disabling a user removes its project entirely
 * (nothing to run, not "runs but gets skipped"). Each project's own `use.userAccount` is what the
 * generic `userAccount` fixture (userAccountFixture.ts) resolves per test - this is Playwright's
 * own documented "parameterized projects" pattern, so the SAME spec file runs unmodified under
 * every generated project. `testMatch` is narrowed per user to whichever spec(s) that user's
 * entry (or the config's own `defaultTestMatch`) names, so a project for one suite's users can
 * never accidentally sweep in an unrelated, non-multi-user-aware spec file and silently reuse the
 * wrong account (see e2e/AmazerTrans/playwright.config.ts's own comment for a concrete example of
 * why that matters).
 *
 * `userAccountOptionKey` lets a config-typed `defineConfig<{ userAccount: T }>` project's `use`
 * carry whatever field name that suite's fixture actually declared - kept as a plain string key
 * rather than a literal type so this file has no dependency on any one suite's fixture shape.
 */
export function buildUserProjects(
  config: UsersConfigFile,
  fallbackBaseUrl: string,
  userAccountOptionKey: string = 'userAccount'
): Project[] {
  const accounts = resolveEnabledUserAccounts(config, fallbackBaseUrl);
  const entryById = new Map(config.users.map((u): [string, UserConfigEntry] => [u.id, u]));

  return accounts.map((account): Project => {
    const entry = entryById.get(account.id);
    const testMatchPattern = entry?.testMatch || config.defaultTestMatch;
    return {
      name: account.id,
      testMatch: new RegExp(testMatchPattern.replace(/\./g, '\\.')),
      use: {
        ...devices[DEVICE_BY_BROWSER[account.browser]],
        ...channelFor(account.browser),
        [userAccountOptionKey]: account,
      },
    };
  });
}
