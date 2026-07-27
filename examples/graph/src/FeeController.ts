// Generated runnable starter. Copy the example before adding domain-specific entities.
import { BigInt, dataSource } from "@graphprotocol/graph-ts";
import { FeesCollected } from "../generated/FeeController/FeeController";
import { FeeControllerFeesCollectedEvent } from "../generated/schema";

export function handleFeeControllerFeesCollectedEvent(event: FeesCollected): void {
  const entity = new FeeControllerFeesCollectedEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.pair = event.params.pair;
  entity.caller = event.params.caller;
  entity.amount0 = event.params.amount0;
  entity.amount1 = event.params.amount1;
  entity.protocolAmount0 = event.params.protocolAmount0;
  entity.protocolAmount1 = event.params.protocolAmount1;
  entity.creatorAmount0 = event.params.creatorAmount0;
  entity.creatorAmount1 = event.params.creatorAmount1;
  entity.save();
}
