import { classifyRepair, validateRepairDraft } from "../src/lib/repair.ts";

export function createSchoolOrders({ db, transaction, currentUser, requireAdmin, readJson, send, ErrorType }) {
  db.exec(`CREATE TABLE IF NOT EXISTS school_orders (
    ownerId TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, data TEXT NOT NULL,
    revision INTEGER NOT NULL, submittedAt TEXT NOT NULL, PRIMARY KEY (ownerId, id)
  ); CREATE INDEX IF NOT EXISTS school_orders_submitted ON school_orders(submittedAt);`);
  const matches = (path) => path === "/api/orders" || path.startsWith("/api/orders/") || path === "/api/admin/orders" || path.startsWith("/api/admin/orders/");
  const fail = (status, message) => { throw new ErrorType(status, message); };
  const find = (ownerId, id) => db.prepare("SELECT * FROM school_orders WHERE ownerId=? AND id=?").get(ownerId, id);
  const read = (row) => JSON.parse(row.data);
  const text = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
  const sortOrders = (orders) => orders.sort((a, b) => ({ "特急": 0, "紧急": 1, "普通": 2 }[a.priority] - { "特急": 0, "紧急": 1, "普通": 2 }[b.priority]) || a.school.submittedAt.localeCompare(b.school.submittedAt));
  async function handle(req, res, path) {
    const adminRoute = path.startsWith("/api/admin/orders");
    const actor = adminRoute ? requireAdmin(req) : currentUser(req);
    const respond = (status, body) => { send(res, status, body); return true; };
    if (req.method === "GET" && (path === "/api/orders" || path === "/api/admin/orders")) {
      const rows = adminRoute ? db.prepare("SELECT * FROM school_orders").all() : db.prepare("SELECT * FROM school_orders WHERE ownerId=?").all(actor.id);
      return respond(200, { orders: sortOrders(rows.map(read)) });
    }
    if (req.method === "POST" && path === "/api/orders") {
      const body = await readJson(req);
      currentUser(req);
      const id = text(body.id, 100);
      if (!id) fail(400, "请指定要提交的工单。");
      const existing = find(actor.id, id);
      if (existing) return respond(200, { order: read(existing) });
      const order = transaction(() => {
        const workspace = db.prepare("SELECT data FROM workspaces WHERE userId=?").get(actor.id);
        const draft = workspace && JSON.parse(workspace.data).orders.find((item) => item.id === id);
        if (!draft) fail(404, "没有找到已保存的报修草稿，请先保存并同步。");
        if (!["draft", "submitted"].includes(draft.status)) fail(409, "已归档的历史工单不能直接提交，请新建报修。");
        const errors = validateRepairDraft(draft);
        if (errors.description || errors.location) fail(400, errors.description || errors.location);
        if (db.prepare("SELECT COUNT(*) AS n FROM school_orders WHERE ownerId=?").get(actor.id).n >= 1000) fail(400, "已达到账号工单容量，请联系校方。");
        const now = new Date().toISOString();
        const assessment = classifyRepair(draft.description);
        const result = {
          id, category: draft.category, location: draft.location.trim(), description: draft.description.trim(),
          priority: assessment.priority === "特急" ? "特急" : draft.priority, safety: assessment.safety,
          status: "submitted", createdAt: draft.createdAt,
          school: { ownerId: actor.id, ownerName: actor.name, ownerUsername: actor.username, submittedAt: now, revision: 1, assignee: "" },
          history: [{ status: "submitted", at: now, actorName: actor.name, actorRole: actor.role, note: "已提交给学校，等待受理" }],
        };
        db.prepare("INSERT INTO school_orders VALUES (?, ?, ?, ?, ?)").run(actor.id, id, JSON.stringify(result), 1, now);
        return result;
      });
      return respond(201, { order });
    }
    if (req.method === "PATCH") {
      const parts = path.slice(adminRoute ? "/api/admin/orders/".length : "/api/orders/".length).split("/");
      let ownerId, id;
      try {
        if (parts.length !== (adminRoute ? 2 : 1)) fail(400, "工单地址不正确。");
        ownerId = adminRoute ? decodeURIComponent(parts[0]) : actor.id;
        id = decodeURIComponent(parts[adminRoute ? 1 : 0]);
      } catch { fail(400, "工单地址不正确。"); }
      const body = await readJson(req);
      if (adminRoute) requireAdmin(req); else currentUser(req);
      const allowed = adminRoute ? ["accept", "start", "complete"] : ["confirm", "reopen"];
      if (!allowed.includes(body.action)) fail(403, "您没有权限执行此工单操作。");
      const order = transaction(() => {
        const row = find(ownerId, id);
        if (!row) fail(404, "工单不存在或不属于当前账号。");
        if (!Number.isSafeInteger(body.revision) || row.revision !== body.revision) fail(409, "工单已更新，请刷新后重试。");
        const current = read(row);
        const transitions = { accept: { from: ["submitted"], to: "accepted" }, start: { from: ["accepted"], to: "processing" }, complete: { from: ["processing"], to: "awaiting_confirmation" }, confirm: { from: ["awaiting_confirmation"], to: "resolved" }, reopen: { from: ["awaiting_confirmation", "resolved"], to: "processing" } };
        const transition = transitions[body.action];
        if (!transition.from.includes(current.status)) fail(409, "当前工单状态不能执行此操作，请刷新后检查处理进度。");
        const note = text(body.note ?? "", 3000);
        if (typeof body.note !== "undefined" && (typeof body.note !== "string" || body.note.trim().length > 3000)) fail(400, "处理说明不能超过 3000 个字。");
        const assignee = text(body.assignee, 60);
        if (body.action === "accept" && !assignee) fail(400, "请填写 1–60 个字的维修负责人或班组。");
        if (["complete", "reopen"].includes(body.action) && !note) fail(400, "请填写处理结果或问题未解决的具体情况。");
        const defaultNotes = { accept: "学校已受理", start: "已开始处理", confirm: "用户确认问题已解决" };
        const result = { ...current, status: transition.to, school: { ...current.school, revision: row.revision + 1, ...(body.action === "accept" ? { assignee } : {}) }, history: [...current.history, { status: transition.to, at: new Date().toISOString(), actorName: actor.name, actorRole: actor.role, note: note || defaultNotes[body.action] }] };
        db.prepare("UPDATE school_orders SET data=?, revision=? WHERE ownerId=? AND id=?").run(JSON.stringify(result), result.school.revision, ownerId, id);
        return result;
      });
      return respond(200, { order });
    }
    fail(405, "此接口不支持当前请求方式。");
  }
  return { matches, handle };
}
