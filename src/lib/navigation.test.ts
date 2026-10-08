import { describe, expect, it } from "vitest";
import { parseWorkspaceRoute, workspaceHash } from "./navigation";

describe("workspace record navigation", () => {
  it("opens the record encoded in a link without losing special characters", () => {
    expect(parseWorkspaceRoute("#orders?record=BX%2F12%20%26%202&filter=open", "user"))
      .toEqual({ page: "orders", recordId: "BX/12 & 2", filter: "open" });
  });

  it("builds a shareable inspection link with its filter", () => {
    expect(workspaceHash({ page: "safety", recordId: "XC-123", filter: "overdue" }))
      .toBe("#safety?record=XC-123&filter=overdue");
  });

  it("keeps legacy page links working", () => {
    expect(parseWorkspaceRoute("#operations", "user")).toEqual({ page: "operations" });
    expect(parseWorkspaceRoute("#orders?filter=urgent", "user"))
      .toEqual({ page: "orders", filter: "urgent" });
  });

  it("rejects filters from another record page and control characters in IDs", () => {
    expect(parseWorkspaceRoute("#orders?record=%0A&filter=overdue", "user"))
      .toEqual({ page: "orders" });
    expect(workspaceHash({ page: "home", recordId: "BX-1", filter: "open" }))
      .toBe("#home");
  });

  it("handles malformed and unknown links without granting administrator access", () => {
    expect(parseWorkspaceRoute("#bad%ZZ?record=x", "user")).toEqual({ page: "home" });
    expect(parseWorkspaceRoute("#admin", "user")).toEqual({ page: "home" });
    expect(parseWorkspaceRoute("#admin", "admin")).toEqual({ page: "admin" });
  });
});
