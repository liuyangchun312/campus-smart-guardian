import { useState } from "react";
import { ClipboardList, RefreshCw, Search, ArrowRight, Check, Wrench } from "lucide-react";
import Modal from "./Modal";
import OrderHistory from "./OrderHistory";
import { useSchoolOrders } from "../lib/school-orders";
import { filterOrders, statusLabels } from "../lib/orders";
import { formatDate } from "../lib/storage";
import type { OrderStatus, SchoolOrderAction, WorkOrder } from "../types";
import "./orders.css";

const queueStatuses = ["submitted", "accepted", "processing", "awaiting_confirmation", "resolved"] as const;
const queueLabel = (status: OrderStatus) => status === "awaiting_confirmation" ? "待用户确认" : statusLabels[status];
const orderKey = (order: WorkOrder) => `${order.school!.ownerId}:${order.id}`;

export default function SchoolOrderQueue() {
  const service = useSchoolOrders(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | OrderStatus>("open");
  const [priority, setPriority] = useState<"all" | "urgent">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = service.orders.find(order => orderKey(order) === selectedKey);
  const matching = service.orders.filter(order => !search.trim() || `${order.school?.ownerName} ${order.school?.ownerUsername} ${order.id} ${order.location} ${order.description} ${order.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filtered = filterOrders(matching, { search: "", filter, priority });
  const act = async (order: WorkOrder, action: SchoolOrderAction, note: string, assignee: string) => {
    try { await service.act(order, action, { note, assignee }); return true; } catch { return false; }
  };
  return <section className="school-queue orders-page" aria-labelledby="school-queue-heading">
    <div className="school-queue-heading"><div><h2 id="school-queue-heading"><ClipboardList size={20} />校方报修受理</h2><p>收到 {service.orders.length} 张报修，{service.orders.filter(order => order.status !== "resolved").length} 张待完成。</p></div><button className="button outline small" disabled={service.loading || service.busy} onClick={() => void service.refresh()}><RefreshCw size={16} />刷新工单</button></div>
    <div className="school-queue-counts">{queueStatuses.slice(0, 4).map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}><span>{queueLabel(status)}</span><strong>{service.orders.filter(order => order.status === status).length}</strong></button>)}</div>
    <div className="orders-filter-controls"><div className="search-field"><Search size={17} /><input aria-label="搜索校方工单" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索报修人、地点、故障或工单号" /></div><select aria-label="校方工单状态" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="open">未完成</option><option value="all">全部状态</option>{queueStatuses.map(status => <option key={status} value={status}>{queueLabel(status)}</option>)}</select><select aria-label="校方紧急程度" value={priority} onChange={event => setPriority(event.target.value as typeof priority)}><option value="all">全部紧急程度</option><option value="urgent">紧急及特急</option></select></div>
    {service.error && <p className="account-error" role="alert">{service.error}</p>}
    <div className="orders-results" role="status">{service.loading ? "正在读取校方工单…" : `当前显示 ${filtered.length} 张 · 紧急优先，同级按提交时间排序`}</div>
    <div className="orders-records orders-layout-list">
      <div className="orders-table-wrap"><table className="orders-table"><caption className="orders-sr-only">校方报修工单</caption><thead><tr><th scope="col">故障 / 工单号</th><th scope="col">地点 / 报修人</th><th scope="col">办理状态</th><th scope="col">紧急程度</th><th scope="col">提交时间</th><th scope="col">办理</th></tr></thead><tbody>{filtered.map(order => <tr key={orderKey(order)}><td><button className="orders-record-title" onClick={() => setSelectedKey(orderKey(order))}>{order.description}</button><code>{order.id}</code></td><td>{order.location}<small>{order.school?.ownerName} · @{order.school?.ownerUsername}</small></td><td><span className={`status-badge ${order.status}`}>{queueLabel(order.status)}</span><small>{order.school?.assignee || "未安排负责人"}</small></td><td><Priority order={order} /></td><td>{formatDate(order.school!.submittedAt, true)}</td><td><button className="icon-button" aria-label={`办理工单 ${order.id}`} title="办理工单" onClick={() => setSelectedKey(orderKey(order))}><ArrowRight size={17} /></button></td></tr>)}</tbody></table></div>
      <div className="orders-card-list">{filtered.map(order => <article className="order-card" key={orderKey(order)}><div className="order-card-top"><span className={`status-badge ${order.status}`}>{queueLabel(order.status)}</span><Priority order={order} /></div><h3>{order.description}</h3><p>{order.location}</p><p>{order.school?.ownerName} · {order.school?.assignee || "未安排负责人"}</p><div className="order-card-footer"><code>{order.id}</code><button className="text-button accent" onClick={() => setSelectedKey(orderKey(order))}>查看并办理<ArrowRight size={15} /></button></div></article>)}</div>
    </div>
    {!filtered.length && !service.loading && !service.error && <div className="school-queue-empty"><ClipboardList size={28} /><p>{service.orders.length ? "没有符合条件的工单" : "暂无用户提交的报修工单"}</p></div>}
    {selected && <Modal title="校方工单办理" onClose={() => setSelectedKey(null)}><div className="detail-meta"><code>{selected.id}</code><span className={`status-badge ${selected.status}`}>{queueLabel(selected.status)}</span></div><dl className="order-details"><dt>报修人</dt><dd>{selected.school?.ownerName} · @{selected.school?.ownerUsername}</dd><dt>地点</dt><dd>{selected.location}</dd><dt>工单类型</dt><dd>{selected.category}</dd><dt>紧急程度</dt><dd>{selected.priority}</dd><dt>故障情况</dt><dd className="full">{selected.description}</dd><dt>作业安全提示</dt><dd className="full safety-detail">{selected.safety}</dd><dt>负责人</dt><dd>{selected.school?.assignee || "待安排"}</dd></dl><OrderHistory order={selected} /><SchoolHandlingForm key={`${orderKey(selected)}:${selected.status}`} order={selected} busy={service.busy} onAction={act} />{service.error && <p className="account-error" role="alert">{service.error}</p>}</Modal>}
  </section>;
}

function Priority({ order }: { order: WorkOrder }) {
  return <span className={`priority-badge ${order.priority === "特急" ? "danger" : order.priority === "紧急" ? "urgent" : ""}`}>{order.priority}</span>;
}

function SchoolHandlingForm({ order, busy, onAction }: { order: WorkOrder; busy: boolean; onAction: (order: WorkOrder, action: SchoolOrderAction, note: string, assignee: string) => Promise<boolean> }) {
  const [assignee, setAssignee] = useState(order.school?.assignee ?? "");
  const [note, setNote] = useState("");
  const action = order.status === "submitted" ? "accept" : order.status === "accepted" ? "start" : order.status === "processing" ? "complete" : null;
  if (!action) return <p className="order-workflow-message">{order.status === "resolved" ? "用户已确认完成，处理记录已归档。" : "处理结果已发送给用户，等待确认；若用户反馈未解决，工单将返回处理中。"}</p>;
  return <form className="order-workflow-actions" onSubmit={async event => { event.preventDefault(); if (await onAction(order, action, note.trim(), assignee.trim())) setNote(""); }}>{action === "accept" && <><label className="field-label" htmlFor="school-assignee">维修负责人或班组 *</label><input id="school-assignee" required maxLength={60} value={assignee} onChange={event => setAssignee(event.target.value)} placeholder="例如：水电维修组 / 王师傅" /></>}<label className="field-label" htmlFor="school-handling-note">{action === "complete" ? "处理结果与现场核验 *" : "办理说明"}</label><textarea id="school-handling-note" required={action === "complete"} maxLength={3000} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder={action === "complete" ? "填写维修措施、处理时间及核验结果" : "可填写受理安排或当前处理情况"} /><button className="button primary" disabled={busy || (action === "accept" && !assignee.trim()) || (action === "complete" && !note.trim())} type="submit">{action === "start" ? <Wrench size={16} /> : <Check size={16} />}{busy ? "正在保存…" : action === "accept" ? "受理并安排负责人" : action === "start" ? "开始处理" : "完成处理，通知用户确认"}</button></form>;
}
