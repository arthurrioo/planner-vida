import type React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type ModulePageProps = {
  title: string;
  eyebrow: string;
  description: string;
  children?: React.ReactNode;
};

export function ModulePage({
  children,
  description,
  eyebrow,
  title,
}: ModulePageProps) {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5">
      <header className="grid gap-2">
        <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
        <h1 className="text-foreground text-2xl font-semibold sm:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-6 sm:text-base">
          {description}
        </p>
      </header>

      {children ?? (
        <Card>
          <CardHeader>
            <CardTitle>Area pronta para montagem</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              description="A estrutura de navegacao, responsividade e estado vazio ja esta preparada. A regra de negocio deste modulo entra apenas no milestone canonico correspondente."
              title="Modulo aguardando milestone funcional"
            />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
