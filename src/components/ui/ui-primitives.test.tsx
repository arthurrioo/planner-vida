import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfirmationDialog } from "./dialog";
import { EmptyState, ErrorState, LoadingState } from "./empty-state";
import { Field, Input } from "./form";
import { ResponsiveTable } from "./responsive-table";
import { ToastViewport } from "./toast";

describe("Milestone 05 UI primitives", () => {
  it("renders validation-aware form fields", () => {
    render(
      <Field error="Informe um nome valido" htmlFor="name" label="Nome">
        <Input hasError id="name" />
      </Field>,
    );

    expect(screen.getByLabelText(/Nome/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Informe um nome valido")).toBeVisible();
  });

  it("renders loading, error and empty states with accessible roles", () => {
    render(
      <>
        <LoadingState label="Carregando dados" />
        <ErrorState description="Tente novamente." />
        <EmptyState description="Nada a exibir." title="Sem registros" />
      </>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Carregando dados");
    expect(screen.getByRole("alert")).toHaveTextContent("Tente novamente.");
    expect(
      screen.getByRole("heading", { name: "Sem registros" }),
    ).toBeVisible();
  });

  it("renders confirmation dialogs and toasts", () => {
    render(
      <>
        <ConfirmationDialog confirmLabel="Confirmar" open title="Confirmacao">
          Essa operacao precisa de confirmacao.
        </ConfirmationDialog>
        <ToastViewport
          messages={[
            {
              description: "Perfil atualizado.",
              id: "toast-1",
              title: "Sucesso",
              tone: "success",
            },
          ]}
        />
      </>,
    );

    expect(screen.getByRole("dialog", { name: "Confirmacao" })).toBeVisible();
    expect(screen.getByLabelText("Notificacoes")).toHaveTextContent("Sucesso");
  });

  it("renders tabular desktop data and mobile definition-list data from one source", () => {
    render(
      <ResponsiveTable
        columns={[
          { header: "Descricao", key: "description" },
          { header: "Valor", key: "amount" },
        ]}
        getRowKey={(row) => String(row.description)}
        rows={[{ amount: "R$ 10,00", description: "Mercado" }]}
      />,
    );

    expect(screen.getAllByText("Descricao").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mercado").length).toBeGreaterThan(0);
  });
});
