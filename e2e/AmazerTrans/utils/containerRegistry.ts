import * as fs from 'fs';
import * as path from 'path';

/**
 * Persists every Container Number this suite has ever generated, and which Combined Job each one
 * belongs to - across process runs, not just in memory. A future test execution needs to be able
 * to tell "has this number been used before" and "what containers belong to Combined Job X"
 * without depending on the current Playwright process still being alive, so this is a plain JSON
 * file next to the rest of this project's own config (`users.config.json`), not an in-memory Set.
 *
 * The application itself is still the preferred source of truth for "what containers does
 * Combined Job X actually have right now" - see `CombinedJobPage.getContainersByCombinedJob`,
 * which reads the live Container Information table. This file's `byCombinedJob` map is a fallback
 * for when no live page/session is available, and its flat `generatedContainerNumbers` list is
 * what `generateUniqueContainerNumbers` checks against so it never reissues a number this suite
 * has already used, even from a run whose Playwright process has long since exited.
 */
const REGISTRY_PATH = path.resolve(__dirname, '..', 'config', 'containerRegistry.json');

interface ContainerRegistry {
  generatedContainerNumbers: string[];
  byCombinedJob: Record<string, string[]>;
}

function loadRegistry(): ContainerRegistry {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { generatedContainerNumbers: [], byCombinedJob: {} };
  }
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return {
    generatedContainerNumbers: Array.isArray(parsed.generatedContainerNumbers) ? parsed.generatedContainerNumbers : [],
    byCombinedJob: typeof parsed.byCombinedJob === 'object' && parsed.byCombinedJob ? parsed.byCombinedJob : {},
  };
}

function saveRegistry(registry: ContainerRegistry): void {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

const CONTAINER_NUMBER_PATTERN = /^[A-Z]{4}[0-9]{7}$/;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates `count` Container Numbers matching `^[A-Z]{4}[0-9]{7}$`, guaranteed not to collide with
 * any number this suite has EVER generated before (read from the persisted registry, not just this
 * process's own memory) or with each other within this same call. The numeric part is
 * timestamp-derived (same convention `testData.ts`'s own `uniqueDigits` already uses for
 * Customer/Vendor phone numbers) plus a per-call index, so a real collision against genuine
 * pre-existing application data is not realistically reachable either. Reserves the returned
 * numbers in the registry immediately, before the caller has even used them, so a second call
 * later in the same run can never double-issue one.
 */
export function generateUniqueContainerNumbers(count: number): string[] {
  const registry = loadRegistry();
  const used = new Set(registry.generatedContainerNumbers);
  const generated: string[] = [];

  for (let i = 0; i < count; i++) {
    let candidate: string;
    let attempt = 0;
    do {
      const letters = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
      const digits = ((Date.now() * 1000 + (generated.length + attempt) * 97) % 10_000_000).toString().padStart(7, '0');
      candidate = `${letters}${digits}`;
      attempt++;
    } while (used.has(candidate));
    used.add(candidate);
    generated.push(candidate);
  }

  registry.generatedContainerNumbers.push(...generated);
  saveRegistry(registry);

  for (const number of generated) {
    if (!CONTAINER_NUMBER_PATTERN.test(number)) {
      throw new Error(`Generated container number "${number}" does not match ^[A-Z]{4}[0-9]{7}$`);
    }
  }
  return generated;
}

/** Records which Container Numbers belong to a given Combined Job, so `getPersistedContainersByCombinedJob` (and future test runs) can look them up later without a live session. */
export function recordContainersForCombinedJob(combinedJobNumber: string, containerNumbers: string[]): void {
  const registry = loadRegistry();
  const existing = registry.byCombinedJob[combinedJobNumber] ?? [];
  registry.byCombinedJob[combinedJobNumber] = Array.from(new Set([...existing, ...containerNumbers]));
  saveRegistry(registry);
}

/** Fallback lookup when no live page/session is available - prefer `CombinedJobPage.getContainersByCombinedJob` (reads the live application) whenever a `page` is on hand. */
export function getPersistedContainersByCombinedJob(combinedJobNumber: string): string[] {
  return loadRegistry().byCombinedJob[combinedJobNumber] ?? [];
}
