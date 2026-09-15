type AuthFormMessageProps = {
  error?: string | string[];
  message?: string | string[];
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function AuthFormMessage({ error, message }: AuthFormMessageProps) {
  const errorText = getSingleValue(error);
  const messageText = getSingleValue(message);

  if (!errorText && !messageText) {
    return null;
  }

  return (
    <p
      className={[
        "rounded-md border px-3 py-2 text-sm",
        errorText
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {errorText ?? messageText}
    </p>
  );
}
