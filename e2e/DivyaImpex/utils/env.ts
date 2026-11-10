import * as dotenv from 'dotenv';
import * as path from 'path';

// DivyaImpex keeps its own .env next to its own config (e2e/DivyaImpex/.env, gitignored by the
// repo-wide ".env" rule) so it never reads or depends on AmazerTrans's root .env. Anchored to this
// file's location so the command works from any working directory.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy e2e/DivyaImpex/.env.example to e2e/DivyaImpex/.env and fill it in.`
    );
  }
  return value;
}

export const env = {
  baseUrl: required('DIVYAIMPEX_URL'),
  username: required('DIVYAIMPEX_USERNAME'),
  password: required('DIVYAIMPEX_PASSWORD'),
  branch: required('DIVYAIMPEX_BRANCH'),
  cargoCount: Number(process.env.DIVYAIMPEX_CARGO_COUNT) || 10,
  // Optional fixed Reference Invoice No for Generate Job; a unique per-run value is generated when unset.
  referenceInvoiceNo: process.env.DIVYAIMPEX_REFERENCE_INVOICE_NO || '',
};
