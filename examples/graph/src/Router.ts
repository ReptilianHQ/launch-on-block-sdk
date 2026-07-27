// Generated runnable starter. Copy the example before adding domain-specific entities.
import { dataSource } from "@graphprotocol/graph-ts";
import { Swap } from "../generated/Router/Router";
import { RouterSwapEvent } from "../generated/schema";

export function handleRouterSwapEvent(event: Swap): void {
  const entity = new RouterSwapEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.sender = event.params.sender;
  entity.pool = event.params.pool;
  entity.amountIn = event.params.amountIn;
  entity.amountOut = event.params.amountOut;
  entity.to = event.params.to;
  entity.save();
}
