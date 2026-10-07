import type { WorkOrder } from "../types";
import { getRisk, hasCriticalFailure, inspectionRisk, isOverdue, SAFETY_TEMPLATES, STATUS_LABELS } from "./safety";
import type { Inspection } from "./safety";

export type RecordPeriod = "7" | "30" | "all";

/** Calendar dates follow the browser's local timezone, matching date inputs. */
export function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function periodStart(period: RecordPeriod, now: Date): Date | null {
  if (period === "all") return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (Number(period) - 1));
  return start;
}

export function recordsInPeriod<T extends { createdAt: string }>(
  records: T[],
  period: RecordPeriod,
  now: Date,
): T[] {
  const start = periodStart(period, now)?.getTime() ?? -Infinity;
  return records.filter(({ createdAt }) => {
    const created = new Date(createdAt).getTime();
    return Number.isFinite(created) && created >= start && created <= now.getTime();
  });
}

export function summarizeOperations(
  orders: WorkOrder[], inspections: Inspection[], period: RecordPeriod, now: Date,
) {
  const allOrders = recordsInPeriod(orders, "all", now);
  const allInspections = recordsInPeriod(inspections, "all", now);
  const scopedOrders = recordsInPeriod(orders, period, now);
  const scopedInspections = recordsInPeriod(inspections, period, now);
  const resolvedOrders = scopedOrders.filter((row) => row.status === "resolved").length;
  const closedInspections = scopedInspections.filter((row) => row.status === "closed").length;
  return {
    allOrders, allInspections, scopedOrders, scopedInspections,
    openOrders: allOrders.filter((row) => row.status !== "resolved").length,
    urgentOrders: allOrders.filter((row) => row.status !== "resolved" && row.priority !== "普通").length,
    overdueInspections: allInspections.filter((row) => isOverdue(row, now)).length,
    openInspections: allInspections.filter((row) => row.status !== "closed").length,
    resolvedOrders, closedInspections,
    orderClosureRate: scopedOrders.length ? Math.round((resolvedOrders / scopedOrders.length) * 100) : null,
    inspectionClosureRate: scopedInspections.length ? Math.round((closedInspections / scopedInspections.length) * 100) : null,
  };
}

export type PendingTask = {
  key: string; type: "order" | "inspection"; title: string; location: string;
  createdAt: string; label: string; alert: boolean; rank: number;
};

export function pendingTasks(orders: WorkOrder[], inspections: Inspection[], now: Date): PendingTask[] {
  const orderTasks: PendingTask[] = recordsInPeriod(orders, "all", now)
    .filter((row) => row.status !== "resolved")
    .map((row) => ({
      key: `order-${row.id}`, type: "order", title: row.description, location: row.location,
      createdAt: row.createdAt, label: `${row.priority} · ${row.status === "draft" ? "待提交" : "已自行提交"}`,
      alert: row.priority !== "普通", rank: row.priority === "特急" ? 0 : row.priority === "紧急" ? 2 : 4,
    }));
  const inspectionTasks: PendingTask[] = recordsInPeriod(inspections, "all", now)
    .filter((row) => row.status !== "closed")
    .map((row) => {
      const risk = inspectionRisk(row);
      const overdue = isOverdue(row, now);
      return {
        key: `inspection-${row.id}`, type: "inspection", title: SAFETY_TEMPLATES.find(({ id }) => id === row.templateId)?.name ?? "安全巡检",
        location: row.site, createdAt: row.createdAt,
        label: overdue ? `整改逾期 · ${row.remediation!.dueDate}` : `${risk.label} · ${STATUS_LABELS[row.status]}`,
        alert: overdue || risk.level === "high", rank: risk.level === "high" ? 0 : overdue ? 1 : row.status === "review" ? 2 : 3,
      };
    });
  return [...orderTasks, ...inspectionTasks].sort((a, b) => a.rank - b.rank || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.key.localeCompare(b.key));
}

export function periodDescription(period: RecordPeriod, now: Date): string {
  const start = periodStart(period, now);
  return start ? `${localDateKey(start)} 至 ${localDateKey(now)}（含今天）` : "全部历史（截至当前）";
}

export function distribution(
  records: WorkOrder[],
  field: "priority" | "category",
): { label: string; count: number; percentage: number }[] {
  const counts = new Map<string, number>();
  if (field === "priority") {
    for (const label of ["特急", "紧急", "普通"]) counts.set(label, 0);
  }
  for (const record of records) {
    const label = record[field] || "未分类";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const result = Array.from(counts, ([label, count]) => ({
    label,
    count,
    percentage: records.length ? Math.round((count / records.length) * 100) : 0,
  }));
  return field === "category"
    ? result.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"))
    : result;
}

/** Quote every cell and neutralize spreadsheet formulas, including whitespace prefixes. */
export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)
    ? `'${text}`
    : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows: (string | number)[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function operationsCsv(orders: WorkOrder[], inspections: Inspection[], period: RecordPeriod, now: Date): string {
  const scope = periodDescription(period, now);
  const capturedAt = now.toISOString();
  const orderLabels = { draft: "待提交学校", submitted: "已自行提交", resolved: "已标记解决" };
  const rows: (string | number)[][] = [[
    "数据类型", "记录编号", "类别/巡检场景", "地点", "描述/备注", "优先级", "当前状态", "创建时间（ISO 8601）",
    "整改责任人", "整改截止日期", "整改措施", "初始RPN", "复核RPN", "创建范围（浏览器本地日期）", "快照时间（ISO 8601）",
  ]];
  for (const row of recordsInPeriod(orders, period, now)) rows.push([
    "报修工单", row.id, row.category, row.location, row.description, row.priority, orderLabels[row.status], row.createdAt,
    "", "", "", "", "", scope, capturedAt,
  ]);
  for (const row of recordsInPeriod(inspections, period, now)) rows.push([
    "安全巡检", row.id, SAFETY_TEMPLATES.find(({ id }) => id === row.templateId)?.name ?? row.templateId,
    row.site, row.notes, inspectionRisk(row).label, STATUS_LABELS[row.status], row.createdAt,
    row.remediation?.owner ?? "", row.remediation?.dueDate ?? "", row.remediation?.action ?? "",
    getRisk(row.ratings, hasCriticalFailure(row)).score, row.review ? getRisk(row.review.residualRatings).score : "", scope, capturedAt,
  ]);
  return toCsv(rows);
}
