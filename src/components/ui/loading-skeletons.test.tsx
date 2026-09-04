// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TableSkeleton } from "./table-skeleton";
import { CardGridSkeleton } from "./card-grid-skeleton";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { DetailSkeleton } from "./detail-skeleton";

describe("TableSkeleton", () => {
  it("renders the requested number of rows", () => {
    const { container } = render(<TableSkeleton rows={3} columns={2} />);
    expect(container.querySelectorAll("[data-slot=table-skeleton-row]")).toHaveLength(3);
  });

  it("defaults to 6 rows and 4 columns", () => {
    const { container } = render(<TableSkeleton />);
    expect(container.querySelectorAll("[data-slot=table-skeleton-row]")).toHaveLength(6);
    expect(
      container.querySelectorAll("[data-slot=table-skeleton-row]")[0]!.children
    ).toHaveLength(4);
  });
});

describe("CardGridSkeleton", () => {
  it("renders the requested number of cards", () => {
    const { container } = render(<CardGridSkeleton count={4} />);
    expect(container.querySelectorAll("[data-slot=card-grid-skeleton-item]")).toHaveLength(4);
  });
});

describe("DashboardSkeleton", () => {
  it("renders the requested number of stat tiles plus a chart block", () => {
    const { container } = render(<DashboardSkeleton stats={3} />);
    expect(container.querySelectorAll("[data-slot=dashboard-skeleton-stat]")).toHaveLength(3);
    expect(container.querySelector("[data-slot=dashboard-skeleton-chart]")).not.toBeNull();
  });
});

describe("DetailSkeleton", () => {
  it("renders a header block and the requested number of sections", () => {
    const { container } = render(<DetailSkeleton sections={2} />);
    expect(container.querySelector("[data-slot=detail-skeleton-header]")).not.toBeNull();
    expect(container.querySelectorAll("[data-slot=detail-skeleton-section]")).toHaveLength(2);
  });
});
