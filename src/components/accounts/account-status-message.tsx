type SearchParams = Record<string, string | string[] | undefined>;

export function AccountStatusMessage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const error = pickFirst(searchParams.error);
  const message = pickFirst(searchParams.message);

  if (!error && !message) {
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

function pickFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
