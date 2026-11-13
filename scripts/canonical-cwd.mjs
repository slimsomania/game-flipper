/**
 * Runs a Node CLI from the project's canonical (real) path.
 *
 * Why: Windows terminals, VS Code's in particular, often start in "c:\..." instead of "C:\...".
 * Tools that resolve real paths then see the same file under two spellings and load a module
 * twice. Vitest 5 fails every test with "Vitest failed to find the current suite". Starting the
 * tool from the real path avoids that. On macOS and Linux this is a plain pass-through.
 *
 * Usage (from package.json): node scripts/canonical-cwd.mjs <package>/<bin-file> [args...]
 *   e.g. node scripts/canonical-cwd.mjs vitest/vitest.mjs run
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

const [bin, ...args] = process.argv.slice(2);
if (!bin) {
  console.error('usage: node scripts/canonical-cwd.mjs <package>/<bin-file> [args...]');
  process.exit(2);
}

const root = realpathSync.native(process.cwd());
const result = spawnSync(process.execPath, [join(root, 'node_modules', bin), ...args], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
