"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { appNavigationItems } from "./navigation";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string) {
  return (
    pathname === href || (href !== "/app" && pathname.startsWith(`${href}/`))
  );
}

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Navegacao principal"
        className="border-border bg-surface hidden border-r px-3 py-4 md:flex md:w-64 md:flex-col"
      >
        <div className="grid gap-1">
          {appNavigationItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid grid-cols-[2rem_1fr] items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2",
                  active &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
                href={item.href}
                key={item.href}
                title={item.description}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "border-border bg-background flex size-8 items-center justify-center rounded-md border text-xs font-bold",
                    active &&
                      "border-primary-foreground/40 bg-primary-foreground/15",
                  )}
                >
                  {item.symbol}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <nav
        aria-label="Navegacao principal mobile"
        className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-20 border-t px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur md:hidden"
      >
        <div className="grid grid-cols-4 gap-1">
          {appNavigationItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[0.7rem] font-semibold transition-colors outline-none focus-visible:ring-2",
                  active &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
                href={item.href}
                key={item.href}
              >
                <span aria-hidden="true" className="text-sm leading-none">
                  {item.symbol}
                </span>
                <span className="max-w-full truncate">{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
