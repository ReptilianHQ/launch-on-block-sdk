// Generated runnable starter. Copy the example before adding domain-specific entities.
import { BigInt, dataSource } from "@graphprotocol/graph-ts";
import { LaunchCreated, CurveAvailabilitySet, CurveRegistered, CurveSelected, Buy, Sell, Graduated, Claimed } from "../generated/Launchpad/Launchpad";
import { GraduationPool as GraduationPoolTemplate, LaunchToken as LaunchTokenTemplate } from "../generated/templates";
import { LaunchpadLaunchCreatedEvent, LaunchpadCurveAvailabilitySetEvent, LaunchpadCurveRegisteredEvent, LaunchpadCurveSelectedEvent, LaunchpadBuyEvent, LaunchpadSellEvent, LaunchpadGraduatedEvent, LaunchpadClaimedEvent } from "../generated/schema";

export function handleLaunchpadLaunchCreatedEvent(event: LaunchCreated): void {
  const entity = new LaunchpadLaunchCreatedEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.token = event.params.token;
  entity.creator = event.params.creator;
  entity.creatorBps = BigInt.fromI32(event.params.creatorBps);
  entity.curveFeeBps = BigInt.fromI32(event.params.curveFeeBps);
  entity.payoutWallet = event.params.payoutWallet;
  entity.metadataURI = event.params.metadataURI;
  entity.save();
  LaunchTokenTemplate.create(event.params.token);
}

export function handleLaunchpadCurveAvailabilitySetEvent(event: CurveAvailabilitySet): void {
  const entity = new LaunchpadCurveAvailabilitySetEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.curveId = event.params.curveId;
  entity.enabledForNewLaunches = event.params.enabledForNewLaunches;
  entity.save();
}

export function handleLaunchpadCurveRegisteredEvent(event: CurveRegistered): void {
  const entity = new LaunchpadCurveRegisteredEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.curveId = event.params.curveId;
  entity.implementation = event.params.implementation;
  entity.codeHash = event.params.codeHash;
  entity.save();
}

export function handleLaunchpadCurveSelectedEvent(event: CurveSelected): void {
  const entity = new LaunchpadCurveSelectedEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.token = event.params.token;
  entity.curveId = event.params.curveId;
  entity.implementation = event.params.implementation;
  entity.quoteTarget = event.params.quoteTarget;
  entity.save();
}

export function handleLaunchpadBuyEvent(event: Buy): void {
  const entity = new LaunchpadBuyEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.token = event.params.token;
  entity.buyer = event.params.buyer;
  entity.amountIn = event.params.amountIn;
  entity.tokensOut = event.params.tokensOut;
  entity.save();
}

export function handleLaunchpadSellEvent(event: Sell): void {
  const entity = new LaunchpadSellEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.token = event.params.token;
  entity.seller = event.params.seller;
  entity.tokensIn = event.params.tokensIn;
  entity.amountOut = event.params.amountOut;
  entity.save();
}

export function handleLaunchpadGraduatedEvent(event: Graduated): void {
  const entity = new LaunchpadGraduatedEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.token = event.params.token;
  entity.pool = event.params.pool;
  entity.totalRaised = event.params.totalRaised;
  entity.creatorCut = event.params.creatorCut;
  entity.protocolCut = event.params.protocolCut;
  entity.poolQuote = event.params.poolQuote;
  entity.poolTokens = event.params.poolTokens;
  entity.burnedTokens = event.params.burnedTokens;
  entity.save();
  GraduationPoolTemplate.create(event.params.pool);
}

export function handleLaunchpadClaimedEvent(event: Claimed): void {
  const entity = new LaunchpadClaimedEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.to = event.params.to;
  entity.amount = event.params.amount;
  entity.save();
}
