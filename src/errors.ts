/** Stable machine-readable failures emitted by the SDK's own validation boundaries. */
export type SdkErrorCode =
  | "ADMIN_MISMATCH"
  | "ABI_REVISION_MISMATCH"
  | "CALLDATA_MISMATCH"
  | "CHAIN_MISMATCH"
  | "CODE_HASH_MISMATCH"
  | "CODE_MISSING"
  | "DEADLINE_EXPIRED"
  | "DEPLOYMENT_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "FEE_OUT_OF_RANGE"
  | "IMPLEMENTATION_MISMATCH"
  | "INVALID_ADDRESS"
  | "INVALID_ARGUMENT"
  | "INVALID_CALLDATA"
  | "INVALID_RPC_QUANTITY"
  | "NATIVE_VALUE_MISMATCH"
  | "OUTPUT_BELOW_MINIMUM"
  | "POINTER_MISMATCH"
  | "RECEIPT_FIELD_MISMATCH"
  | "RECEIPT_REVERTED"
  | "TERMS_INCONSISTENT"
  | "UNEXPECTED_SENDER"
  | "UNEXPECTED_TARGET"
  | "UNEXPECTED_VALUE"
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_FUNCTION";

export interface SdkErrorOptions {
  path?: string;
  expected?: string;
  actual?: string;
  cause?: unknown;
}

export class SdkError extends Error {
  public readonly path?: string;
  public readonly expected?: string;
  public readonly actual?: string;

  constructor(
    public readonly code: SdkErrorCode,
    message: string,
    options: SdkErrorOptions = {},
  ) {
    super(message);
    this.name = "SdkError";
    this.path = options.path;
    this.expected = options.expected;
    this.actual = options.actual;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(Object.entries({
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      expected: this.expected,
      actual: this.actual,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  }
}

export function isSdkError(error: unknown): error is SdkError {
  return error instanceof SdkError;
}
