// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

const messages = { common: { cancel: "Cancel", pending: "Saving…" } };

function renderDialog(pending: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete item"
        confirmLabel="Delete"
        onConfirm={() => {}}
        pending={pending}
      />
    </NextIntlClientProvider>
  );
}

describe("ConfirmDialog pending state", () => {
  it("shows the confirm label when not pending", () => {
    renderDialog(false);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("swaps to the shared pending label and disables the button when pending", () => {
    renderDialog(true);
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
  });
});
