import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../types";
import type { Inspection } from "./safety";
import { csvCell, distribution, localDateKey, operationsCsv, pendingTasks, periodStart, recordsInPeriod, summarizeOperations, toCsv } from "./operations";

const order = (overrides: Partial<WorkOrder> = {}): WorkOrder => ({
  id: "WO-1", category: "水电与暖通", location: "教学楼", description: "水龙头漏水",
  priority: "普通", safety: "请保持地面干燥", status: "draft",
  createdAt: new Date(2026, 9, 2, 10).toISOString(), history: [], ...overrides,
});
const inspection = (overrides: Partial<Inspection> = {}): Inspection => ({
  id: "INSP-1", templateId: "cleaning", site: "教学楼", inspector: "检查人", notes: "现场备注",
  answers: { chemical: "passed", isolation: "failed", storage: "passed", protection: "passed" },
  ratings: { severity: 2, occurrence: 2, detection: 2 }, status: "remediating",
  createdAt: new Date(2026, 8, 20, 10).toISOString(), updatedAt: new Date(2026, 8, 20, 10).toISOString(),
  remediation: { owner: "责任人", dueDate: "2026-10-01", action: "完善隔离措施", control: "engineering" },
  timeline: [], ...overrides,
});

describe("运营记录的日期范围", () => {
  const now = new Date(2026, 9, 2, 15, 0);

  it("uses local calendar days and includes today in the last seven days", () => {
    const firstDay = new Date(2026, 8, 26, 0, 0);
    expect(periodStart("7", now)).toEqual(firstDay);
    const rows = [
      order({ id: "before", createdAt: new Date(firstDay.getTime() - 1).toISOString() }),
      order({ id: "start", createdAt: firstDay.toISOString() }),
      order({ id: "now", createdAt: now.toISOString() }),
      order({ id: "future", createdAt: new Date(now.getTime() + 1).toISOString() }),
      order({ id: "invalid", createdAt: "not-a-date" }),
    ];
    expect(recordsInPeriod(rows, "7", now).map((row) => row.id)).toEqual(["start", "now"]);
  });

  it("crosses month and year boundaries without fixed 24-hour assumptions", () => {
    expect(localDateKey(periodStart("30", new Date(2026, 0, 12, 23))!)).toBe("2025-12-14");
    expect(periodStart("all", now)).toBeNull();
    expect(recordsInPeriod([order({ createdAt: "2020-01-01T00:00:00Z" })], "all", now)).toHaveLength(1);
  });

  it("does not mutate the caller's clock", () => {
    const before = now.getTime();
    periodStart("7", now);
    expect(now.getTime()).toBe(before);
  });
});

describe("工单分布", () => {
  it("has finite zero values for an empty dataset", () => {
    expect(distribution([], "category")).toEqual([]);
    expect(distribution([], "priority")).toEqual([
      { label: "特急", count: 0, percentage: 0 },
      { label: "紧急", count: 0, percentage: 0 },
      { label: "普通", count: 0, percentage: 0 },
    ]);
  });

  it("groups real records and computes percentages using the current cohort", () => {
    const rows = [order(), order({ category: "校园环境", priority: "紧急" }), order()];
    expect(distribution(rows, "category")[0]).toEqual({ label: "水电与暖通", count: 2, percentage: 67 });
    expect(distribution(rows, "priority")[1]).toEqual({ label: "紧急", count: 1, percentage: 33 });
  });
});

describe("待办与完成率口径", () => {
  const now = new Date(2026, 9, 2, 15, 0);
  it("reports no denominator as null instead of a misleading 0%", () => {
    const summary = summarizeOperations([], [], "7", now);
    expect(summary.orderClosureRate).toBeNull();
    expect(summary.inspectionClosureRate).toBeNull();
    expect(summary.openOrders).toBe(0);
    expect(summary.overdueInspections).toBe(0);
  });

  it("keeps old unresolved records in backlog when the cohort excludes them", () => {
    const rows = [order({ id: "old", priority: "紧急", createdAt: new Date(2026, 7, 1).toISOString() }), order({ status: "resolved" })];
    const summary = summarizeOperations(rows, [inspection()], "7", now);
    expect(summary.openOrders).toBe(1);
    expect(summary.urgentOrders).toBe(1);
    expect(summary.overdueInspections).toBe(1);
    expect(summary.scopedOrders).toHaveLength(1);
    expect(summary.scopedInspections).toHaveLength(0);
    expect(summary.orderClosureRate).toBe(100);
  });

  it("does not count resolved orders, closed inspections or today's deadline as overdue", () => {
    const rows = [
      inspection({ id: "closed", status: "closed" }),
      inspection({ id: "today", remediation: { ...inspection().remediation!, dueDate: "2026-10-02" } }),
      inspection({ id: "review", status: "review" }),
      inspection({ id: "unscheduled", status: "registered", remediation: undefined }),
    ];
    const summary = summarizeOperations([order({ status: "resolved", priority: "特急" })], rows, "all", now);
    expect(summary.openOrders).toBe(0);
    expect(summary.urgentOrders).toBe(0);
    expect(summary.overdueInspections).toBe(1);
    expect(summary.inspectionClosureRate).toBe(25);
  });

  it("places high-priority hazards ahead of normal overdue records and excludes closed items", () => {
    const tasks = pendingTasks([order({ id: "closed", status: "resolved" }), order()], [inspection(), inspection({ id: "high", ratings: { severity: 5, occurrence: 1, detection: 1 } })], now);
    expect(tasks.map((task) => task.key)).toEqual(["inspection-high", "inspection-INSP-1", "order-WO-1"]);
    expect(tasks[0].alert).toBe(true);
  });

  it("preserves original record IDs for direct links, including IDs shared by both record types", () => {
    const tasks = pendingTasks([order({ id: "shared/id #1" })], [inspection({ id: "shared/id #1" })], now);
    expect(tasks.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: "shared/id #1", type: "inspection" },
      { id: "shared/id #1", type: "order" },
    ]);
  });

  it("keeps priority and oldest-first ordering while excluding completed and future records", () => {
    const tasks = pendingTasks([
      order({ id: "normal" }),
      order({ id: "urgent", priority: "紧急" }),
      order({ id: "critical-new", priority: "特急" }),
      order({ id: "critical-old", priority: "特急", createdAt: new Date(2026, 8, 1).toISOString() }),
      order({ id: "done", status: "resolved", priority: "特急" }),
      order({ id: "future", createdAt: new Date(2026, 9, 3).toISOString() }),
    ], [
      inspection({ id: "high", ratings: { severity: 5, occurrence: 1, detection: 1 } }),
      inspection({ id: "overdue" }),
      inspection({ id: "review", status: "review" }),
      inspection({ id: "closed", status: "closed" }),
    ], now);
    expect(tasks.map((task) => task.id)).toEqual(["critical-old", "high", "critical-new", "overdue", "review", "urgent", "normal"]);
  });

  it("counts all historical inspections awaiting review for the home action", () => {
    const summary = summarizeOperations([], [
      inspection({ id: "review", status: "review" }),
      inspection({ id: "closed", status: "closed" }),
      inspection({ id: "future", status: "review", createdAt: new Date(2026, 9, 3).toISOString() }),
    ], "7", now);
    expect(summary.reviewInspections).toBe(1);
    expect(summary.scopedInspections).toHaveLength(0);
  });
});

describe("CSV 导出", () => {
  it("exports the no-risk review as zero while retaining its original risk score", () => {
    const now = new Date(2026, 9, 2, 15);
    const row = inspection({ status: "closed", review: { reviewer: "复核人", evidence: "现场复查未发现问题", residualRatings: null, criticalResolved: true, at: now.toISOString() } });
    const csv = operationsCsv([], [row], "all", now);
    expect(csv).toContain('"无风险（未发现问题）"');
    expect(csv).toContain('"8","0"');
  });
  it("escapes commas, quotes and multiline details", () => {
    expect(csvCell('a,b"c\nd')).toBe('"a,b""c\nd"');
    expect(toCsv([["地点", "描述"], ["宿舍", "门锁松动"]])).toBe('\uFEFF"地点","描述"\r\n"宿舍","门锁松动"\r\n');
  });

  it("neutralizes spreadsheet formulas, including prefixes hidden after whitespace", () => {
    for (const value of ["=HYPERLINK(\"bad\")", "+1+1", "-1+1", "@SUM(A1)", "   =1", "\ttext", "\r=1", "\n+1"]) {
      expect(csvCell(value).startsWith('"\'')).toBe(true);
    }
    expect(csvCell("报修：=符号在正文中")).toBe('"报修：=符号在正文中"');
  });

  it("exports only the selected creation cohort with its scope and snapshot", () => {
    const now = new Date(2026, 9, 2, 15);
    const csv = operationsCsv([order({ description: "=1+1" })], [inspection()], "7", now);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain("2026-09-26 至 2026-10-02");
    expect(csv).toContain(now.toISOString());
    expect(csv).not.toContain("INSP-1");
    expect(operationsCsv([], [], "all", now).split("\r\n")).toHaveLength(2);
  });
});
