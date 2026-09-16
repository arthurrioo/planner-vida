export const protectedRoutePrefix = "/app";
export const passwordResetPath = "/auth/reset";
export const authRoutePrefixes = ["/login", "/signup", "/recover"] as const;

export function getSafeNextPath(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string") {
    return protectedRoutePrefix;
  }

  return value.startsWith(`${protectedRoutePrefix}/`) ||
    value === protectedRoutePrefix ||
    value === passwordResetPath
    ? value
    : protectedRoutePrefix;
}

export function getLoginPath(nextPath = protectedRoutePrefix) {
  const params = new URLSearchParams();
  params.set("next", getSafeNextPath(nextPath));
  return `/login?${params.toString()}`;
}

export function isProtectedPath(pathname: string) {
  return pathname === protectedRoutePrefix || pathname.startsWith("/app/");
}

export function isAuthPath(pathname: string) {
  return authRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
