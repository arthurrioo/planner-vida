import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("connects hint-only field descriptions to the input", () => {
    render(
      <Field hint="Use seu nome social." htmlFor="displayName" label="Nome">
        <Input id="displayName" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Nome" });

    expect(input).toHaveAttribute("aria-describedby", "displayName-hint");
    expect(input).toHaveAccessibleDescription("Use seu nome social.");
  });

  it("connects error-only field descriptions to the input", () => {
    render(
      <Field error="Informe um nome valido." htmlFor="displayName" label="Nome">
        <Input id="displayName" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Nome" });

    expect(input).toHaveAttribute("aria-describedby", "displayName-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Informe um nome valido.");
  });

  it("connects hint and error descriptions to the input without hidden id text", () => {
    render(
      <Field
        error="Valor obrigatorio."
        hint="Use reais e centavos."
        htmlFor="amount"
        label="Valor"
      >
        <Input id="amount" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Valor" });

    expect(input).toHaveAttribute(
      "aria-describedby",
      "amount-hint amount-error",
    );
    expect(input).toHaveAccessibleDescription(
      "Use reais e centavos. Valor obrigatorio.",
    );
    expect(
      screen.queryByText("amount-hint amount-error"),
    ).not.toBeInTheDocument();
  });

  it("omits aria-describedby when no hint or error exists", () => {
    render(
      <Field htmlFor="displayName" label="Nome">
        <Input id="displayName" />
      </Field>,
    );

    expect(screen.getByLabelText("Nome")).not.toHaveAttribute(
      "aria-describedby",
    );
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

  it("handles confirmation dialog keyboard flow and focus restoration", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    function DialogHarness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Abrir confirmacao
          </button>
          <button type="button">Acao de fundo</button>
          <ConfirmationDialog
            confirmLabel="Confirmar"
            onCancel={() => {
              onCancel();
              setOpen(false);
            }}
            onConfirm={() => {
              onConfirm();
              setOpen(false);
            }}
            open={open}
            title="Confirmacao"
          >
            Essa operacao precisa de confirmacao.
          </ConfirmationDialog>
        </>
      );
    }

    render(<DialogHarness />);

    const openButton = screen.getByRole("button", {
      name: "Abrir confirmacao",
    });
    openButton.focus();
    fireEvent.click(openButton);

    const dialog = screen.getByRole("dialog", { name: "Confirmacao" });
    const cancelButton = screen.getByRole("button", { name: "Cancelar" });
    const confirmButton = screen.getByRole("button", { name: "Confirmar" });

    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(cancelButton).toHaveFocus();

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });

    fireEvent.click(openButton);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
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

  it("keeps wide desktop table content horizontally reachable", () => {
    render(
      <ResponsiveTable
        columns={[
          { header: "Descricao muito longa", key: "description" },
          { header: "Categoria", key: "category" },
          { header: "Centro de custo", key: "costCenter" },
          { header: "Responsavel", key: "owner" },
          { header: "Observacao", key: "note" },
        ]}
        getRowKey={(row) => String(row.description)}
        rows={[
          {
            category: "Mercado",
            costCenter: "Casa",
            description:
              "Compra recorrente com descricao operacional longa para validar overflow",
            note: "Observacao extensa que nao deve ser cortada",
            owner: "Arthur",
          },
        ]}
      />,
    );

    const scrollRegion = screen.getByTestId("responsive-table-scroll-region");

    expect(scrollRegion).toHaveClass("overflow-x-auto");

    Object.defineProperty(scrollRegion, "clientWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(scrollRegion, "scrollWidth", {
      configurable: true,
      value: 960,
    });

    scrollRegion.scrollLeft = 240;

    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth);
    expect(scrollRegion.scrollLeft).toBe(240);
  });
});
