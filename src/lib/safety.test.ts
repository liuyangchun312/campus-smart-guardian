import { describe, expect, it } from "vitest";
import { SAFETY_TEMPLATES, createInspection, getRisk, hasCriticalFailure, inspectionMarkdown, inspectionRisk, isInspections, isOverdue, transitionInspection } from "./safety";
import type { Inspection, Remediation, RiskRatings } from "./safety";

const now = "2026-10-02T06:00:00.000Z";
const ratings: RiskRatings = { severity: 3, occurrence: 3, detection: 3 };
const plan: Remediation = { owner: "张师傅", dueDate: "2026-10-03", action: "更换较低危清洁剂并复核标签及通风", control: "substitution" };
function fixture(overrides: Partial<Inspection> = {}): Inspection {
  return { id: "inspection-1", templateId: "cleaning", site: "北区保洁间", inspector: "李老师", notes: "现场标签缺失", answers: Object.fromEntries(SAFETY_TEMPLATES[0].checks.map(({ id }) => [id, "passed"])), ratings: { ...ratings }, status: "registered", createdAt: now, updatedAt: now, timeline: [{ at: now, status: "registered", note: "完成现场检查" }], ...overrides };
}
const toReview = (row = fixture()) => transitionInspection(transitionInspection(row, { type: "plan", plan }, now), { type: "submit-review", evidence: "已更换药剂，标签和通风现场照片编号 002" }, now);

describe("简化 FMEA 风险排序", () => {
  it("uses product thresholds while retaining the three independent dimensions", () => {
    expect(getRisk({ severity: 2, occurrence: 3, detection: 3 })).toMatchObject({ score: 18, level: "low" });
    expect(getRisk({ severity: 2, occurrence: 2, detection: 5 })).toMatchObject({ score: 20, level: "medium" });
    expect(getRisk({ severity: 2, occurrence: 5, detection: 5 })).toMatchObject({ score: 50, level: "high" });
    expect(getRisk({ severity: 5, occurrence: 5, detection: 5 }).score).toBe(125);
  });
  it("never buries catastrophic low-frequency consequences under a low RPN", () => {
    expect(getRisk({ severity: 5, occurrence: 1, detection: 1 })).toMatchObject({ score: 5, level: "high" });
    expect(getRisk({ severity: 4, occurrence: 1, detection: 1 }).level).toBe("high");
    expect(getRisk({ severity: 1, occurrence: 1, detection: 1 }, true).level).toBe("high");
  });
  it.each([0, -1, 6, 1.5, NaN, Infinity, "3", null, undefined])("rejects an invalid rating %s instead of fabricating a score", (value) => {
    expect(() => getRisk({ ...ratings, severity: value } as RiskRatings)).toThrow("1–5");
  });
  it("critical checklist failure overrides manually low ratings", () => {
    const row = fixture({ ratings: { severity: 1, occurrence: 1, detection: 1 }, answers: { ...fixture().answers, chemical: "failed" } });
    expect(hasCriticalFailure(row)).toBe(true);
    expect(inspectionRisk(row).level).toBe("high");
  });
});

describe("巡检状态机", () => {
  it("requires every checklist item to be inspected, including unknown versus passed", () => {
    expect(() => createInspection({ ...fixture(), answers: { chemical: "passed" } }, now)).toThrow("全部检查项");
    expect(() => createInspection({ ...fixture(), answers: { ...fixture().answers, chemical: "unchecked" } }, now)).toThrow();
    const row = createInspection(fixture(), now);
    expect(row.status).toBe("registered");
    expect(row.id).toBeTruthy();
  });
  it("rejects attempts to jump from registration to review or closure", () => {
    expect(() => transitionInspection(fixture(), { type: "submit-review", evidence: "做完了" }, now)).toThrow("先制定整改计划");
    expect(() => transitionInspection(fixture(), { type: "close" }, now)).toThrow("保存复核结论");
  });
  it("enforces owner, valid deadline and concrete action before remediation", () => {
    for (const invalid of [{ ...plan, owner: " " }, { ...plan, dueDate: "2026-99-99" }, { ...plan, dueDate: "2026-02-30" }, { ...plan, action: "" }]) {
      expect(() => transitionInspection(fixture(), { type: "plan", plan: invalid }, now)).toThrow("责任人");
    }
    const started = transitionInspection(fixture(), { type: "plan", plan }, now);
    expect(() => transitionInspection(started, { type: "submit-review", evidence: "  " }, now)).toThrow("完成情况");
  });
  it("records all stages, keeps initial ratings and uses verified residual risk after review", () => {
    const reviewing = toReview();
    expect(() => transitionInspection(reviewing, { type: "close" }, now)).toThrow("保存复核结论");
    const reviewed = transitionInspection(reviewing, { type: "review", review: { reviewer: "王老师", evidence: "现场检查新标签与通风，记录编号 003", residualRatings: { severity: 2, occurrence: 1, detection: 1 }, criticalResolved: true } }, now);
    const closed = transitionInspection(reviewed, { type: "close" }, now);
    expect(closed.status).toBe("closed");
    expect(closed.ratings).toEqual(ratings);
    expect(inspectionRisk(closed).score).toBe(2);
    expect(closed.timeline.map(({ status }) => status)).toEqual(["registered", "remediating", "review", "review", "closed"]);
    expect(isInspections([closed])).toBe(true);
    expect(() => transitionInspection(closed, { type: "plan", plan }, now)).toThrow("已闭环");
    expect(inspectionMarkdown(closed)).toContain("王老师");
    expect(inspectionMarkdown(closed)).toContain("不是行业统一标准");
  });
  it("saves an explicit no-risk review, preserves it on reload and exports it after closure", () => {
    const reviewed = transitionInspection(toReview(), { type: "review", review: { reviewer: "复核人", evidence: "现场复查未发现问题，记录编号 004", residualRatings: null, criticalResolved: true } }, now);
    const closed = transitionInspection(reviewed, { type: "close" }, now);
    expect(closed.review?.residualRatings).toBeNull();
    expect(closed.ratings).toEqual(ratings);
    expect(inspectionRisk(closed)).toMatchObject({ score: 0, level: "low", label: "无风险（未发现问题）" });
    expect(isInspections(JSON.parse(JSON.stringify([closed])))).toBe(true);
    expect(reviewed.timeline.at(-1)?.note).toContain("无风险（未发现问题）");
    expect(inspectionMarkdown(closed)).toContain("残余风险：无风险（未发现问题）");
    expect(inspectionMarkdown(closed)).toContain("残余 RPN：0");
    expect(inspectionMarkdown(closed)).not.toContain("残余 S/O/D：");
  });
  it("requires evidence and resolution of critical failures for a no-risk review", () => {
    const review = { reviewer: "复核人", evidence: "已现场复查", residualRatings: null, criticalResolved: true };
    for (const invalid of [{ ...review, reviewer: " " }, { ...review, evidence: " " }, { ...review, criticalResolved: false }, { ...review, residualRatings: { severity: 0, occurrence: 0, detection: 0 } }]) {
      expect(() => transitionInspection(toReview(), { type: "review", review: invalid }, now)).toThrow();
    }
    const failed = fixture({ answers: { ...fixture().answers, chemical: "failed" } });
    const reviewing = toReview(failed);
    expect(() => transitionInspection(reviewing, { type: "review", review: { ...review, criticalResolved: false } }, now)).toThrow();
    const reviewed = transitionInspection(reviewing, { type: "review", review }, now);
    expect(transitionInspection(reviewed, { type: "close" }, now).status).toBe("closed");
    expect(isInspections([{ ...reviewed, review: { ...reviewed.review!, criticalResolved: false } }])).toBe(false);
    expect(() => createInspection({ ...fixture(), ratings: null } as unknown as Inspection, now)).toThrow();
  });
  it("blocks closure when severe residual consequences remain or a critical failure is not resolved", () => {
    const severe = transitionInspection(toReview(), { type: "review", review: { reviewer: "复核人", evidence: "后果仍严重", residualRatings: { severity: 4, occurrence: 1, detection: 1 }, criticalResolved: true } }, now);
    expect(() => transitionInspection(severe, { type: "close" }, now)).toThrow("残余风险");
    const failed = fixture({ answers: { ...fixture().answers, chemical: "failed" } });
    const unverified = transitionInspection(toReview(failed), { type: "review", review: { reviewer: "复核人", evidence: "尚未排除混用", residualRatings: { severity: 1, occurrence: 1, detection: 1 }, criticalResolved: false } }, now);
    expect(() => transitionInspection(unverified, { type: "close" }, now)).toThrow("关键检查项");
  });
  it("invalidates old review and completion evidence when returned for more work", () => {
    const reviewed = transitionInspection(toReview(), { type: "review", review: { reviewer: "复核人", evidence: "尚未完成", residualRatings: { severity: 4, occurrence: 1, detection: 1 }, criticalResolved: false } }, now);
    expect(() => transitionInspection(reviewed, { type: "plan", plan }, now)).toThrow("先退回");
    const returned = transitionInspection(reviewed, { type: "return", reason: "重新落实隔离措施" }, now);
    expect(returned.status).toBe("remediating");
    expect(returned.review).toBeUndefined();
    expect(returned.remediation?.completionEvidence).toBeUndefined();
    expect(returned.timeline.at(-1)?.note).toContain("重新落实隔离措施");
    expect(() => transitionInspection(returned, { type: "close" }, now)).toThrow();
  });
});

describe("持久化校验与逾期", () => {
  it("rejects malformed saved data without throwing, including impossible dates", () => {
    const row = fixture();
    for (const value of [null, {}, [null], [{ ...row, ratings: { ...ratings, occurrence: 0 } }], [{ ...row, answers: {} }], [{ ...row, status: "closed" }], [{ ...row, remediation: { ...plan, dueDate: "2026-99-99" } }], [row, row]]) expect(isInspections(value)).toBe(false);
    expect(isInspections([])).toBe(true);
    expect(isInspections([row])).toBe(true);
  });
  it("keeps the due date available all day and excludes closed records", () => {
    const row = transitionInspection(fixture(), { type: "plan", plan }, now);
    expect(isOverdue(row, new Date(2026, 9, 3, 23, 59))).toBe(false);
    expect(isOverdue(row, new Date(2026, 9, 4, 0, 0))).toBe(true);
    expect(isOverdue({ ...row, status: "closed" }, new Date(2026, 9, 5))).toBe(false);
    expect(isOverdue(fixture(), new Date(2026, 9, 5))).toBe(false);
  });
});
