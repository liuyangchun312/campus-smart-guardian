import { useMemo, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  Copy,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Modal from "./Modal";
import { formatDate } from "../lib/storage";
import type { OrderStatus, WorkOrder } from "../types";

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
}: {
  orders: WorkOrder[];
  onUpdate: (id: string, status: OrderStatus) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  notify: (value: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = orders.find((order) => order.id === selectedId);
  const filtered = useMemo(
    () =>
      orders.filter(
        (order) =>
          (filter === "all" || order.status === filter) &&
          `${order.id}${order.location}${order.description}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [orders, filter, search],
  );
  const copy = async (order: WorkOrder) => {
    try {
      await navigator.clipboard.writeText(orderText(order));
      notify("工单已复制，请通过学校正式报修渠道提交");
    } catch {
      notify("复制失败，请打开工单详情并手动复制文字");
    }
  };
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <span className="eyebrow">每件小事，都有记录</span>
          <h1>
            我的工单 <ClipboardList size={25} />
          </h1>
          <p>管理您的账号报修记录，及时跟进您关心的事情。</p>
        </div>
        <button className="button primary small" onClick={onCreate}>
          <Plus size={16} />
          新建报修
        </button>
      </div>
      <div className="inline-notice">
        <ShieldCheck size={19} />
        <p>
          这里的记录归属当前账号，保存在本机服务。提交和解决状态由您手动更新，未连接学校派单系统。
        </p>
      </div>
      <div className="orders-toolbar">
        <div className="filter-tabs" aria-label="工单状态筛选">
          {[
            { id: "all", label: "全部工单" },
            { id: "draft", label: "待提交" },
            { id: "submitted", label: "已提交" },
            { id: "resolved", label: "已解决" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={filter === tab.id ? "active" : ""}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              <span>
                {
                  orders.filter(
                    (order) => tab.id === "all" || order.status === tab.id,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索工单"
            placeholder="搜索地点、故障或工单号"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="order-list">
        {filtered.length === 0 ? (
          <div className="empty-state panel">
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
          </div>
        ) : (
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
                <time>{formatDate(order.createdAt, true)}</time>
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
                    onClick={() => setSelectedId(order.id)}
                  >
                    查看详情
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      {selected && (
        <Modal title="报修工单详情" onClose={() => setSelectedId(null)}>
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
                    {i === 0 ? "本地保存" : "您手动更新"}
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
                  window.confirm("确定删除这张本地工单吗？删除后无法恢复。")
                ) {
                  onDelete(selected.id);
                  setSelectedId(null);
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
    </div>
  );
}
