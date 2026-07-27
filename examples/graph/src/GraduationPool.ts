// Generated runnable starter. Copy the example before adding domain-specific entities.
import { BigInt, dataSource } from "@graphprotocol/graph-ts";
import { Swap, ProtocolFeesCollected } from "../generated/templates/GraduationPool/GraduationPool";
import { GraduationPoolSwapEvent, GraduationPoolProtocolFeesCollectedEvent } from "../generated/schema";

export function handleGraduationPoolSwapEvent(event: Swap): void {
  const entity = new GraduationPoolSwapEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.sender = event.params.sender;
  entity.amount0In = event.params.amount0In;
  entity.amount1In = event.params.amount1In;
  entity.amount0Out = event.params.amount0Out;
  entity.amount1Out = event.params.amount1Out;
  entity.to = event.params.to;
  entity.save();
}

export function handleGraduationPoolProtocolFeesCollectedEvent(event: ProtocolFeesCollected): void {
  const entity = new GraduationPoolProtocolFeesCollectedEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.to = event.params.to;
  entity.amount0 = event.params.amount0;
  entity.amount1 = event.params.amount1;
  entity.save();
}
