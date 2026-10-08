import { statusLabels } from "../lib/orders";
import { formatDate } from "../lib/storage";
import type { WorkOrder } from "../types";

export default function OrderHistory({ order }: { order: WorkOrder }) {
  return <div className="timeline"><h3>处理记录</h3>{order.history.map((entry, index) => <div key={`${entry.at}-${index}`}><span /><p>{statusLabels[entry.status]}<small>{formatDate(entry.at, true)} · {entry.actorName ? `${entry.actorRole === "admin" ? "校方" : "用户"}：${entry.actorName}` : index === 0 ? "个人记录" : "历史手动更新"}</small>{entry.note && <small className="order-history-note">{entry.note}</small>}</p></div>)}</div>;
}
