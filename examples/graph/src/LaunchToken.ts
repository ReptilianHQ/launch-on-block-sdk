// Generated runnable starter. Copy the example before adding domain-specific entities.
import { dataSource } from "@graphprotocol/graph-ts";
import { Approval, Transfer } from "../generated/templates/LaunchToken/LaunchToken";
import { LaunchTokenApprovalEvent, LaunchTokenTransferEvent } from "../generated/schema";

export function handleLaunchTokenApprovalEvent(event: Approval): void {
  const entity = new LaunchTokenApprovalEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.owner = event.params.owner;
  entity.spender = event.params.spender;
  entity.value = event.params.value;
  entity.save();
}

export function handleLaunchTokenTransferEvent(event: Transfer): void {
  const entity = new LaunchTokenTransferEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  entity.network = dataSource.network();
  entity.emitter = event.address;
  entity.blockNumber = event.block.number;
  entity.blockHash = event.block.hash;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.transactionIndex = event.transaction.index;
  entity.logIndex = event.logIndex;
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.value = event.params.value;
  entity.save();
}
