#!/usr/bin/env node
// Print the private waitlist as CSV. Needs BLOB_READ_WRITE_TOKEN, e.g. from
// `vercel env pull .env.local`, then: npm run waitlist > waitlist.csv
import { readFileSync } from 'node:fs';
import { get, list } from '@vercel/blob';

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  try {
    const token = readFileSync('.env.local', 'utf8').match(/^BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?$/m)?.[1];
    if (token) process.env.BLOB_READ_WRITE_TOKEN = token;
  } catch { /* Fall through to the message below. */ }
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Set BLOB_READ_WRITE_TOKEN or run `vercel env pull .env.local` first.');
  process.exit(1);
}

const rows = [];
let cursor;
do {
  const page = await list({ prefix: 'waitlist/', cursor, limit: 1000 });
  for (const blob of page.blobs) {
    const result = await get(blob.pathname, { access: 'private' });
    if (result?.stream) rows.push(JSON.parse(await new Response(result.stream).text()));
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

rows.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
const cell = (value) => `"${String(value).replaceAll('"', '""')}"`;
console.log('joined_at,email,interest');
for (const row of rows) console.log([row.joinedAt, row.email, row.interest].map(cell).join(','));
console.error(`${rows.length} signup${rows.length === 1 ? '' : 's'}`);
