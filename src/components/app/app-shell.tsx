import type React from "react";

import { AppNavigation } from "./app-navigation";
import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

type AppShellProps = {
  children: React.ReactNode;
  displayName: string;
  email: string;
  roleLabel: string;
};

export function AppShell({
  children,
  displayName,
  email,
  roleLabel,
}: AppShellProps) {
  return (
    <div className="bg-background min-h-dvh">
      <a
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2"
        href="#conteudo-principal"
      >
        Ir para o conteudo principal
      </a>

      <div className="flex min-h-dvh">
        <AppNavigation />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border bg-background/95 sticky top-0 z-10 border-b px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Planner Vida
                </p>
                <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-foreground truncate text-base font-semibold">
                    {displayName}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {email}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="border-border text-muted-foreground hidden rounded-md border px-2.5 py-1 text-xs font-semibold sm:inline-flex">
                  {roleLabel}
                </span>
                <form action={signOutAction}>
                  <Button size="sm" type="submit" variant="secondary">
                    Sair
                  </Button>
                </form>
              </div>
            </div>
          </header>

          <main
            className="w-full flex-1 px-4 pt-5 pb-[calc(10rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-8 lg:px-8"
            id="conteudo-principal"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
