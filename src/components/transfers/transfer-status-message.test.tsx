import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TransferStatusMessage } from "./transfer-status-message";

describe("TransferStatusMessage", () => {
  it("renders errors as alerts", () => {
    render(
      <TransferStatusMessage
        searchParams={{ error: "Transfer input is invalid." }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Transfer input is invalid.",
    );
  });

  it("renders success messages as status updates", () => {
    render(
      <TransferStatusMessage
        searchParams={{ message: "Transferencia criada." }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Transferencia criada.",
    );
  });
});
