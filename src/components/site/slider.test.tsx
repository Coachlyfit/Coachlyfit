// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Slider, slideIndexAt, slideOffset } from "./slider";

const messages = { site: { slider: { prev: "Previous", next: "Next", goTo: "Slide {n} of {total}" } } };

function mount(dir: "rtl" | "ltr") {
  const scrollTo = vi.fn();
  // jsdom has no layout: give the track a width and capture scrollTo.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
  HTMLElement.prototype.scrollTo = scrollTo as never;
  render(
    <NextIntlClientProvider locale={dir === "rtl" ? "ar" : "en"} messages={messages}>
      <div dir={dir}>
        <Slider label="Reviews">
          <p>one</p>
          <p>two</p>
          <p>three</p>
        </Slider>
      </div>
    </NextIntlClientProvider>
  );
  return scrollTo;
}

afterEach(() => vi.restoreAllMocks());

describe("slide math", () => {
  it("scrolls toward negative offsets in RTL, positive in LTR", () => {
    expect(slideOffset(2, 300, false)).toBe(600);
    expect(slideOffset(2, 300, true)).toBe(-600);
    expect(slideOffset(0, 300, true)).toBeCloseTo(0);
  });

  it("finds the snapped slide from either sign of scrollLeft", () => {
    expect(slideIndexAt(-310, 300, 3)).toBe(1);
    expect(slideIndexAt(590, 300, 3)).toBe(2);
    expect(slideIndexAt(5000, 300, 3)).toBe(2);
    expect(slideIndexAt(10, 0, 3)).toBe(0);
  });
});

describe("<Slider>", () => {
  it("next moves one slide in the reading direction (RTL → negative scroll)", () => {
    const scrollTo = mount("rtl");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: -300 }));
  });

  it("next moves forward in LTR (positive scroll)", () => {
    const scrollTo = mount("ltr");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 300 }));
  });

  it("previous wraps to the last slide", () => {
    const scrollTo = mount("ltr");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 600 }));
  });

  it("renders one dot per slide and marks the first current", () => {
    mount("ltr");
    const dots = screen.getAllByRole("button", { name: /Slide \d of 3/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-current", "true");
  });
});
