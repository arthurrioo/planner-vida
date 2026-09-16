import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders accessible button text", () => {
    render(<Button>Bootstrap</Button>);

    expect(screen.getByRole("button", { name: "Bootstrap" })).toBeVisible();
  });

  it("uses button as the default type", () => {
    render(<Button>Salvar</Button>);

    expect(screen.getByRole("button", { name: "Salvar" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("supports compact shell actions", () => {
    render(<Button size="sm">Sair</Button>);

    expect(screen.getByRole("button", { name: "Sair" })).toBeVisible();
  });
});
