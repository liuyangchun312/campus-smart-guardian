import { describe, expect, it } from "vitest";
import { createInspection, isInspections, SAFETY_TEMPLATES } from "./safety";
import type { Inspection } from "./safety";
import type { WorkspaceData } from "./workspace";
import { addInspectionRepairDraft, getRepairFindings, removePersonalOrder } from "./inspection-repair";

const template = SAFETY_TEMPLATES.find(({ id }) => id === "electrical")!;
const inspection = createInspection({
  templateId: template.id, site: "教学楼二楼走廊", inspector: "巡检员", notes: "墙边插座外壳破损。",
  answers: Object.fromEntries(template.checks.map(({ id }) => [id, id === "cable" ? "failed" : "passed"])),
  ratings: { severity: 3, occurrence: 2, detection: 2 },
});
const empty: WorkspaceData = { inspections: [inspection], orders: [], messages: [] };
const fields = { location: "教学楼二楼东走廊", description: "墙边第二个插座的外壳破损。" };
const create = (data = empty) => addInspectionRepairDraft(data, inspection.id, "cable", fields);

describe("巡检发现与报修草稿", () => {
  it("prefills the selected issue and reuses the on-site note only when it is unambiguous", () => {
    const findings = getRepairFindings(inspection);
    expect(findings.map(({ checkId }) => checkId)).toEqual(["cable"]);
    expect(findings[0].description).toContain("插座外壳破损");
    const several = getRepairFindings({ ...inspection, answers: { ...inspection.answers, access: "failed" } });
    expect(several.map(({ checkId }) => checkId)).toEqual(["cable", "access"]);
    expect(several[1].description).not.toContain(inspection.notes);
  });
  it("saves the reviewed fields, private draft and source together, and reuses the order on retry", () => {
    const next = create();
    const order = next.orders[0];
    expect(order).toMatchObject({ ...fields, status: "draft" });
    expect(order.school).toBeUndefined();
    expect(next.inspections[0].repairLinks).toEqual([{ checkId: "cable", orderId: order.id }]);
    expect(isInspections(next.inspections)).toBe(true);
    expect(create(next)).toBe(next);
    expect(inspection.repairLinks).toBeUndefined();
  });
  it("rejects a passed check, closed inspection, invalid input and a full workspace without losing records", () => {
    expect(() => addInspectionRepairDraft(empty, inspection.id, "access", fields)).toThrow();
    expect(() => create({ ...empty, inspections: [{ ...inspection, status: "closed" }] })).toThrow();
    expect(() => addInspectionRepairDraft(empty, inspection.id, "cable", { ...fields, description: "短" })).toThrow();
    const full = { ...empty, orders: Array(1000).fill(create().orders[0]) };
    expect(() => create(full)).toThrow();
    expect(full.orders).toHaveLength(1000);
  });
  it("releases a deleted private draft but retains the inspection trace of a hidden official order", () => {
    const saved = create();
    const id = saved.orders[0].id;
    const afterDeletion = removePersonalOrder(saved, id, false);
    expect(afterDeletion.orders).toHaveLength(0);
    expect(afterDeletion.inspections[0].repairLinks ?? []).toHaveLength(0);
    expect(create(afterDeletion).orders[0].id).not.toBe(id);
    const hidden = removePersonalOrder(saved, id, true);
    expect(hidden.orders).toHaveLength(0);
    expect(create(hidden)).toBe(hidden);
    expect(hidden.inspections[0].repairLinks?.[0].orderId).toBe(id);
  });
  it("disallows ambiguous or malformed source links while accepting legacy inspection records", () => {
    const valid = create().inspections[0];
    expect(isInspections([inspection])).toBe(true);
    for (const repairLinks of [
      [{ checkId: "access", orderId: "BX-1" }],
      [{ checkId: "cable", orderId: "" }],
      [{ checkId: "cable", orderId: "BX-1" }, { checkId: "cable", orderId: "BX-2" }],
    ]) {
      expect(isInspections([{ ...inspection, repairLinks }])).toBe(false);
    }
    const other: Inspection = { ...valid, id: "another-inspection" };
    expect(isInspections([valid, other])).toBe(false);
  });
});
