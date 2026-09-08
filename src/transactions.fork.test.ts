import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as hegel from '@hegeldev/hegel';
import * as gs from '@hegeldev/hegel/generators';
import { createPublicClient, createTestClient, createWalletClient, defineChain, http, decodeFunctionResult, zeroAddress, type Address, type Hex, type PublicClient } from 'viem';
import { robinhoodMainnet } from './deployments.js';
import { assertCompatibleDeployment } from './compatibility.js';
import { launchpadAbi, routerAbi } from './abis.js';
import { calculateSlippageFloor, calculateCreatorCutCapacity, validateFeeRange } from './economics.js';
import { buildGraduateTransaction, buildCollectFeesTransaction, verifyGraduateTransaction, verifyCollectFeesTransaction, buildCreateLaunchTransaction, buildCurveBuyTransaction, buildCurveSellTransaction, buildApproveTransaction, buildSwapExactInTransaction, verifyCreateLaunchTransaction, verifyCurveBuyTransaction, verifyCurveSellTransaction, verifySwapExactInTransaction, type TransactionRequest } from './transactions.js';
import { verifyGraduatedReceipt, verifyFeesCollectedReceipt, verifyLaunchCreationReceipt, verifyBuyReceipt, verifySellReceipt, verifyRouterSwapReceipt } from './receipts.js';

const upstream = process.env.SDK_FORK_EIP155_4663_RPC_URL;
// Explicit numbered-block pin (observed latest on 2026-09-08; no finality claim); never substitute latest when archive state is unavailable.
const blockNumber = 58_042_380n;
const blockHash = '0xf41279681f1d795570a4b76f7a09cda5a90cd1b8d77bde014cfba9d26b5bb3ea';
const account: Address = '0x0000000000000000000000000000000000001234';
const { launchpad, router, feeController } = robinhoodMainnet.contracts;
const chain = defineChain({ id: 4663, name: 'Robinhood fork', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1'] } } });
if (!upstream) console.info('SKIP fork suite: set SDK_FORK_EIP155_4663_RPC_URL to an archive RPC and install anvil.');

// Hegel generates bounded intent; asynchronous RPC execution stays sequential and isolated.
function generatedIntents() {
  const cases: { value: bigint; slippage: number }[] = [];
  hegel.test(tc => { cases.push({ value: tc.draw(gs.bigIntegers({ minValue: 10n ** 14n, maxValue: 10n ** 16n })), slippage: tc.draw(gs.integers({ minValue: 0, maxValue: 500 })) }); }, { testCases: 8, derandomize: true, database: hegel.Database.disabled });
  return cases;
}

describe.skipIf(!upstream)('Launch On Block pinned mainnet fork', () => {
  let anvil: ChildProcess;
  let client: PublicClient;
  let test: ReturnType<typeof createTestClient>;
  let wallet: ReturnType<typeof createWalletClient>;
  let token: Address;
  let snapshot: Hex;

  beforeAll(async () => {
    const server = createServer();
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new TypeError('Expected TCP port');
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const url = `http://127.0.0.1:${address.port}`;
    const transport = http(url, { retryCount: 0, timeout: 10_000 });
    client = createPublicClient({ chain, transport });
    test = createTestClient({ chain, mode: 'anvil', transport });
    wallet = createWalletClient({ account, chain, transport });
    anvil = spawn('anvil', ['--fork-url', upstream!, '--fork-block-number', String(blockNumber), '--host', '127.0.0.1', '--port', String(address.port), '--silent'], { stdio: 'ignore' });
    let startupError: Error | undefined;
    anvil.on('error', error => { startupError = error; });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      if (anvil.exitCode !== null) throw new TypeError('Anvil exited before fork startup; check archive state availability');
      try { if (await client.getChainId() === 4663) { ready = true; break; } } catch { /* startup only */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new TypeError('Pinned fork did not start');
    expect((await client.getBlock({ blockNumber })).hash).toBe(blockHash);
    await assertCompatibleDeployment(client, robinhoodMainnet, { blockNumber });
    await test.impersonateAccount({ address: account });
    await test.setBalance({ address: account, value: 100n * 10n ** 18n });
    const read = (functionName: 'MIN_CURVE_FEE_BPS' | 'MAX_CURVE_FEE_BPS' | 'protocolCutBps' | 'maxGraduationCutBps') => client.readContract({ address: launchpad, abi: launchpadAbi, functionName });
    const [minimum, maximum, protocol, cap] = await Promise.all([read('MIN_CURVE_FEE_BPS'), read('MAX_CURVE_FEE_BPS'), read('protocolCutBps'), read('maxGraduationCutBps')]);
    const parameters = { name: 'SDK fork', symbol: 'FORK', creatorBps: calculateCreatorCutCapacity(cap, protocol), curveFeeBps: validateFeeRange(minimum, minimum, maximum), payoutWallet: account, metadataUri: 'ipfs://sdk-fork-test' };
    const request = buildCreateLaunchTransaction(launchpad, parameters);
    const { transaction, receipt } = await execute(request);
    verifyCreateLaunchTransaction(transaction, launchpad, account, parameters);
    token = verifyLaunchCreationReceipt(receipt, launchpad, { launch: { creator: account, creatorBps: parameters.creatorBps, curveFeeBps: minimum, payoutWallet: account, metadataURI: parameters.metadataUri } }).launch.token;
    snapshot = await test.snapshot();
  }, 120_000);

  afterAll(async () => {
    if (anvil && anvil.exitCode === null && !anvil.killed) {
      const exited = once(anvil, 'exit');
      anvil.kill('SIGTERM');
      await exited;
    }
  });

  async function reset() { await test.revert({ id: snapshot }); snapshot = await test.snapshot(); }
  async function execute(request: TransactionRequest) {
    const hash = await wallet.sendTransaction({ ...request, account, chain, gas: 10_000_000n });
    const [receipt, transaction] = await Promise.all([client.waitForTransactionReceipt({ hash }), client.getTransaction({ hash })]);
    expect(receipt.status).toBe('success');
    return { receipt, transaction };
  }

  it('compares generated curve quotes, protected calldata, simulated returns and mined buy/sell evidence', async () => {
    for (const { value, slippage } of generatedIntents()) {
      await reset();
      const quoted = await client.readContract({ address: launchpad, abi: launchpadAbi, functionName: 'quoteBuy', args: [token, value] });
      const floor = calculateSlippageFloor(quoted, slippage);
      expect(floor).toBe(quoted * BigInt(10_000 - slippage) / 10_000n);
      const parameters = { token, value, minTokensOut: floor };
      const request = buildCurveBuyTransaction(launchpad, parameters);
      const simulated = await client.call({ account, ...request });
      expect(decodeFunctionResult({ abi: launchpadAbi, functionName: 'buy', data: simulated.data! })).toBe(quoted);
      const buy = await execute(request);
      verifyCurveBuyTransaction(buy.transaction, launchpad, account, parameters);
      const evidence = verifyBuyReceipt(buy.receipt, launchpad, { token, buyer: account, amountIn: value, minTokensOut: floor });
      expect(evidence.tokensOut).toBe(quoted);
      await execute(buildApproveTransaction(token, launchpad, quoted));
      const sellQuote = await client.readContract({ address: launchpad, abi: launchpadAbi, functionName: 'quoteSell', args: [token, quoted] });
      const sellParameters = { token, tokensIn: quoted, minAmountOut: calculateSlippageFloor(sellQuote, slippage) };
      const sellRequest = buildCurveSellTransaction(launchpad, sellParameters);
      const sellSimulation = await client.call({ account, ...sellRequest });
      expect(decodeFunctionResult({ abi: launchpadAbi, functionName: 'sell', data: sellSimulation.data! })).toBe(sellQuote);
      const sell = await execute(sellRequest);
      verifyCurveSellTransaction(sell.transaction, launchpad, account, sellParameters);
      expect(verifySellReceipt(sell.receipt, launchpad, { token, seller: account })).toMatchObject({ tokensIn: quoted, amountOut: sellQuote });
      expect(sellQuote).toBeLessThanOrEqual(value);
      // A floor above the actual contract output must fail at the contract boundary.
      await reset();
      await expect(client.call({ account, ...buildCurveBuyTransaction(launchpad, { token, value, minTokensOut: quoted + 1n }) })).rejects.toThrow();
    }
  }, 120_000);

  it('executes generated router swaps in both directions and binds receipts to quotes and reviewed calldata', async () => {
    for (const { value, slippage } of generatedIntents()) {
      await reset();
      for (const buying of [true, false]) {
        const tokenIn = buying ? zeroAddress : token;
        const tokenOut = buying ? token : zeroAddress;
        // Sell a bounded fraction of the acquired balance, independent of the changed buy quote.
        const input = buying ? value : valueHeld / 2n;
        if (!buying) await execute(buildApproveTransaction(token, router, input));
        const [, pool, quoted] = await client.readContract({ address: router, abi: routerAbi, functionName: 'quote', args: [tokenIn, tokenOut, input] });
        const parameters = { tokenIn, tokenOut, amountIn: input, amountOutMin: calculateSlippageFloor(quoted, slippage), recipient: account, deadline: (await client.getBlock()).timestamp + 3600n };
        const request = buildSwapExactInTransaction(router, parameters);
        const simulated = await client.call({ account, ...request });
        expect(decodeFunctionResult({ abi: routerAbi, functionName: 'swapExactIn', data: simulated.data! })).toBe(quoted);
        const result = await execute(request);
        verifySwapExactInTransaction(result.transaction, router, account, parameters);
        expect(verifyRouterSwapReceipt(result.receipt, router, { sender: account, pool, to: account })).toMatchObject({ amountIn: input, amountOut: quoted });
        if (buying) valueHeld = quoted;
      }
    }
  }, 120_000);
  it('graduates a launch, executes generated pool swaps and verifies collected fee conservation', async () => {
    await reset();
    const funding = buildCurveBuyTransaction(launchpad, { token, value: 5n * 10n ** 18n, minTokensOut: 0n });
    const buy = await execute(funding);
    const state = await client.readContract({ address: launchpad, abi: launchpadAbi, functionName: 'getLaunch', args: [token] });
    let graduationReceipt = buy.receipt;
    if (!state.graduated) {
      const result = await execute(buildGraduateTransaction(launchpad, token));
      verifyGraduateTransaction(result.transaction, launchpad, account, token);
      graduationReceipt = result.receipt;
    }
    const graduation = verifyGraduatedReceipt(graduationReceipt, launchpad, { token });
    expect(graduation.totalRaised).toBe(graduation.creatorCut + graduation.protocolCut + graduation.poolQuote);
    expect(graduation.pool).not.toBe(zeroAddress);
    for (const { value, slippage } of generatedIntents()) {
      const [, pool, quoted] = await client.readContract({ address: router, abi: routerAbi, functionName: 'quote', args: [zeroAddress, token, value] });
      expect(pool.toLowerCase()).toBe(graduation.pool.toLowerCase());
      const parameters = { tokenIn: zeroAddress, tokenOut: token, amountIn: value, amountOutMin: calculateSlippageFloor(quoted, slippage), recipient: account, deadline: (await client.getBlock()).timestamp + 3600n };
      const result = await execute(buildSwapExactInTransaction(router, parameters));
      verifySwapExactInTransaction(result.transaction, router, account, parameters);
      expect(verifyRouterSwapReceipt(result.receipt, router, { sender: account, pool, to: account }).amountOut).toBe(quoted);
    }
    const result = await execute(buildCollectFeesTransaction(feeController, graduation.pool, 'amm'));
    verifyCollectFeesTransaction(result.transaction, feeController, account, graduation.pool, 'amm');
    const fees = verifyFeesCollectedReceipt(result.receipt, feeController, { pair: graduation.pool, caller: account });
    expect(fees.amount0 + fees.amount1).toBeGreaterThan(0n);
    expect(fees.amount0).toBe(fees.protocolAmount0 + fees.creatorAmount0);
    expect(fees.amount1).toBe(fees.protocolAmount1 + fees.creatorAmount1);
  }, 120_000);
  let valueHeld = 0n;
});
