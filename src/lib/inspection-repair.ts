import { createDraftOrder } from "./orders";
import { validateRepairDraft } from "./repair";
import { SAFETY_TEMPLATES, type Inspection } from "./safety";
import type { WorkspaceData } from "./workspace";

export function getRepairFindings(inspection: Inspection) {
  const template = SAFETY_TEMPLATES.find(({ id }) => id === inspection.templateId);
  const failed = template?.checks.filter(({ id }) => inspection.answers[id] === "failed") ?? [];
  return failed.map(({ id, repairLabel }) => ({
    checkId: id,
    label: repairLabel,
    description: `${repairLabel}检查未通过。${failed.length === 1 ? inspection.notes.trim() : ""}`,
  }));
}

export function addInspectionRepairDraft(
  data: WorkspaceData, inspectionId: string, checkId: string, fields: { location: string; description: string },
): WorkspaceData {
  const inspection = data.inspections.find(row => row.id === inspectionId);
  if (!inspection) throw new Error("这条巡检记录已移除。");
  if (inspection.repairLinks?.some(link => link.checkId === checkId)) return data;
  const finding = getRepairFindings(inspection).find(item => item.checkId === checkId);
  if (!finding || inspection.status === "closed") throw new Error("仅未闭环巡检中的不符合项可以生成报修草稿。");
  const errors = validateRepairDraft(fields);
  if (errors.description || errors.location) throw new Error(errors.description || errors.location);
  if (data.orders.length >= 1000) throw new Error("个人工单已达 1000 张，请先归档并清理不再需要的记录。");

  const order = createDraftOrder(fields);
  const updated: Inspection = {
    ...inspection, updatedAt: order.createdAt,
    repairLinks: [...(inspection.repairLinks ?? []), { checkId, orderId: order.id }],
    timeline: [...inspection.timeline, { at: order.createdAt, status: inspection.status, note: `${finding.label}已生成报修草稿 ${order.id}` }],
  };
  return { ...data, orders: [order, ...data.orders], inspections: data.inspections.map(row => row.id === inspection.id ? updated : row) };
}

export function removePersonalOrder(data: WorkspaceData, orderId: string, keepSchoolLink: boolean): WorkspaceData {
  const orders = data.orders.filter(row => row.id !== orderId);
  if (keepSchoolLink) return { ...data, orders };
  const at = new Date().toISOString();
  const inspections = data.inspections.map(row => {
    if (!row.repairLinks?.some(link => link.orderId === orderId)) return row;
    return {
      ...row, updatedAt: at, repairLinks: row.repairLinks.filter(link => link.orderId !== orderId),
      timeline: [...row.timeline, { at, status: row.status, note: `已删除个人报修草稿 ${orderId}` }],
    };
  });
  return { ...data, orders, inspections };
}
