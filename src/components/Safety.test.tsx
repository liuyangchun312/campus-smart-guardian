import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Safety from "./Safety";
import { SAFETY_TEMPLATES, createInspection, transitionInspection } from "../lib/safety";
import type { Inspection } from "../lib/safety";

const initial = createInspection({ templateId: "cleaning", site: "测试地点", inspector: "测试人员", notes: "", answers: Object.fromEntries(SAFETY_TEMPLATES[0].checks.map(({ id }) => [id, "passed"])), ratings: { severity: 4, occurrence: 1, detection: 1 } });
const reviewing = transitionInspection(transitionInspection({ ...initial, id: "review-record", site: "待复核地点" }, { type: "plan", plan: { owner: "责任人", dueDate: "2099-01-01", action: "核验通风措施", control: "engineering" } }), { type: "submit-review", evidence: "现场核验记录" });
const closed = transitionInspection(transitionInspection(reviewing, { type: "review", review: { reviewer: "复核人", evidence: "复核依据", residualRatings: { severity: 1, occurrence: 1, detection: 1 }, criticalResolved: true } }), { type: "close" });
const records: Inspection[] = [initial, reviewing, { ...closed, id: "closed-record", site: "已闭环地点" }];

function render(selectedId: string | null, filter: "all" | "high" | "review" = "all") {
  return renderToStaticMarkup(<Safety inspections={records} onChange={() => {}} notify={() => {}} selectedId={selectedId} onSelect={() => {}} view={{ search: "", filter }} onViewChange={() => {}} />);
}

describe("controlled inspection navigation", () => {
  it("opens the selected inspection instead of a fresh form", () => {
    expect(render(initial.id)).toContain("现场检查记录");
    expect(render(initial.id)).not.toContain("登记现场巡检");
  });
  it("shows an explicit unavailable state for a missing record", () => {
    const markup = render("missing-record");
    expect(markup).toContain("巡检记录不可用");
    expect(markup).not.toContain("登记现场巡检");
  });
  it("filters reviews and high risks while excluding completed records", () => {
    expect(render(null, "review")).toContain("待复核地点");
    expect(render(null, "review")).not.toContain("已闭环地点");
    expect(render(null, "high")).toContain("测试地点");
    expect(render(null, "high")).not.toContain("已闭环地点");
  });
  it("shows the new inspection form only when no record is selected", () => {
    expect(render(null)).toContain("登记现场巡检");
    expect(render(null)).toContain("账号服务数据库");
    expect(render(null)).not.toContain("本机保存");
  });
  it("offers a named delete action in the selected inspection toolbar", () => {
    const toolbar = render(initial.id).match(/<div class="safety-detail-toolbar">([\s\S]*?)<\/div>/)?.[1];
    expect(toolbar).toContain('aria-label="删除巡检记录：测试地点"');
    expect(toolbar).toContain('title="删除巡检记录"');
  });
  it("offers a named delete action for every inspection in the register", () => {
    const markup = render(null);
    for (const site of ["测试地点", "待复核地点", "已闭环地点"]) {
      expect(markup).toContain(`aria-label="删除巡检记录：${site}"`);
    }
  });
});
