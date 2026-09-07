// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

import { syncLeadsFromAirtable } from '../lib/sync-leads';

async function main() {
  console.log('Starting Airtable → Supabase leads import...');
  const { count, errors } = await syncLeadsFromAirtable();
  console.log(`\nDone! Imported: ${count}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
