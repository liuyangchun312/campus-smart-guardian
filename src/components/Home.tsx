import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Calculator, CalendarClock, ClipboardCheck, ClipboardList, Clock3, FileSearch, FlaskConical, MessageCircle, Plus, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import type { Page, WorkOrder } from "../types";
import type { Inspection } from "../lib/safety";
import { pendingTasks, summarizeOperations } from "../lib/operations";
import { useDeployment } from "../lib/deployment";
import { formatDate } from "../lib/storage";
import "./workbench.css";

type Props = {
  navigate: (page: Page, options?: { recordId?: string; filter?: string }) => void;
  openRecord: (type: "order" | "inspection", id: string) => void;
  ask: (text: string) => void;
  openTool: (tool: string) => void;
  orders: WorkOrder[];
  inspections: Inspection[];
};

export default function Home({ navigate, openRecord, ask, openTool, orders, inspections }: Props) {
  const { label, storageLabel, description } = useDeployment();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const summary = useMemo(() => summarizeOperations(orders, inspections, "all", now), [orders, inspections, now]);
  const tasks = useMemo(() => pendingTasks(orders, inspections, now), [orders, inspections, now]);
  const activities = [
    ...summary.allOrders.map((item) => ({ id: item.id, title: item.description, site: item.location, at: item.history.at(-1)?.at ?? item.createdAt, type: "order" as const, label: "报修", done: item.status === "resolved" })),
    ...summary.allInspections.map((item) => ({ id: item.id, title: item.site, site: item.inspector || "巡检记录", at: item.updatedAt, type: "inspection" as const, label: "巡检", done: item.status === "closed" })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
  const metrics = [
    { label: "紧急待跟进", value: summary.urgentOrders, icon: TriangleAlert, page: "orders" as Page, filter: "urgent", tone: "danger" },
    { label: "逾期整改", value: summary.overdueInspections, icon: CalendarClock, page: "safety" as Page, filter: "overdue", tone: "warning" },
    { label: "等待复查", value: summary.reviewInspections, icon: ClipboardCheck, page: "safety" as Page, filter: "review", tone: "review" },
    { label: "未解决工单", value: summary.openOrders, icon: ClipboardList, page: "orders" as Page, filter: "open", tone: "normal" },
  ];

  return <div className="workbench-home page-enter">
    <header className="wb-heading">
      <div><h1>工作总览</h1><p className="wb-storage" title={description}><ShieldCheck size={15} /><span>{label} · {storageLabel}</span></p></div>
      <div className="wb-main-actions"><button className="button primary" onClick={() => navigate("repair")}><Plus size={16} />新建报修</button><button className="button secondary" onClick={() => navigate("safety")}><ShieldCheck size={16} />开始安全巡检</button></div>
    </header>

    <section className="wb-metrics" aria-label="当前待办统计">
      {metrics.map((metric) => <button className={`wb-metric ${metric.value ? `is-${metric.tone}` : ""}`} key={metric.label} onClick={() => navigate(metric.page, { filter: metric.filter })} aria-label={`${metric.label} ${metric.value} 条，查看记录`}>
        <span className="wb-metric-label"><metric.icon size={17} />{metric.label}<ArrowUpRight size={15} /></span>
        <span className="wb-metric-value"><strong>{metric.value}</strong><small>条</small></span>
      </button>)}
    </section>

    <section className="wb-queue" aria-labelledby="wb-queue-title">
      <div className="wb-section-heading"><h2 id="wb-queue-title">优先处理<span>{tasks.length} 条待办</span></h2><button className="text-button" onClick={() => navigate("operations")}>运行看板<ArrowRight size={14} /></button></div>
      {tasks.length ? <div className="wb-task-list">{tasks.slice(0, 6).map((task) => <button className="wb-task" key={task.key} onClick={() => openRecord(task.type, task.id)} aria-label={`跟进${task.location}的${task.title}`}>
        <span className={`wb-task-icon ${task.alert ? "is-alert" : ""}`}>{task.type === "order" ? <Wrench size={18} /> : <ShieldCheck size={18} />}</span>
        <span className="wb-task-copy"><strong>{task.title}</strong><small>{task.location} · {task.type === "order" ? "报修" : "巡检"} · {formatDate(task.createdAt)}</small></span>
        <span className={`wb-task-label ${task.alert ? "is-alert" : ""}`}>{task.label}</span><ArrowRight className="wb-row-arrow" size={16} />
      </button>)}</div> : <div className="wb-empty"><ClipboardCheck size={26} strokeWidth={1.5} /><p>{activities.length ? "当前没有待跟进事项" : "暂无待办记录"}</p></div>}
      {tasks.length > 6 && <div className="wb-queue-more"><button className="text-button" onClick={() => navigate("operations")}>查看全部 {tasks.length} 条待办<ArrowRight size={14} /></button></div>}
    </section>

    <section className="wb-recent" aria-labelledby="wb-recent-title">
      <div className="wb-section-heading"><h2 id="wb-recent-title"><Clock3 size={17} />最近记录</h2><div className="wb-record-links"><button className="text-button" onClick={() => navigate("orders")}>全部工单<ArrowUpRight size={14} /></button><button className="text-button" onClick={() => navigate("safety")}>全部巡检<ArrowUpRight size={14} /></button></div></div>
      {activities.length ? <div className="wb-activity-list">{activities.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => openRecord(item.type, item.id)} aria-label={`打开${item.label}记录：${item.title}`}>
        <span className={`wb-record-type ${item.done ? "done" : ""}`}>{item.label}</span><span className="wb-record-copy"><strong>{item.title}</strong><small>{item.site} · {item.done ? "已完成" : "跟进中"}</small></span><time dateTime={item.at}>{formatDate(item.at, true)}</time><ArrowUpRight className="wb-row-arrow" size={14} />
      </button>)}</div> : <div className="wb-empty"><Clock3 size={26} strokeWidth={1.5} /><p>暂无报修或巡检记录</p><button className="text-button accent" onClick={() => navigate("repair")}>新建报修<ArrowRight size={15} /></button></div>}
    </section>

    <section className="wb-tools" aria-labelledby="wb-tools-title"><div className="wb-section-heading"><h2 id="wb-tools-title">常用工具</h2><div className="wb-record-links"><button className="text-button" onClick={() => navigate("knowledge")}><FileSearch size={14} />循证检索</button><button className="text-button" onClick={() => navigate("research")}><FlaskConical size={14} />方法与依据</button></div></div><div className="wb-quick">
      <button onClick={() => navigate("chat")}><MessageCircle size={19} /><span>智能咨询</span><ArrowUpRight size={15} /></button>
      <button onClick={() => openTool("calculator")}><Calculator size={19} /><span>加班费计算</span><ArrowUpRight size={15} /></button>
      <button onClick={() => openTool("evidence")}><ClipboardCheck size={19} /><span>维权证据清单</span><ArrowUpRight size={15} /></button>
      <button onClick={() => ask("学校组织的勤工助学，工作时间和报酬应该如何约定？")}><BookOpen size={19} /><span>勤工助学指引</span><ArrowUpRight size={15} /></button>
    </div></section>
  </div>;
}
