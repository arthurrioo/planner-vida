export type TransactionContext = Readonly<{
  transactionId: string;
}>;

export type TransactionBoundary = Readonly<{
  run<TValue>(
    operation: (context: TransactionContext) => Promise<TValue>,
  ): Promise<TValue>;
}>;

export function createPassthroughTransactionBoundary(): TransactionBoundary {
  return {
    run(operation) {
      return operation({ transactionId: "passthrough" });
    },
  };
}
