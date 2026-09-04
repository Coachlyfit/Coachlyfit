// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const usePathnameMock = vi.fn();
const useSearchParamsMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

import { NavigationProgress } from "./navigation-progress";

describe("NavigationProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePathnameMock.mockReturnValue("/dashboard");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a hidden bar with role=progressbar when idle", () => {
    render(<NavigationProgress />);
    const bar = screen.getByRole("progressbar", { hidden: true });
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar.dataset.state).toBe("idle");
  });

  it("shows the bar once the pathname changes after mount, past the debounce delay", () => {
    const { rerender } = render(<NavigationProgress />);
    usePathnameMock.mockReturnValue("/clients");
    rerender(<NavigationProgress />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const bar = screen.getByRole("progressbar", { hidden: true });
    expect(bar.dataset.state).toBe("loading");
  });
});
