/**
 * Generic multi-user execution types - deliberately free of any AmazerTrans-specific field or
 * assumption. Any Playwright suite in this repo can define its own users.config.json matching
 * this shape and reuse buildUserProjects()/userAccountFixture() from this same folder.
 */

/**
 * "edge" is not a separate Playwright browser engine - it is Chromium launched with
 * `channel: 'msedge'` (Playwright's own documented mechanism, see buildUserProjects.ts). Listed
 * here as its own option purely so a users.config.json entry can say `"browser": "edge"` directly,
 * matching how a non-developer QA tester actually thinks about browser choice.
 */
export type SupportedBrowser = 'chromium' | 'firefox' | 'webkit' | 'edge';

/**
 * One entry in a users.config.json file. `usernameEnv`/`passwordEnv` are the NAMES of environment
 * variables to read the real credentials from (never the raw username/password) - this file is
 * meant to be committed (it holds no secrets), while the actual values stay in the existing
 * gitignored .env, exactly like every other credential in this repo already works.
 */
export interface UserConfigEntry {
  id: string;
  label: string;
  enabled: boolean;
  usernameEnv: string;
  passwordEnv: string;
  /** Non-secret - safe to store directly in the committed config file. */
  branch?: string;
  /** A key into the config file's own `environments` map (below), e.g. "staging". */
  environment?: string;
  browser?: SupportedBrowser;
  /** Overrides which spec file(s) this user's generated project runs, e.g. "pricing.spec.ts". Falls back to the config's own `defaultTestMatch`. */
  testMatch?: string;
}

export interface UsersConfigFile {
  /** Suggested worker count for "run all enabled users" - informational only; never silently overrides a suite's own protective `workers` default. See scripts/run-multiuser.js. */
  recommendedWorkers?: number;
  /** Named base URLs a user's `environment` field can select between, e.g. { "staging": "https://..." }. */
  environments?: Record<string, string>;
  /** Which spec file (relative to the Playwright config's testDir) a user's project runs, unless the user overrides it with its own `testMatch`. */
  defaultTestMatch: string;
  users: UserConfigEntry[];
}

/** Resolved, ready-to-use account - what the `userAccount` fixture actually hands to a test. Never includes raw env var names, only resolved values. */
export interface ResolvedUserAccount {
  id: string;
  label: string;
  username: string;
  password: string;
  branch: string;
  environment: string;
  baseUrl: string;
  browser: SupportedBrowser;
}
