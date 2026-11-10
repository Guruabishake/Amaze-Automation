import { TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { EVIDENCE_DIR, log } from './screenshot';

export type DefectClassification = 'application defect' | 'automation issue' | 'invalid test data' | 'environment issue';

export interface Defect {
  id: string;
  module: string;
  screen: string;
  fieldOrAction: string;
  input: string;
  expected: string;
  actual: string;
  evidence: string;
  url: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  reproducibility: string;
  classification: DefectClassification;
  error?: string;
}

const defects: Defect[] = [];

/** Records a defect, keeps reports/evidence/<run>/defects.json current, and attaches it to the HTML report. */
export async function recordDefect(testInfo: TestInfo, defect: Omit<Defect, 'id'>): Promise<Defect> {
  const entry: Defect = { id: `DIVYA-S3-${String(defects.length + 1).padStart(3, '0')}`, ...defect };
  defects.push(entry);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'defects.json'), JSON.stringify(defects, null, 2));
  log(`DEFECT ${entry.id} [${entry.classification}] ${entry.screen} / ${entry.fieldOrAction}: ${entry.actual}`);
  await testInfo.attach(`defect-${entry.id}`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' });
  return entry;
}

export function allDefects(): Defect[] {
  return [...defects];
}
