// Generated runnable starter. Copy the example before adding application-specific entities.
import { indexer } from "envio";

function metadata(event: {
  chainId: number;
  srcAddress: string;
  block: { number: number; hash: string; timestamp: number };
  transaction: { hash?: string; transactionIndex?: number };
  logIndex: number;
}) {
  return {
    id: `${event.chainId}-${event.block.number}-${event.logIndex}`,
    chainId: BigInt(event.chainId),
    emitter: event.srcAddress,
    blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash,
    blockTimestamp: BigInt(event.block.timestamp),
    transactionHash: event.transaction.hash ?? "",
    transactionIndex: BigInt(event.transaction.transactionIndex ?? 0),
    logIndex: BigInt(event.logIndex),
  };
}

indexer.onEvent({ contract: "Launchpad", event: "LaunchCreated" }, async ({ event, context }) => {
  context.LaunchpadLaunchCreatedEvent.set({
    ...metadata(event),
    token: event.params.token,
    creator: event.params.creator,
    creatorBps: BigInt(event.params.creatorBps),
    curveFeeBps: BigInt(event.params.curveFeeBps),
    payoutWallet: event.params.payoutWallet,
    metadataURI: event.params.metadataURI,
  });
});

indexer.onEvent({ contract: "Launchpad", event: "CurveAvailabilitySet" }, async ({ event, context }) => {
  context.LaunchpadCurveAvailabilitySetEvent.set({
    ...metadata(event),
    curveId: BigInt(event.params.curveId),
    enabledForNewLaunches: event.params.enabledForNewLaunches,
  });
});

indexer.onEvent({ contract: "Launchpad", event: "CurveRegistered" }, async ({ event, context }) => {
  context.LaunchpadCurveRegisteredEvent.set({
    ...metadata(event),
    curveId: BigInt(event.params.curveId),
    implementation: event.params.implementation,
    codeHash: event.params.codeHash,
  });
});

indexer.onEvent({ contract: "Launchpad", event: "CurveSelected" }, async ({ event, context }) => {
  context.LaunchpadCurveSelectedEvent.set({
    ...metadata(event),
    token: event.params.token,
    curveId: BigInt(event.params.curveId),
    implementation: event.params.implementation,
    quoteTarget: BigInt(event.params.quoteTarget),
  });
});

indexer.onEvent({ contract: "Launchpad", event: "Buy" }, async ({ event, context }) => {
  context.LaunchpadBuyEvent.set({
    ...metadata(event),
    token: event.params.token,
    buyer: event.params.buyer,
    amountIn: BigInt(event.params.amountIn),
    tokensOut: BigInt(event.params.tokensOut),
  });
});

indexer.onEvent({ contract: "Launchpad", event: "Sell" }, async ({ event, context }) => {
  context.LaunchpadSellEvent.set({
    ...metadata(event),
    token: event.params.token,
    seller: event.params.seller,
    tokensIn: BigInt(event.params.tokensIn),
    amountOut: BigInt(event.params.amountOut),
  });
});

indexer.onEvent({ contract: "Launchpad", event: "Graduated" }, async ({ event, context }) => {
  context.LaunchpadGraduatedEvent.set({
    ...metadata(event),
    token: event.params.token,
    pool: event.params.pool,
    totalRaised: BigInt(event.params.totalRaised),
    creatorCut: BigInt(event.params.creatorCut),
    protocolCut: BigInt(event.params.protocolCut),
    poolQuote: BigInt(event.params.poolQuote),
    poolTokens: BigInt(event.params.poolTokens),
    burnedTokens: BigInt(event.params.burnedTokens),
  });
});

indexer.onEvent({ contract: "Launchpad", event: "Claimed" }, async ({ event, context }) => {
  context.LaunchpadClaimedEvent.set({
    ...metadata(event),
    to: event.params.to,
    amount: BigInt(event.params.amount),
  });
});

indexer.onEvent({ contract: "Router", event: "Swap" }, async ({ event, context }) => {
  context.RouterSwapEvent.set({
    ...metadata(event),
    sender: event.params.sender,
    pool: event.params.pool,
    amountIn: BigInt(event.params.amountIn),
    amountOut: BigInt(event.params.amountOut),
    to: event.params.to,
  });
});

indexer.onEvent({ contract: "FeeController", event: "FeesCollected" }, async ({ event, context }) => {
  context.FeeControllerFeesCollectedEvent.set({
    ...metadata(event),
    pair: event.params.pair,
    caller: event.params.caller,
    amount0: BigInt(event.params.amount0),
    amount1: BigInt(event.params.amount1),
    protocolAmount0: BigInt(event.params.protocolAmount0),
    protocolAmount1: BigInt(event.params.protocolAmount1),
    creatorAmount0: BigInt(event.params.creatorAmount0),
    creatorAmount1: BigInt(event.params.creatorAmount1),
  });
});

indexer.onEvent({ contract: "LaunchToken", event: "Approval" }, async ({ event, context }) => {
  context.LaunchTokenApprovalEvent.set({
    ...metadata(event),
    owner: event.params.owner,
    spender: event.params.spender,
    value: BigInt(event.params.value),
  });
});

indexer.onEvent({ contract: "LaunchToken", event: "Transfer" }, async ({ event, context }) => {
  context.LaunchTokenTransferEvent.set({
    ...metadata(event),
    from: event.params.from,
    to: event.params.to,
    value: BigInt(event.params.value),
  });
});

indexer.onEvent({ contract: "GraduationPool", event: "Swap" }, async ({ event, context }) => {
  context.GraduationPoolSwapEvent.set({
    ...metadata(event),
    sender: event.params.sender,
    amount0In: BigInt(event.params.amount0In),
    amount1In: BigInt(event.params.amount1In),
    amount0Out: BigInt(event.params.amount0Out),
    amount1Out: BigInt(event.params.amount1Out),
    to: event.params.to,
  });
});

indexer.onEvent({ contract: "GraduationPool", event: "ProtocolFeesCollected" }, async ({ event, context }) => {
  context.GraduationPoolProtocolFeesCollectedEvent.set({
    ...metadata(event),
    to: event.params.to,
    amount0: BigInt(event.params.amount0),
    amount1: BigInt(event.params.amount1),
  });
});

indexer.contractRegister(
  { contract: "Launchpad", event: "LaunchCreated" },
  async ({ event, context }) => {
    context.chain.LaunchToken.add(event.params.token);
  },
);

indexer.contractRegister(
  { contract: "Launchpad", event: "Graduated" },
  async ({ event, context }) => {
    context.chain.GraduationPool.add(event.params.pool);
  },
);
