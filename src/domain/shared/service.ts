import type { AuditService } from "./audit";
import type { Logger } from "./logging";
import type { RepositoryContext } from "./repository";
import type { TransactionBoundary } from "./transaction-boundary";

export type ApplicationServiceContext = RepositoryContext &
  Readonly<{
    audit?: AuditService;
    logger?: Logger;
    transactionBoundary?: TransactionBoundary;
  }>;

export type ApplicationService<TInput, TOutput> = Readonly<{
  execute(context: ApplicationServiceContext, input: TInput): Promise<TOutput>;
}>;
