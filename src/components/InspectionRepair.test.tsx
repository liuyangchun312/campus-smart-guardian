import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Inspection } from "../lib/safety";
import type { WorkOrder } from "../types";
import InspectionRepair from "./InspectionRepair";

const inspection: Inspection = {
  id: "inspection-1", templateId: "cleaning", site: "图书馆三楼", inspector: "值班员", notes: "西侧走廊地面有积水。",
  answers: { chemical: "passed", isolation: "failed", storage: "passed", protection: "passed" },
  ratings: { severity: 2, occurrence: 2, detection: 2 }, status: "registered",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  timeline: [{ status: "registered", at: "2026-01-01T00:00:00Z", note: "完成巡检登记" }],
};
const draft: WorkOrder = {
  id: "BX-123", location: inspection.site, description: inspection.notes, category: "环境与卫生", priority: "普通",
  safety: "注意防滑", status: "draft", createdAt: inspection.createdAt,
  history: [{ status: "draft", at: inspection.createdAt }],
};
const linked = { ...inspection, repairLinks: [{ checkId: "isolation", orderId: draft.id }] };
const official: WorkOrder = {
  ...draft, status: "awaiting_confirmation",
  school: { ownerId: "user-1", ownerName: "值班员", ownerUsername: "user1", assignee: "后勤维修组", submittedAt: inspection.createdAt, revision: 6 },
  history: [
    { status: "awaiting_confirmation", at: "2026-01-02T01:00:00Z", actorRole: "admin", actorName: "校方", note: "已设置临时隔离。" },
    { status: "processing", at: "2026-01-02T02:00:00Z", actorRole: "user", actorName: "值班员", note: "排水仍有问题。" },
    { status: "awaiting_confirmation", at: "2026-01-02T03:00:00Z", actorRole: "admin", actorName: "校方", note: "已修复排水口并清理积水。" },
  ],
};

function render(props: Partial<ComponentProps<typeof InspectionRepair>> = {}) {
  return renderToStaticMarkup(<InspectionRepair inspection={inspection} orders={[]} deletedOrderIds={[]}
    onCreateDraft={async () => true} onOpenOrder={() => {}} onUseResult={() => {}}
    loading={false} error="" onRefresh={() => {}} {...props} />);
}

describe("巡检问题关联报修", () => {
  it("prefills editable location and the observation for the failed check", () => {
    const html = render();
    expect(html).toContain(`value="${inspection.site}"`);
    expect(html.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/)?.[1]).toContain(inspection.notes);
    expect(html).toContain("保存报修草稿");
    expect(html).not.toContain("提交给学校</button>");
  });

  it("offers separate choices for multiple failed checks and excludes passing checks", () => {
    const html = render({ inspection: { ...inspection, answers: { ...inspection.answers, storage: "failed" } } });
    expect(html).toMatch(/<option[^>]*value="isolation"/);
    expect(html).toMatch(/<option[^>]*value="storage"/);
    expect(html).not.toMatch(/<option[^>]*value="chemical"/);
  });

  it("hides the panel when all checks passed and no record is linked", () => {
    expect(render({ inspection: { ...inspection, answers: { ...inspection.answers, isolation: "passed" } } })).toBe("");
  });

  it("continues to identify a linked check if its original finding is no longer returned", () => {
    const html = render({ inspection: { ...linked, answers: { ...linked.answers, isolation: "passed" } }, orders: [draft] });
    expect(html).toContain("湿滑区域隔离与提示");
    expect(html).toContain(draft.id);
    expect(html).not.toContain("保存报修草稿");
  });

  it("keeps a linked personal draft distinct from school progress", () => {
    const html = render({ inspection: linked, orders: [draft] });
    expect(html).toContain(draft.id);
    expect(html).toContain("个人草稿");
    expect(html).toContain("待提交学校");
    expect(html).toContain("查看草稿");
    expect(html).not.toContain("办理人");
    expect(html).not.toContain("保存报修草稿");
  });

  it.each(["awaiting_confirmation", "resolved"] as const)("shows the current school result for %s and offers it to remediation", (status) => {
    const html = render({ inspection: { ...linked, status: "remediating" }, orders: [{ ...official, status }] });
    expect(html).toContain(draft.id);
    expect(html).toContain(status === "resolved" ? "已完成" : "待您确认");
    expect(html).toContain("后勤维修组");
    expect(html).toContain("已修复排水口并清理积水。");
    expect(html).not.toContain("已设置临时隔离。");
    expect(html).toContain("填入整改完成说明");
    expect(html).toContain("查看工单");
  });

  it("does not reuse a past completion after the school order reopens", () => {
    const html = render({ inspection: { ...linked, status: "remediating" }, orders: [{ ...official, status: "processing" }] });
    expect(html).toContain("处理中");
    expect(html).not.toContain("已修复排水口并清理积水。");
    expect(html).not.toContain("填入整改完成说明");
  });

  it("keeps closure read-only while retaining access to a linked order", () => {
    const html = render({ inspection: { ...linked, status: "closed" }, orders: [official] });
    expect(html).toContain("查看工单");
    expect(html).not.toContain("填入整改完成说明");
    expect(render({ inspection: { ...inspection, status: "closed" } })).not.toContain("保存报修草稿");
  });

  it("gives deletion precedence over a matching personal copy", () => {
    const html = render({ inspection: linked, orders: [draft], deletedOrderIds: [draft.id] });
    expect(html).toContain(draft.id);
    expect(html).toContain("已从个人工单移除");
    expect(html).not.toContain("查看草稿");
    expect(html).not.toContain("保存报修草稿");
  });

  it("retains the link and a retry action when the order cannot be loaded", () => {
    const html = render({ inspection: linked, error: "校方服务连接超时" });
    expect(html).toContain("校方服务连接超时");
    expect(html).toContain(draft.id);
    expect(html).toContain("刷新进度");
    expect(html).not.toContain("保存报修草稿");
    expect(html).not.toContain("已从个人工单移除");
  });

  it("withholds an unverified result when the school service cannot refresh a cached record", () => {
    const html = render({ inspection: { ...linked, status: "remediating" }, orders: [official], error: "校方服务连接超时" });
    expect(html).toContain("查看关联记录");
    expect(html).toContain("校方服务连接超时");
    expect(html).not.toContain("已修复排水口并清理积水。");
    expect(html).not.toContain("填入整改完成说明");
  });

  it("does not describe an unverified link as a new draft or as deleted", () => {
    for (const loading of [true, false]) {
      const html = render({ inspection: linked, loading });
      expect(html).toContain(draft.id);
      expect(html).toContain(loading ? "正在读取" : "暂时无法查看");
      expect(html).not.toContain("已从个人工单移除");
      expect(html).not.toContain("保存报修草稿");
    }
  });
});
