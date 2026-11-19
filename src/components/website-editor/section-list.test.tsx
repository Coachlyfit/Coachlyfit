// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { defaultSections, SECTION_KEYS, type SectionKey } from "@/domain/sites/site-content";
import { SectionList } from "./section-list";

const names = Object.fromEntries(SECTION_KEYS.map((k) => [k, k.toUpperCase()]));
const messages = {
  websiteEditor: {
    sections: {
      hint: "hint",
      dragHelp: "help",
      alwaysOn: "Always on",
      drag: "Drag {name}",
      edit: "Edit",
      toggle: "Show {name}",
      moved: "{name} moved to {position} of {total}",
      names,
    },
  },
};

const summaries = Object.fromEntries(SECTION_KEYS.map((k) => [k, `${k} summary`])) as Record<SectionKey, string>;

function mount(onReorder = vi.fn(), onToggle = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SectionList sections={defaultSections()} summaries={summaries} onReorder={onReorder} onToggle={onToggle} onEdit={vi.fn()} />
    </NextIntlClientProvider>
  );
  return { onReorder, onToggle };
}

const keysOf = (call: unknown[]) => (call[0] as { key: string }[]).map((s) => s.key);

describe("<SectionList>", () => {
  it("ArrowDown on a handle moves that row down one place", () => {
    const { onReorder } = mount();
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag ABOUT" }), { key: "ArrowDown" });
    expect(keysOf(onReorder.mock.calls[0])).toEqual(["hero", "services", "about", "results", "reviews", "how", "faq", "cta", "footer"]);
  });

  it("ArrowUp moves a row up, but never above the pinned hero", () => {
    const { onReorder } = mount();
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag ABOUT" }), { key: "ArrowUp" });
    expect(onReorder).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("button", { name: "Drag SERVICES" }), { key: "ArrowUp" });
    expect(keysOf(onReorder.mock.calls[0])[1]).toBe("services");
  });

  it("the last movable row can't go below the pinned footer", () => {
    const { onReorder } = mount();
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag CTA" }), { key: "ArrowDown" });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("hero and footer have no drag handle and no on/off switch", () => {
    mount();
    expect(screen.queryByRole("button", { name: "Drag HERO" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Drag FOOTER" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Show HERO" })).toBeNull();
    expect(screen.getAllByText("Always on")).toHaveLength(2);
  });

  it("other sections have an accessible switch that reports changes", () => {
    const { onToggle } = mount();
    const sw = screen.getByRole("switch", { name: "Show FAQ" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    expect(onToggle).toHaveBeenCalledWith("faq", false);
  });
});
