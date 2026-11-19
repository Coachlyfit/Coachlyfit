// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.fn();
vi.mock("@/app/[locale]/(sites)/sites/[domain]/review/[token]/actions", () => ({
  submitReviewAction: (...args: unknown[]) => submit(...args),
  withdrawConsentAction: vi.fn().mockResolvedValue({ withdrawn: 1 }),
}));

import { ReviewForm } from "./review-form";

const messages = {
  site: { results: { before: "Before", after: "After" } },
  clientReview: {
    rating: { label: "Your rating", star: "{n, plural, one {# star} other {# stars}}", words: { "1": "Poor", "2": "Fair", "3": "Good", "4": "Very good", "5": "Excellent" } },
    text: { label: "Your review", placeholder: "", hint: "At least 20 characters.", counter: "{n}/{max}" },
    name: { label: "Your first name", hint: "" },
    consent: { label: "Share my photos", text: "{coach} may show them.", withdraw: "Withdraw any time.", card: "Card", before: "Before", after: "After" },
    trust: "Nobody can change your words.",
    submit: "Send my review",
    sending: "Sending…",
    expiry: "Works until {date}",
    errors: {
      summary: "A few things are missing:",
      rating: "Choose a star rating.",
      bodyShort: "Write at least 20 characters.",
      bodyLong: "Too long.",
      name: "Enter your first name.",
      failed: "Something went wrong.",
      rate_limited: "Too many attempts.",
      invalid_link: "Link no longer valid.",
      invalid_input: "Check your answers.",
    },
    thanks: {
      title: "Thank you, {name}!",
      titleAnonymous: "Thank you!",
      text: "Reached {coach}.",
      sharedTitle: "You agreed to share",
      sharedText: "Withdraw any time.",
      withdraw: "Withdraw consent",
      withdrawing: "Withdrawing…",
      withdrawn: "Withdrawn.",
      withdrawFailed: "Failed.",
      privateTitle: "Photos stay private",
      privateText: "Not shared.",
      visit: "Visit {coach}'s website",
    },
  },
};

function mount() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReviewForm token={"t".repeat(43)} coachName="Coach Ahmed" initialFirstName="" expiresLabel="3 Dec" preview={null} siteHref="/" />
    </NextIntlClientProvider>
  );
}

beforeEach(() => submit.mockReset());

describe("<ReviewForm>", () => {
  it("shows an error summary and inline errors, and sends nothing, when fields are missing", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Send my review" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("A few things are missing:");
    expect(screen.getAllByText("Choose a star rating.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Write at least 20 characters.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enter your first name.").length).toBeGreaterThan(0);
    expect(submit).not.toHaveBeenCalled();
  });

  it("the photo-consent switch is off by default and is a real switch", () => {
    mount();
    const sw = screen.getByRole("switch", { name: "Share my photos" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("submits the trimmed answers and then thanks the client by name", async () => {
    submit.mockResolvedValue({ displayName: "Sara M.", sharePhotos: false });
    mount();

    fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "  Great coach, I stuck with the plan.  " } });
    fireEvent.change(screen.getByLabelText("Your first name"), { target: { value: "Sara" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my review" }));

    await waitFor(() => expect(screen.getByText("Thank you, Sara!")).toBeInTheDocument());
    expect(submit).toHaveBeenCalledWith("t".repeat(43), "en", { rating: 5, body: "Great coach, I stuck with the plan.", firstName: "Sara", sharePhotos: false });
    expect(screen.getByText("Photos stay private")).toBeInTheDocument();
  });

  it("shows a generic error and keeps the form when the server refuses", async () => {
    submit.mockResolvedValue({ error: "invalid_link" });
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.change(screen.getByLabelText("Your review"), { target: { value: "Good coaching overall, would recommend." } });
    fireEvent.change(screen.getByLabelText("Your first name"), { target: { value: "Sara" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my review" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Link no longer valid."));
    expect(screen.getByLabelText("Your review")).toHaveValue("Good coaching overall, would recommend.");
  });
});

describe("<StarRating> keyboard", () => {
  it("arrow keys move the selection (Right = next in LTR)", () => {
    mount();
    const first = screen.getByRole("radio", { name: "1 star" });
    fireEvent.click(first);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "2 stars" })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "2 stars" }), { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "1 star" })).toHaveAttribute("aria-checked", "true");
  });
});
