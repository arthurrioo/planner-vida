import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-dvh px-6 py-8 sm:px-10 lg:px-12">
      <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col justify-between gap-10">
        <header className="border-border flex items-center justify-between gap-4 border-b pb-5">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Phase 1 / Milestone 01
            </p>
            <h1 className="text-foreground mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">
              Planner Vida
            </h1>
          </div>
          <Button disabled>Bootstrap</Button>
        </header>

        <div className="max-w-3xl">
          <p className="text-muted-foreground text-base leading-7 sm:text-lg">
            Fundação técnica inicial pronta para receber as próximas milestones:
            aplicação Next.js, TypeScript, Tailwind, testes e boundaries do
            monólito modular.
          </p>
        </div>

        <footer className="border-border text-muted-foreground grid gap-3 border-t pt-5 text-sm sm:grid-cols-3">
          <span>Sem schema de banco</span>
          <span>Sem auth</span>
          <span>Sem lógica financeira</span>
        </footer>
      </section>
    </main>
  );
}
