import type { OrderStatus, WorkOrder } from "../types";
import { classifyRepair, type RepairDraft } from "./repair";

export function effectiveRepairPriority(assessed: WorkOrder["priority"], selected?: WorkOrder["priority"]) {
  return assessed === "特急" ? assessed : selected ?? assessed;
}

export function createDraftOrder(draft: Omit<RepairDraft, "category"> & { category?: string }): WorkOrder {
  const at = new Date();
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(at).replaceAll("-", "");
  const assessment = classifyRepair(draft.description);
  const createdAt = at.toISOString();
  return {
    id: `BX-${stamp}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    category: draft.category ?? assessment.category, location: draft.location.trim(), description: draft.description.trim(),
    priority: effectiveRepairPriority(assessment.priority, draft.priority), safety: assessment.safety,
    status: "draft", createdAt, history: [{ status: "draft", at: createdAt }],
  };
}

export const statusLabels: Record<OrderStatus, string> = {
  draft: "待提交学校", submitted: "待学校受理", accepted: "学校已受理", processing: "处理中",
  awaiting_confirmation: "待您确认", resolved: "已完成",
};
export function orderStatusLabel(order: WorkOrder) {
  if (!order.school && order.status === "submitted") return "历史记录 · 已自行提交";
  if (!order.school && order.status === "resolved") return "历史记录 · 已标记解决";
  return statusLabels[order.status];
}
export function mergeSchoolOrders(personal: WorkOrder[], school: WorkOrder[], deletedIds: string[] = []) {
  const submittedIds = new Set([...school.map(order => order.id), ...deletedIds]);
  return [...school, ...personal.filter(order => !submittedIds.has(order.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function sortSchoolOrders(orders: WorkOrder[]) {
  const rank = { "特急": 0, "紧急": 1, "普通": 2 };
  return [...orders].sort((a, b) => rank[a.priority] - rank[b.priority] || (a.school?.submittedAt ?? a.createdAt).localeCompare(b.school?.submittedAt ?? b.createdAt));
}

type OrderFilters = {
  search: string;
  filter: "all" | "open" | OrderStatus;
  priority: "all" | "urgent" | WorkOrder["priority"];
};

export function filterOrders(orders: WorkOrder[], view: OrderFilters) {
  const search = view.search.trim().toLowerCase();
  return orders.filter((order) => {
    const statusMatches = view.filter === "all" ||
      (view.filter === "open" ? order.status !== "resolved" : order.status === view.filter);
    const priorityMatches = view.priority === "all" ||
      (view.priority === "urgent" ? order.priority !== "普通" : order.priority === view.priority);
    const searchMatches = [order.id, order.location, order.description, order.category]
      .join(" ").toLowerCase().includes(search);
    return statusMatches && priorityMatches && searchMatches;
  });
}
