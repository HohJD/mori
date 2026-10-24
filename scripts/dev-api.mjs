import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from '../server/handler.js';

export function moriApiPlugin() {
  return {
    name: 'mori-server-only-api',
    configureServer(server) {
      // Node-only: the linked project's OIDC credential stays server-side.
      // Loading it does NOT opt any provider into Gateway. Neither file is
      // modified, printed, or serialized; existing process env takes precedence.
      for (const filename of ['.env.local', '.env.ai.local']) {
        try {
          loadEnvFile(fileURLToPath(new URL(`../${filename}`, import.meta.url)));
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw new Error('Could not load private local settings. Check environment-file permissions and format.');
          }
        }
      }
      const handle = createApiHandler();
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/api' || path?.startsWith('/api/')) {
          void handle(req, res);
          return;
        }
        next();
      });
    },
  };
}
