import type { OrderStatus, Page, WorkOrder } from "../types";

export type WorkspaceRoute = { page: Page; recordId?: string; filter?: string };
export type OrdersViewState = {
  search: string;
  filter: "all" | "open" | OrderStatus;
  priority: "all" | "urgent" | WorkOrder["priority"];
  layout: "list" | "cards";
};
export type InspectionViewState = {
  search: string;
  filter: "all" | "open" | "overdue" | "review" | "high" | "closed";
};

const pages: Page[] = ["home", "operations", "safety", "chat", "repair", "orders", "library", "knowledge", "research", "admin"];
const filters: Partial<Record<Page, readonly string[]>> = {
  orders: ["all", "open", "draft", "submitted", "accepted", "processing", "awaiting_confirmation", "resolved", "urgent"],
  safety: ["all", "open", "overdue", "review", "high", "closed"],
};

function recordOptions(page: Page, recordId?: string | null, filter?: string | null) {
  if (page !== "orders" && page !== "safety") return {};
  return {
    ...(recordId && recordId.trim() && recordId.length <= 100 && !/[\x00-\x1f\x7f]/.test(recordId) ? { recordId } : {}),
    ...(filter && filters[page]?.includes(filter) ? { filter } : {}),
  };
}

export function parseWorkspaceRoute(hash: string, role: "user" | "admin"): WorkspaceRoute {
  const [rawPage, query = ""] = hash.replace(/^#/, "").split("?", 2);
  const page = pages.includes(rawPage as Page) && (rawPage !== "admin" || role === "admin") ? rawPage as Page : "home";
  const params = new URLSearchParams(query);
  return { page, ...recordOptions(page, params.get("record"), params.get("filter")) };
}

export function workspaceHash(route: WorkspaceRoute): string {
  const options = recordOptions(route.page, route.recordId, route.filter);
  const params = new URLSearchParams();
  if (options.recordId) params.set("record", options.recordId);
  if (options.filter) params.set("filter", options.filter);
  return `#${route.page}${params.size ? `?${params}` : ""}`;
}
