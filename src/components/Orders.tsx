import { useMemo } from "react";
import {
  ArrowRight,
  ClipboardList,
  Copy,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Modal from "./Modal";
import { formatDate } from "../lib/storage";
import { filterOrders } from "../lib/orders";
import type { OrdersViewState } from "../lib/navigation";
import { useDeployment } from "../lib/deployment";
import type { OrderStatus, WorkOrder } from "../types";
import "./orders.css";

export const statusLabels: Record<OrderStatus, string> = {
  draft: "待提交学校",
  submitted: "已自行提交",
  resolved: "已标记解决",
};
export const orderText = (order: WorkOrder) =>
  `【报修工单】${order.id}\n【工单类型】${order.category}\n【发生区域】${order.location}\n【故障描述】${order.description}\n【紧急级别】${order.priority}\n【一线作业安全提示】${order.safety}\n【说明】此为用户整理的报修内容，请接收方确认受理。`;

export default function Orders({
  orders,
  onUpdate,
  onDelete,
  onCreate,
  notify,
  selectedId,
  onSelect,
  view,
  onViewChange,
}: {
  orders: WorkOrder[];
  onUpdate: (id: string, status: OrderStatus) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  notify: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view: OrdersViewState;
  onViewChange: (view: OrdersViewState) => void;
}) {
  const { label, storageLabel, description } = useDeployment();
  const selected = orders.find((order) => order.id === selectedId);
  const filtered = useMemo(() => filterOrders(orders, view), [orders, view]);
  const resetFilters = () => onViewChange({ ...view, search: "", filter: "all", priority: "all" });
  const tabs: { id: OrdersViewState["filter"]; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "open", label: "未解决" },
    { id: "draft", label: "待提交" },
    { id: "submitted", label: "已提交" },
    { id: "resolved", label: "已解决" },
  ];
  const copy = async (order: WorkOrder) => {
    try {
      await navigator.clipboard.writeText(orderText(order));
      notify("工单已复制，请通过学校正式报修渠道提交");
    } catch {
      notify("复制失败，请打开工单详情并手动复制文字");
    }
  };
  return (
    <div className="page-enter orders-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">报修记录</span>
          <h1>
            我的工单 <ClipboardList size={25} />
          </h1>
          <p>当前账号共 {orders.length} 张工单，{orders.filter((order) => order.status !== "resolved").length} 张未解决。</p>
        </div>
        <button className="button primary small" onClick={onCreate}>
          <Plus size={16} />
          新建报修
        </button>
      </div>
      <div className="inline-notice" title={description}>
        <ShieldCheck size={19} />
        <p>
          {label} · 记录保存在{storageLabel}。提交和解决状态由您手动更新，未连接学校派单系统。
        </p>
      </div>
      <div className="orders-filters">
        <div className="filter-tabs" role="group" aria-label="工单状态筛选">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={view.filter === tab.id ? "active" : ""}
              aria-pressed={view.filter === tab.id}
              onClick={() => onViewChange({ ...view, filter: tab.id })}
            >
              {tab.label}
              <span>
                {
                  orders.filter(
                    (order) => tab.id === "all" || (tab.id === "open" ? order.status !== "resolved" : order.status === tab.id),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="orders-filter-controls">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索工单"
            placeholder="搜索地点、故障、类型或工单号"
            value={view.search}
            onChange={(event) => onViewChange({ ...view, search: event.target.value })}
          />
        </div>
        <select aria-label="紧急程度筛选" value={view.priority} onChange={(event) => onViewChange({ ...view, priority: event.target.value as OrdersViewState["priority"] })}>
          <option value="all">全部紧急程度</option>
          <option value="urgent">紧急及特急</option>
          <option value="普通">普通</option>
          <option value="紧急">紧急</option>
          <option value="特急">特急</option>
        </select>
        <div className="orders-layout-toggle" role="group" aria-label="工单显示方式">
          <button className={view.layout === "list" ? "active" : ""} aria-label="列表视图" title="列表视图" aria-pressed={view.layout === "list"} onClick={() => onViewChange({ ...view, layout: "list" })}><List size={18} /></button>
          <button className={view.layout === "cards" ? "active" : ""} aria-label="卡片视图" title="卡片视图" aria-pressed={view.layout === "cards"} onClick={() => onViewChange({ ...view, layout: "cards" })}><LayoutGrid size={17} /></button>
        </div>
        </div>
      </div>
      <div className="orders-results" aria-live="polite">显示 {filtered.length} / {orders.length} 张工单</div>
      <div className={`orders-records orders-layout-${view.layout}`}>
        {filtered.length === 0 ? (
          <div className="empty-state orders-empty">
            <span>
              <ClipboardList size={42} strokeWidth={1.3} />
            </span>
            <h2>
              {orders.length ? "没有找到符合条件的工单" : "还没有报修记录"}
            </h2>
            <p>
              {orders.length
                ? "换一个关键词，或查看其他状态的工单。"
                : "遇到设施故障？从一张清楚的工单开始。"}
            </p>
            {orders.length === 0 && (
              <button className="button primary" onClick={onCreate}>
                <Plus size={16} />
                创建第一张工单
              </button>
            )}
            {orders.length > 0 && <button className="button outline" onClick={resetFilters}><X size={16} />清除筛选</button>}
          </div>
        ) : (
          <>
          <div className="orders-table-wrap">
            <table className="orders-table">
              <caption className="orders-sr-only">当前筛选结果，共 {filtered.length} 张报修工单</caption>
              <thead><tr><th scope="col">故障与工单号</th><th scope="col">地点 / 类型</th><th scope="col">跟进状态</th><th scope="col">紧急程度</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead>
              <tbody>{filtered.map((order) => <tr key={order.id}>
                <td><button className="orders-record-title" onClick={() => onSelect(order.id)} title={order.description}>{order.description}</button><code>{order.id}</code></td>
                <td><span className="orders-location">{order.location}</span><small>{order.category}</small></td>
                <td><span className={`status-badge ${order.status}`}>{statusLabels[order.status]}</span></td>
                <td><span className={`priority-badge ${order.priority === "特急" ? "danger" : order.priority === "紧急" ? "urgent" : ""}`}>{order.priority}</span></td>
                <td><time dateTime={order.createdAt}>{formatDate(order.createdAt, true)}</time></td>
                <td><div className="orders-row-actions"><button className="icon-button" title="复制工单" aria-label={`复制工单 ${order.id}`} onClick={() => void copy(order)}><Copy size={16} /></button><button className="icon-button" title="查看详情" aria-label={`查看工单 ${order.id}`} onClick={() => onSelect(order.id)}><ArrowRight size={16} /></button></div></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="orders-card-list">
          {
          filtered.map((order) => (
            <article className="order-card panel" key={order.id}>
              <div className="order-card-top">
                <span className={`status-badge ${order.status}`}>
                  <i />
                  {statusLabels[order.status]}
                </span>
                <span
                  className={`priority-badge ${order.priority === "特急" ? "danger" : order.priority === "紧急" ? "urgent" : ""}`}
                >
                  {order.priority}
                </span>
                <time dateTime={order.createdAt}>{formatDate(order.createdAt, true)}</time>
              </div>
              <div className="order-card-body">
                <span className="order-type-icon">
                  <ClipboardList size={24} />
                </span>
                <div>
                  <h3>{order.description}</h3>
                  <p>
                    <MapPin size={14} />
                    {order.location}
                    <span>·</span>
                    {order.category}
                  </p>
                </div>
              </div>
              <div className="order-card-footer">
                <span>{order.id}</span>
                <div>
                  <button
                    className="text-button"
                    onClick={() => void copy(order)}
                  >
                    <Copy size={14} />
                    复制工单
                  </button>
                  <button
                    className="text-button accent"
                    onClick={() => onSelect(order.id)}
                  >
                    查看详情
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
          </div>
          </>
        )}
      </div>
      {selected && (
        <Modal title="报修工单详情" onClose={() => onSelect(null)}>
          <div className="detail-meta">
            <code>{selected.id}</code>
            <span className={`status-badge ${selected.status}`}>
              {statusLabels[selected.status]}
            </span>
          </div>
          <dl className="order-details">
            <dt>工单类型</dt>
            <dd>{selected.category}</dd>
            <dt>发生区域</dt>
            <dd>{selected.location}</dd>
            <dt>紧急级别</dt>
            <dd>{selected.priority}</dd>
            <dt>故障描述</dt>
            <dd className="full">{selected.description}</dd>
            <dt>作业安全提示</dt>
            <dd className="full safety-detail">{selected.safety}</dd>
          </dl>
          <div className="timeline">
            <h3>处理记录</h3>
            {selected.history.map((entry, i) => (
              <div key={`${entry.at}-${i}`}>
                <span />
                <p>
                  {statusLabels[entry.status]}
                  <small>
                    {formatDate(entry.at, true)} ·{" "}
                    {i === 0 ? `保存于${storageLabel}` : "您手动更新"}
                  </small>
                </p>
              </div>
            ))}
          </div>
          <label className="field-label" htmlFor="order-status">
            更新我的跟进状态
          </label>
          <select
            id="order-status"
            value={selected.status}
            onChange={(event) =>
              onUpdate(selected.id, event.target.value as OrderStatus)
            }
          >
            <option value="draft">待提交学校</option>
            <option value="submitted">我已通过校方渠道自行提交</option>
            <option value="resolved">我确认问题已解决</option>
          </select>
          <div className="modal-actions">
            <button
              className="text-button delete-button"
              onClick={() => {
                if (
                  window.confirm("确定删除这张账号工单吗？删除后无法恢复。")
                ) {
                  onDelete(selected.id);
                  onSelect(null);
                }
              }}
            >
              <Trash2 size={15} />
              删除工单
            </button>
            <button
              className="button primary"
              onClick={() => void copy(selected)}
            >
              <Copy size={16} />
              复制完整工单
            </button>
          </div>
        </Modal>
      )}
      {selectedId !== null && !selected && (
        <Modal title="工单不存在" onClose={() => onSelect(null)}>
          <div className="orders-missing"><ClipboardList size={30} /><p>当前账号中没有找到工单 <code>{selectedId}</code>。记录可能已删除，或链接属于其他账号。</p><button className="button outline" onClick={() => onSelect(null)}>返回工单列表</button></div>
        </Modal>
      )}
    </div>
  );
}
