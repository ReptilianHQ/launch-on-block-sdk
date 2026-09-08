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
    id: `${event.chainId}:${event.block.hash.toLowerCase()}:${event.logIndex}`,
    chainId: BigInt(event.chainId),
    emitter: event.srcAddress.toLowerCase(),
    blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash.toLowerCase(),
    blockTimestamp: BigInt(event.block.timestamp),
    transactionHash: required(event.transaction.hash, "transaction.hash").toLowerCase(),
    transactionIndex: BigInt(required(event.transaction.transactionIndex, "transaction.transactionIndex")),
    logIndex: BigInt(event.logIndex),
  };
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) throw new Error(`Envio did not provide required provenance field ${field}`);
  return value;
}

indexer.onEvent({ contract: "Launchpad", event: "LaunchCreated" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "LaunchCreated", signature: "LaunchCreated(address,address,uint16,uint16,address,string)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });
  {
    const id = `${event.chainId}:${event.params.token.toLowerCase()}`;
    const existing = await context.LobLaunch.get(id);
    if (existing?.token != null && existing.token !== event.params.token.toLowerCase()) throw new Error("Conflicting LobLaunch.token evidence");
    if (existing?.creator != null && existing.creator !== event.params.creator.toLowerCase()) throw new Error("Conflicting LobLaunch.creator evidence");
    if (existing?.payoutWallet != null && existing.payoutWallet !== event.params.payoutWallet.toLowerCase()) throw new Error("Conflicting LobLaunch.payoutWallet evidence");
    if (existing?.creatorBps != null && existing.creatorBps !== BigInt(event.params.creatorBps)) throw new Error("Conflicting LobLaunch.creatorBps evidence");
    if (existing?.curveFeeBps != null && existing.curveFeeBps !== BigInt(event.params.curveFeeBps)) throw new Error("Conflicting LobLaunch.curveFeeBps evidence");
    if (existing?.metadataURI != null && existing.metadataURI !== event.params.metadataURI) throw new Error("Conflicting LobLaunch.metadataURI evidence");
    if (existing?.createdBlock != null && existing.createdBlock !== BigInt(event.block.number)) throw new Error("Conflicting LobLaunch.createdBlock evidence");
    context.LobLaunch.set({
      id,
      token: event.params.token.toLowerCase(),
      creator: event.params.creator.toLowerCase(),
      payoutWallet: event.params.payoutWallet.toLowerCase(),
      creatorBps: BigInt(event.params.creatorBps),
      curveFeeBps: BigInt(event.params.curveFeeBps),
      metadataURI: event.params.metadataURI,
      createdBlock: BigInt(event.block.number),
      curveId: existing?.curveId,
      curveImpl: existing?.curveImpl,
      quoteTarget: existing?.quoteTarget,
      pool: existing?.pool,
      graduatedBlock: existing?.graduatedBlock,
    });
  }
});

indexer.onEvent({ contract: "Launchpad", event: "CurveAvailabilitySet" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "CurveAvailabilitySet", signature: "CurveAvailabilitySet(uint32,bool)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "Launchpad", event: "CurveRegistered" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "CurveRegistered", signature: "CurveRegistered(uint32,address,bytes32)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "Launchpad", event: "CurveSelected" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "CurveSelected", signature: "CurveSelected(address,uint32,address,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });
  {
    const id = `${event.chainId}:${event.params.token.toLowerCase()}`;
    const existing = await context.LobLaunch.get(id);
    if (existing?.token != null && existing.token !== event.params.token.toLowerCase()) throw new Error("Conflicting LobLaunch.token evidence");
    if (existing?.curveId != null && existing.curveId !== BigInt(event.params.curveId)) throw new Error("Conflicting LobLaunch.curveId evidence");
    if (existing?.curveImpl != null && existing.curveImpl !== event.params.implementation.toLowerCase()) throw new Error("Conflicting LobLaunch.curveImpl evidence");
    if (existing?.quoteTarget != null && existing.quoteTarget !== BigInt(event.params.quoteTarget)) throw new Error("Conflicting LobLaunch.quoteTarget evidence");
    context.LobLaunch.set({
      id,
      token: event.params.token.toLowerCase(),
      creator: existing?.creator,
      payoutWallet: existing?.payoutWallet,
      creatorBps: existing?.creatorBps,
      curveFeeBps: existing?.curveFeeBps,
      metadataURI: existing?.metadataURI,
      createdBlock: existing?.createdBlock,
      curveId: BigInt(event.params.curveId),
      curveImpl: event.params.implementation.toLowerCase(),
      quoteTarget: BigInt(event.params.quoteTarget),
      pool: existing?.pool,
      graduatedBlock: existing?.graduatedBlock,
    });
  }
});

indexer.onEvent({ contract: "Launchpad", event: "Buy" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "Buy", signature: "Buy(address,address,uint256,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "Launchpad", event: "Sell" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "Sell", signature: "Sell(address,address,uint256,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "Launchpad", event: "Graduated" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "Graduated", signature: "Graduated(address,address,uint256,uint256,uint256,uint256,uint256,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });
  {
    const id = `${event.chainId}:${event.params.token.toLowerCase()}`;
    const existing = await context.LobLaunch.get(id);
    if (existing?.token != null && existing.token !== event.params.token.toLowerCase()) throw new Error("Conflicting LobLaunch.token evidence");
    if (existing?.pool != null && existing.pool !== event.params.pool.toLowerCase()) throw new Error("Conflicting LobLaunch.pool evidence");
    if (existing?.graduatedBlock != null && existing.graduatedBlock !== BigInt(event.block.number)) throw new Error("Conflicting LobLaunch.graduatedBlock evidence");
    context.LobLaunch.set({
      id,
      token: event.params.token.toLowerCase(),
      creator: existing?.creator,
      payoutWallet: existing?.payoutWallet,
      creatorBps: existing?.creatorBps,
      curveFeeBps: existing?.curveFeeBps,
      metadataURI: existing?.metadataURI,
      createdBlock: existing?.createdBlock,
      curveId: existing?.curveId,
      curveImpl: existing?.curveImpl,
      quoteTarget: existing?.quoteTarget,
      pool: event.params.pool.toLowerCase(),
      graduatedBlock: BigInt(event.block.number),
    });
  }
  {
    const id = `${event.chainId}:${event.params.pool.toLowerCase()}`;
    const existing = await context.LobPool.get(id);
    if (existing?.pool != null && existing.pool !== event.params.pool.toLowerCase()) throw new Error("Conflicting LobPool.pool evidence");
    if (existing?.token != null && existing.token !== event.params.token.toLowerCase()) throw new Error("Conflicting LobPool.token evidence");
    if (existing?.graduatedBlock != null && existing.graduatedBlock !== BigInt(event.block.number)) throw new Error("Conflicting LobPool.graduatedBlock evidence");
    context.LobPool.set({
      id,
      pool: event.params.pool.toLowerCase(),
      token: event.params.token.toLowerCase(),
      graduatedBlock: BigInt(event.block.number),
    });
  }
});

indexer.onEvent({ contract: "Launchpad", event: "Claimed" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Launchpad", kind: "Claimed", signature: "Claimed(address,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "Router", event: "Swap" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "Router", kind: "Swap", signature: "Swap(address,address,uint256,uint256,address)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "FeeController", event: "FeesCollected" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "FeeController", kind: "FeesCollected", signature: "FeesCollected(address,address,uint256,uint256,uint256,uint256,uint256,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "LaunchToken", event: "Approval" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "LaunchToken", kind: "Approval", signature: "Approval(address,address,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "LaunchToken", event: "Transfer" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "LaunchToken", kind: "Transfer", signature: "Transfer(address,address,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "GraduationPool", event: "Swap" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "GraduationPool", kind: "Swap", signature: "Swap(address,uint256,uint256,uint256,uint256,address)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
  });

});

indexer.onEvent({ contract: "GraduationPool", event: "ProtocolFeesCollected" }, async ({ event, context }) => {
  context.LobProtocolEvent.set({
    ...metadata(event),
    contract: "GraduationPool", kind: "ProtocolFeesCollected", signature: "ProtocolFeesCollected(address,uint256,uint256)",
    payload: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value),
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
