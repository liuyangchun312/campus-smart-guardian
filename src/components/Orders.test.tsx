import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Orders from "./Orders";
import type { WorkOrder } from "../types";

const draft: WorkOrder = { id: "BX-TEST", status: "draft", category: "水电与暖通", location: "北区201室", description: "洗手池水管持续漏水", priority: "紧急", safety: "注意防滑", createdAt: "2026-10-08T00:00:00Z", history: [] };
const official = (status: WorkOrder["status"]): WorkOrder => ({ ...draft, status, school: { ownerId: "user1", ownerName: "报修人", ownerUsername: "user1", submittedAt: draft.createdAt, revision: 1, assignee: "维修组" }, history: [{ status, at: draft.createdAt, actorRole: "admin", actorName: "校方人员", note: "已安排维修组处理" }] });
const render = (order: WorkOrder) => renderToStaticMarkup(<Orders orders={[order]} selectedId={order.id} onSelect={() => {}} view={{ search: "", filter: "all", priority: "all", layout: "list" }} onViewChange={() => {}} onAction={async () => true} onDelete={() => {}} onCreate={() => {}} notify={() => {}} busy={false} loading={false} error="" onRefresh={() => {}} />);

describe("用户校方工单操作", () => {
  it("offers explicit submission for private drafts and legacy submitted records", () => {
    expect(render(draft)).toContain("提交给学校");
    expect(render({ ...draft, status: "submitted" })).toContain("尚未进入本站校方队列");
  });
  it("keeps official processing records read-only for users", () => {
    const markup = render(official("processing"));
    expect(markup).toContain("维修组");
    expect(markup).toContain("校方：校方人员");
    expect(markup).not.toContain("删除工单");
    expect(markup).not.toContain("确认问题已解决");
    expect(markup).not.toContain('id="order-status"');
  });
  it("offers confirmation and a specific feedback form only after school completion", () => {
    const markup = render(official("awaiting_confirmation"));
    expect(markup).toContain("确认问题已解决");
    expect(markup).toContain("反馈并继续处理");
    expect(markup).toContain("已安排维修组处理");
  });
});
