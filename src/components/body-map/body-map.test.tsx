// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BodyMap } from "./body-map";

describe("BodyMap", () => {
  it("mounts two BodyChart SVGs (front + back) and unmounts cleanly", () => {
    const { container, unmount } = render(<BodyMap state={{ "chest-upper-left": 10 }} />);
    expect(container.querySelectorAll("svg.body-chart-svg")).toHaveLength(2);
    expect(() => unmount()).not.toThrow();
  });

  it("colors the region passed in state and forces dir=ltr regardless of page direction", () => {
    document.documentElement.dir = "rtl";
    const { container } = render(<BodyMap state={{ "chest-upper-left": 10 }} />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute("dir", "ltr");
    const path = container.querySelector('path[aria-label*="chest-upper-left"], path[aria-label*="intensity 10"]');
    expect(path).not.toBeNull();
    document.documentElement.dir = "";
  });

  it("fires onRegionClick with the latest callback after a rerender", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const { container, rerender } = render(<BodyMap state={{}} onRegionClick={firstHandler} />);
    rerender(<BodyMap state={{}} onRegionClick={secondHandler} />);

    const anyMusclePath = container.querySelector('path[role="button"]');
    expect(anyMusclePath).not.toBeNull();
    fireEvent.click(anyMusclePath!);

    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).not.toHaveBeenCalled();
  });
});
