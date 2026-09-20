type TransferStatusMessageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export function TransferStatusMessage({
  searchParams,
}: TransferStatusMessageProps) {
  const message = readParam(searchParams.message);
  const error = readParam(searchParams.error);

  if (!message && !error) {
    return null;
  }

  return (
    <div
      className={
        error
          ? "border-danger/35 bg-danger-muted text-danger rounded-md border p-3 text-sm font-medium"
          : "border-success/35 bg-success-muted text-success rounded-md border p-3 text-sm font-medium"
      }
      role={error ? "alert" : "status"}
    >
      {error ?? message}
    </div>
  );
}

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
