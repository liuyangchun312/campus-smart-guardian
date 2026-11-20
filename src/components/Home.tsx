import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Calculator, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, FileSearch, FlaskConical, MessageCircle, Plus, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import type { Page, WorkOrder } from "../types";
import type { Inspection } from "../lib/safety";
import { localDateKey, pendingTasks, summarizeOperations } from "../lib/operations";
import { useDeployment } from "../lib/deployment";
import { formatDate } from "../lib/storage";
import "./workbench.css";

type Props = {
  name: string;
  navigate: (page: Page, options?: { recordId?: string; filter?: string }) => void;
  openRecord: (type: "order" | "inspection", id: string) => void;
  ask: (text: string) => void;
  openTool: (tool: string) => void;
  orders: WorkOrder[];
  inspections: Inspection[];
};

const dateHeading = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
});
const weekdayHeading = new Intl.DateTimeFormat("zh-CN", { weekday: "long" });

export default function Home({ name, navigate, openRecord, ask, openTool, orders, inspections }: Props) {
  const { storageLabel, description } = useDeployment();
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

  return (
    <div className="workbench-home">
      <header className="wb-heading">
        <div className="wb-hero-copy">
          <time className="wb-date" dateTime={localDateKey(now)}>
            <CalendarDays size={15} aria-hidden="true" />
            <span>{dateHeading.format(now)}</span>
            <span>{weekdayHeading.format(now)}</span>
          </time>
          <h1>工作总览</h1>
          <div className="wb-context">
            <p className="wb-welcome">您好，{name}</p>
            <p className="wb-storage" title={description}><ShieldCheck size={15} aria-hidden="true" /><span>记录保存于{storageLabel}</span></p>
          </div>
          <div className="wb-main-actions">
            <button className="button primary" onClick={() => navigate("repair")}><Plus size={17} />新建报修</button>
            <button className="button outline" onClick={() => navigate("safety")}><ShieldCheck size={17} />开始安全巡检</button>
          </div>
        </div>
        <div className="wb-campus"><img src="/campus-scene.svg" alt="" width="600" height="360" /></div>
      </header>

      <section className="wb-metrics" aria-label="当前待办统计">
        {metrics.map(({ label: title, value, icon: Icon, page, filter, tone }) => (
          <button className={`wb-metric tone-${tone}`} key={title} onClick={() => navigate(page, { filter })} aria-label={`${title} ${value} 条，查看记录`}>
            <span className="wb-metric-icon" aria-hidden="true"><Icon size={19} /></span>
            <ArrowUpRight className="wb-metric-arrow" size={16} aria-hidden="true" />
            <span className="wb-metric-label">{title}</span>
            <span className="wb-metric-value"><strong className="numeric">{value}</strong><small>条</small></span>
          </button>
        ))}
      </section>

      <div className="wb-ledgers">
        <section className="wb-ledger-panel" aria-labelledby="wb-queue-title">
          <header className="wb-section-heading">
            <h2 id="wb-queue-title">优先处理{tasks.length > 0 && <small><span className="numeric">{tasks.length}</span> 条待办</small>}</h2>
            {tasks.length > 0 && <button className="text-button" onClick={() => navigate("operations")}>运行看板<ArrowRight size={14} /></button>}
          </header>
          {tasks.length ? (
            <div className="wb-task-list">
              {tasks.slice(0, 6).map((task) => (
                <button className="wb-task" key={task.key} onClick={() => openRecord(task.type, task.id)} aria-label={`跟进${task.location}的${task.title}`}>
                  <span className={`wb-record-icon ${task.alert ? "is-alert" : ""}`}>{task.type === "order" ? <Wrench size={17} /> : <ShieldCheck size={17} />}</span>
                  <span className="wb-row-copy">
                    <strong>{task.title}</strong>
                    <small>{task.location} · {task.type === "order" ? "报修" : "巡检"} · <time dateTime={task.createdAt}>{formatDate(task.createdAt)}</time></small>
                  </span>
                  <span className={`wb-task-label ${task.alert ? "is-alert" : ""}`}>{task.label}</span>
                  <ArrowRight className="wb-row-arrow" size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="wb-empty">
              <p>{activities.length ? "当前没有待跟进事项" : "暂无待办记录"}</p>
              <button className="text-button" onClick={() => navigate("operations")}>查看运行看板<ArrowRight size={14} aria-hidden="true" /></button>
            </div>
          )}
        </section>

        <section className="wb-ledger-panel" aria-labelledby="wb-recent-title">
          <header className="wb-section-heading">
            <h2 id="wb-recent-title">最近记录</h2>
            {activities.length > 0 && <button className="text-button" onClick={() => navigate("orders", { filter: "all" })}>全部工单<ArrowRight size={14} /></button>}
          </header>
          {activities.length ? (
            <div className="wb-activity-list">
              {activities.map((item) => (
                <button className="wb-record" key={`${item.type}-${item.id}`} onClick={() => openRecord(item.type, item.id)} aria-label={`打开${item.label}记录：${item.title}`}>
                  <span className={`wb-record-type type-${item.type}`}>{item.label}</span>
                  <span className="wb-row-copy"><strong>{item.title}</strong><small>{item.site} · {item.done ? "已完成" : "跟进中"}</small></span>
                  <time dateTime={item.at}>{formatDate(item.at, true)}</time>
                </button>
              ))}
            </div>
          ) : (
            <div className="wb-empty">
              <p>暂无报修或巡检记录</p>
              <button className="text-button" onClick={() => navigate("safety", { filter: "all" })}>查看安全巡检<ArrowRight size={14} aria-hidden="true" /></button>
            </div>
          )}
        </section>
      </div>

      <section className="wb-tools" aria-labelledby="wb-tools-title">
        <header className="wb-section-heading">
          <h2 id="wb-tools-title">常用工具</h2>
        </header>
        <div className="wb-quick">
          <button onClick={() => navigate("chat")}><span className="wb-tool-icon" aria-hidden="true"><MessageCircle size={18} /></span><span>智能咨询</span><ArrowUpRight size={14} aria-hidden="true" /></button>
          <button onClick={() => openTool("calculator")}><span className="wb-tool-icon" aria-hidden="true"><Calculator size={18} /></span><span>加班费计算</span><ArrowUpRight size={14} aria-hidden="true" /></button>
          <button onClick={() => openTool("evidence")}><span className="wb-tool-icon" aria-hidden="true"><ClipboardCheck size={18} /></span><span>维权证据清单</span><ArrowUpRight size={14} aria-hidden="true" /></button>
          <button onClick={() => ask("学校组织的勤工助学，工作时间和报酬应该如何约定？")}><span className="wb-tool-icon" aria-hidden="true"><BookOpen size={18} /></span><span>勤工助学指引</span><ArrowUpRight size={14} aria-hidden="true" /></button>
          <button onClick={() => navigate("knowledge")}><span className="wb-tool-icon" aria-hidden="true"><FileSearch size={18} /></span><span>循证检索</span><ArrowUpRight size={14} aria-hidden="true" /></button>
          <button onClick={() => navigate("research")}><span className="wb-tool-icon" aria-hidden="true"><FlaskConical size={18} /></span><span>方法与依据</span><ArrowUpRight size={14} aria-hidden="true" /></button>
        </div>
      </section>
    </div>
  );
}
