/**
 * Thin redirect - Playwright only ever looks for a config file in the EXACT current working
 * directory, never a parent (confirmed live, twice, in this repo). A terminal that happens to be
 * sitting in this folder (e.g. an editor's integrated terminal opened at pricing.spec.ts) would
 * otherwise find no config at all here and silently fall back to Playwright's own empty default
 * project, producing the exact `Available projects: ""` error this file exists to prevent.
 *
 * Every setting (testDir, users.config.json path, outputDir, projects, etc.) still lives in and
 * is computed by the real config at ../playwright.config.ts - this file only re-exports it, so
 * there is exactly one source of truth to maintain.
 */
export { default } from '../playwright.config';
