import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../types";
import { filterOrders, mergeSchoolOrders, orderStatusLabel, sortSchoolOrders } from "./orders";

const order = (id: string, status: WorkOrder["status"], priority: WorkOrder["priority"]): WorkOrder => ({
  id,
  status,
  priority,
  category: "公共设施",
  location: "北区教学楼201室",
  description: "教室门锁无法正常打开",
  safety: "注意现场安全",
  createdAt: "2026-10-08T00:00:00.000Z",
  history: [],
});
const orders = [order("BX-A", "draft", "普通"), order("BX-B", "submitted", "紧急"), order("BX-C", "resolved", "特急")];

describe("工单筛选", () => {
  it("includes draft and submitted records in the open view", () => {
    expect(filterOrders(orders, { search: "", filter: "open", priority: "all" }).map(({ id }) => id)).toEqual(["BX-A", "BX-B"]);
  });

  it("combines status, urgent priority and normalized search", () => {
    expect(filterOrders(orders, { search: "  bx-b  ", filter: "open", priority: "urgent" }).map(({ id }) => id)).toEqual(["BX-B"]);
    expect(filterOrders(orders, { search: "北区", filter: "all", priority: "urgent" }).map(({ id }) => id)).toEqual(["BX-B", "BX-C"]);
  });

  it("searches the category and supports an exact priority", () => {
    expect(filterOrders(orders, { search: "公共设施", filter: "all", priority: "特急" }).map(({ id }) => id)).toEqual(["BX-C"]);
  });

  it("returns no unrelated records for unmatched filters", () => {
    expect(filterOrders(orders, { search: "不存在的地点", filter: "all", priority: "all" })).toEqual([]);
    expect(filterOrders(orders, { search: "", filter: "draft", priority: "紧急" })).toEqual([]);
  });

  it("uses the official state rather than a duplicate private draft", () => {
    const official = { ...order("BX-A", "processing", "紧急"), school: { ownerId: "user1", ownerName: "测试", ownerUsername: "test", submittedAt: "2026-10-08T01:00:00Z", revision: 3, assignee: "维修组" } };
    expect(mergeSchoolOrders(orders, [official]).find(row => row.id === "BX-A")).toEqual(official);
    expect(filterOrders([official], { search: "", filter: "open", priority: "all" })).toEqual([official]);
    expect(orderStatusLabel(official)).toBe("处理中");
    expect(orderStatusLabel(orders[1])).toContain("历史记录");
  });
  it("keeps urgent official orders ahead of newly updated normal orders", () => {
    const metadata = { ownerId: "user1", ownerName: "测试", ownerUsername: "test", submittedAt: "2026-10-08T01:00:00Z", revision: 1, assignee: "" };
    const normal = { ...order("normal", "accepted", "普通"), school: metadata };
    const urgent = { ...order("urgent", "submitted", "特急"), school: metadata };
    expect(sortSchoolOrders([normal, urgent]).map(item => item.id)).toEqual(["urgent", "normal"]);
  });
});
