import type { OrderStatus, WorkOrder } from "../types";

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
