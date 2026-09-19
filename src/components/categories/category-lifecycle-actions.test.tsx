import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryLifecycleActions } from "./category-lifecycle-actions";

const noopAction = vi.fn();

function renderActions(
  overrides: Partial<{
    archivedAt: string | null;
    dependencyCount: number;
  }> = {},
) {
  return render(
    <CategoryLifecycleActions
      archiveAction={noopAction}
      archivedAt={overrides.archivedAt ?? null}
      deleteAction={noopAction}
      dependencyCount={overrides.dependencyCount ?? 0}
    />,
  );
}

describe("CategoryLifecycleActions", () => {
  it("shows confirmed permanent delete only when no dependencies exist", async () => {
    renderActions();

    fireEvent.click(
      screen.getByRole("button", { name: "Excluir permanentemente" }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "A exclusao permanente e irreversivel.",
    );
  });

  it("shows archive guidance and no hard-delete button when dependencies exist", () => {
    renderActions({ dependencyCount: 1 });

    expect(screen.getByRole("button", { name: "Arquivar" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Excluir permanentemente" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/vinculos preservados/)).toBeVisible();
  });

  it("does not offer archive or hard delete for archived categories", () => {
    renderActions({
      archivedAt: "2026-09-19T00:00:00.000Z",
      dependencyCount: 0,
    });

    expect(
      screen.queryByRole("button", { name: "Arquivar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Excluir permanentemente" }),
    ).not.toBeInTheDocument();
  });
});
