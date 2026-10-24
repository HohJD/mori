import { randomBytes } from 'node:crypto';
import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../.env.ai.local', import.meta.url));
let file;
try {
  // Exclusive creation is idempotent: never read or overwrite an existing file,
  // including a symlink, and never touch the separate .env.local tooling file.
  file = await open(path, 'wx', 0o600);
  await file.chmod(0o600);
  await file.writeFile(`# Private server-only AI settings. Do not commit, share, or prefix with VITE_.
# OpenAI key: https://platform.openai.com/api-keys
# OpenAI API usage is billed separately from a ChatGPT subscription.
OPENAI_API_KEY=

# Claude Console key: https://platform.claude.com/settings/keys
# Claude API usage is billed separately from a Claude app subscription.
ANTHROPIC_API_KEY=

# Generated strong owner access code: unlocks this personal MORI instance.
# Open this file privately to use the code; never put it in browser storage.
# This is not multiuser account management. Rotating the code revokes sessions.
MORI_ACCESS_CODE=${randomBytes(32).toString('base64url')}
`, 'utf8');
  console.log(`Created ${path} with private permissions. No values were printed.`);
  console.log('Add at least one provider API key privately, then restart the dev server.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log(`${path} already exists; left it unchanged. No values were read or printed.`);
  } else {
    console.error('Could not create the private AI settings file. Check local directory permissions.');
    process.exitCode = 1;
  }
} finally {
  await file?.close();
}
