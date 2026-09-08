// Compile the exact-pinned repository starter; never invoked by build/prepack.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../examples/envio', import.meta.url));
for (const args of [['ci', '--ignore-scripts'], ['run', 'check']]) {
  const result = spawnSync('npm', args, { cwd, stdio: 'inherit', env: {
    ...process.env,
    // Code generation resolves config placeholders but makes no RPC requests.
    ENVIO_ROBINHOOD_MAINNET_RPC_URL: 'http://127.0.0.1:1',
    ENVIO_ROBINHOOD_TESTNET_RPC_URL: 'http://127.0.0.1:1',
  } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
