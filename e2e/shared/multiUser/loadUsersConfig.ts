import * as fs from 'fs';
import { ResolvedUserAccount, UserConfigEntry, UsersConfigFile } from './types';

const DEFAULT_BASE_URL_KEY = 'default';

/**
 * Reads a users.config.json file (see types.ts's UsersConfigFile) and resolves each entry's real
 * credentials from the env vars it names. Never throws for a missing/blank credential - an
 * unresolved user still gets a `ResolvedUserAccount` (with empty username/password) so
 * `--list`/disabled projects are unaffected; a spec that actually tries to log in with it is
 * expected to check and fail loudly itself (see userAccountFixture.ts's usage pattern).
 */
export function loadUsersConfig(configPath: string): UsersConfigFile {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as UsersConfigFile;
  if (!Array.isArray(parsed.users)) {
    throw new Error(`${configPath}: "users" must be an array.`);
  }
  return parsed;
}

function resolveBaseUrl(config: UsersConfigFile, entry: UserConfigEntry, fallbackBaseUrl: string): string {
  const key = entry.environment || DEFAULT_BASE_URL_KEY;
  return config.environments?.[key] || fallbackBaseUrl;
}

/**
 * Resolves ONE config entry into a ready-to-use account. `fallbackBaseUrl` is the suite's own
 * existing default base URL (e.g. AmazerTrans's AMAZERTRANS_URL) - used whenever the entry's
 * `environment` key isn't found in the config's own `environments` map, so a suite that has never
 * configured multiple environments keeps working with zero extra setup.
 */
export function resolveUserAccount(config: UsersConfigFile, entry: UserConfigEntry, fallbackBaseUrl: string): ResolvedUserAccount {
  return {
    id: entry.id,
    label: entry.label,
    username: process.env[entry.usernameEnv] || '',
    password: process.env[entry.passwordEnv] || '',
    branch: entry.branch || '',
    environment: entry.environment || DEFAULT_BASE_URL_KEY,
    baseUrl: resolveBaseUrl(config, entry, fallbackBaseUrl),
    browser: entry.browser || 'chromium',
  };
}

/** Every ENABLED entry, resolved - the list buildUserProjects() turns into Playwright projects. Disabled entries are dropped entirely, so they never get a project (Scenario 4: disabling a user means it simply cannot run, not "runs but skipped"). */
export function resolveEnabledUserAccounts(config: UsersConfigFile, fallbackBaseUrl: string): ResolvedUserAccount[] {
  return config.users.filter((u) => u.enabled).map((u) => resolveUserAccount(config, u, fallbackBaseUrl));
}
