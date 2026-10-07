import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRight, BarChart3, CalendarClock, CheckCircle2, ClipboardList, Clock3, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Page, WorkOrder } from "../types";
import type { Inspection } from "../lib/safety";
import { distribution, localDateKey, operationsCsv, pendingTasks, periodDescription, summarizeOperations } from "../lib/operations";
import type { RecordPeriod } from "../lib/operations";
import "./operations.css";

const periodLabel: Record<RecordPeriod, string> = { "7": "近 7 天", "30": "近 30 天", all: "全部历史" };

function Completion({ title, completed, total }: { title: string; completed: number; total: number }) {
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  return <div className="ops-completion-item">
    <div className="ops-progress-label"><h3>{title}</h3><span><strong>{completed}</strong> / {total} 条</span></div>
    <div className="ops-progress" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={total ? `${completed} / ${total} 条，${percentage}%` : "暂无记录，完成率不适用"}>
      <span style={{ width: `${percentage}%` }} />
    </div>
    <p>{total ? `当前完成率 ${percentage}%，按所选范围内创建的记录计算。` : "暂无记录，完成率不适用。"}</p>
  </div>;
}

function Distribution({ rows, priority = false }: { rows: ReturnType<typeof distribution>; priority?: boolean }) {
  return <div className="ops-bars">
    {rows.map((row) => <div className="ops-bar" key={row.label} data-priority={priority ? row.label : undefined}>
      <div className="ops-bar-label"><span>{row.label}</span><span><strong>{row.count} 条</strong> · {row.percentage}%</span></div>
      <div className="ops-bar-track" aria-hidden="true"><span style={{ width: `${row.percentage}%` }} /></div>
    </div>)}
  </div>;
}

export default function Operations({ orders, inspections, navigate }: {
  orders: WorkOrder[];
  inspections: Inspection[];
  navigate: (page: Page) => void;
}) {
  const [period, setPeriod] = useState<RecordPeriod>("30");
  const [now, setNow] = useState(() => new Date());
  const [exportStatus, setExportStatus] = useState("");
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const summary = useMemo(() => summarizeOperations(orders, inspections, period, now), [orders, inspections, period, now]);
  const tasks = useMemo(() => pendingTasks(orders, inspections, now), [orders, inspections, now]);
  const categories = useMemo(() => distribution(summary.scopedOrders, "category"), [summary.scopedOrders]);
  const priorities = useMemo(() => distribution(summary.scopedOrders, "priority"), [summary.scopedOrders]);
  const hasRecords = orders.length + inspections.length > 0;
  const scopeCount = summary.scopedOrders.length + summary.scopedInspections.length;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const snapshot = now.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

  function exportCsv() {
    try {
      const blob = new Blob([operationsCsv(orders, inspections, period, now)], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `校园治理记录_${period === "all" ? "全部" : `${period}天`}_${localDateKey(now)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setExportStatus(`已生成 ${scopeCount} 条记录的 CSV，请查看浏览器下载。`);
    } catch {
      setExportStatus("导出未完成，请检查浏览器下载权限后重试。");
    }
  }

  return <div className="operations-page page-enter">
    <header className="ops-heading">
      <div><span className="ops-kicker">CAMPUS OPERATIONS / 01</span><h1>运行看板</h1><p>看见待办，跟进整改，让每一次记录成为下一次改进的依据。</p></div>
      <div className="ops-heading-actions">
        <button className="button secondary small" onClick={exportCsv} disabled={!scopeCount}><ArrowDownToLine size={15} />导出统计 CSV</button>
        <button className="button primary small" onClick={() => navigate("safety")}><Plus size={15} />开展安全巡检</button>
      </div>
    </header>
    <div className="ops-local-note"><ShieldCheck size={17} /><p>仅统计当前账号保存的真实记录；工单状态由您更新，整改闭环以本地复核记录为依据。快照：{snapshot}（{timezone}）。</p></div>

    <section aria-labelledby="ops-overview-title">
      <div className="ops-section-caption"><i className="ops-live-dot" aria-hidden="true" /><h2 id="ops-overview-title">当前跟进概览</h2><span>待办不限创建日期 · 解决率使用下方筛选范围</span></div>
      <div className="ops-metrics">
        <article className="ops-metric"><div className="ops-metric-title">未解决工单<ClipboardList size={17} /></div><div className="ops-metric-number"><strong>{summary.openOrders}</strong><span>条</span></div><p>全部历史 · 待提交与已自行提交</p></article>
        <article className={`ops-metric ${summary.urgentOrders ? "is-alert" : ""}`}><div className="ops-metric-title">紧急待跟进<TriangleAlert size={17} /></div><div className="ops-metric-number"><strong>{summary.urgentOrders}</strong><span>条</span></div><p>全部历史 · 紧急 / 特急未解决工单</p></article>
        <article className={`ops-metric ${summary.overdueInspections ? "is-alert" : ""}`}><div className="ops-metric-title">逾期未闭环<CalendarClock size={17} /></div><div className="ops-metric-number"><strong>{summary.overdueInspections}</strong><span>条</span></div><p>全部历史 · 整改期限早于今天</p></article>
        <article className="ops-metric"><div className="ops-metric-title">范围内工单解决率<CheckCircle2 size={17} /></div><div className="ops-metric-number"><strong>{summary.orderClosureRate ?? "—"}</strong>{summary.orderClosureRate !== null && <span>%</span>}</div><p>{periodLabel[period]}创建 · {summary.resolvedOrders} / {summary.scopedOrders.length} 条已标记解决</p></article>
      </div>
    </section>

    {!hasRecords && <section className="ops-empty">
      <div><span className="ops-kicker">从第一条真实记录开始</span><h2>把现场的问题，变成可跟进的行动。</h2><p>创建报修或开展一次安全巡检后，工作台会汇总待办、整改期限和完成情况。所有数据都来自您的实际使用。</p><div className="ops-empty-actions"><button className="button primary small" onClick={() => navigate("repair")}><Plus size={15} />创建报修记录</button><button className="button secondary small" onClick={() => navigate("safety")}>开始巡检<ArrowRight size={15} /></button></div></div>
      <ol><li><span>01</span><div><strong>记录现场</strong><p>明确地点、现象与安全风险。</p></div></li><li><span>02</span><div><strong>落实行动</strong><p>通过正式渠道报修，或指定整改责任人与期限。</p></div></li><li><span>03</span><div><strong>核验与改进</strong><p>复核整改结果，结合记录分布安排下一次检查。</p></div></li></ol>
    </section>}

    <section aria-labelledby="ops-cohort-title">
      <div className="ops-toolbar"><div><h2 id="ops-cohort-title">记录分析</h2><p>按创建时间筛选：{periodDescription(period, now)}。图表与 CSV 使用同一范围。</p></div><div className="ops-period" role="group" aria-label="按记录创建日期筛选">{(["7", "30", "all"] as RecordPeriod[]).map((value) => <button key={value} aria-pressed={period === value} onClick={() => { setPeriod(value); setExportStatus(""); }}>{periodLabel[value]}</button>)}</div></div>
      {hasRecords && !scopeCount && <div className="ops-scope-empty"><span>所选创建范围内暂无记录；历史待办仍显示在下方。</span>{period !== "all" && <button onClick={() => setPeriod("all")}>查看全部历史</button>}</div>}
      <div className="ops-panel ops-completion"><Completion title="报修工单 · 已标记解决" completed={summary.resolvedOrders} total={summary.scopedOrders.length} /><Completion title="安全巡检 · 已复核闭环" completed={summary.closedInspections} total={summary.scopedInspections.length} /></div>
      <div className="ops-distributions">
        <section className="ops-panel"><div className="ops-panel-title"><h3>工单类别分布</h3><span>当前范围 · {summary.scopedOrders.length} 条</span></div>{categories.length ? <Distribution rows={categories} /> : <div className="ops-chart-empty"><p><BarChart3 size={18} /> 暂无可统计的工单类别</p></div>}</section>
        <section className="ops-panel"><div className="ops-panel-title"><h3>工单紧急程度</h3><span>当前范围 · 含已解决</span></div><Distribution rows={priorities} priority /></section>
      </div>
    </section>

    <section className="ops-panel ops-queue" aria-labelledby="ops-queue-title"><div className="ops-panel-title"><h3 id="ops-queue-title">待跟进清单</h3><span>全部历史 · {tasks.length} 条</span></div>
      {tasks.length ? <>
        {tasks.slice(0, 6).map((task) => <article className="ops-queue-item" key={task.key}>
          <span className={`ops-task-icon ${task.alert ? "is-alert" : ""}`}>{task.type === "order" ? <ClipboardList size={17} /> : <ShieldCheck size={17} />}</span>
          <div className="ops-task-content"><h4>{task.title}</h4><p><span>{task.location}</span><span>·</span><time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleDateString("zh-CN")}</time><span>{task.type === "order" ? "报修记录" : "安全巡检"}</span></p></div>
          <span className={`ops-task-status ${task.alert ? "is-alert" : ""}`}>{task.label}</span><button onClick={() => navigate(task.type === "order" ? "orders" : "safety")} aria-label={`跟进${task.location}的${task.title}`}>跟进<ArrowRight size={14} /></button>
        </article>)}
        <p className="ops-queue-tail">优先显示特急工单与高优先风险，其次是逾期整改；同级按创建时间从早到晚排列。{tasks.length > 6 ? `此处展示前 6 条，其余记录可在工单或巡检页面查看。` : ""}</p>
      </> : <div className="ops-chart-empty"><p><Clock3 size={18} /> {hasRecords ? "当前没有未解决的工单或未闭环的巡检记录。" : "创建记录后，需要跟进的事项会出现在这里。"}</p></div>}
    </section>

    <details className="ops-method"><summary>统计口径与方法依据</summary><div className="ops-method-content"><p>待办指标统计截至快照时刻的全部记录。近 7 / 30 天按浏览器本地时区的自然日计算，包含今天，起始日从 00:00 计入；无效或未来创建时间不进入统计。逾期指整改期限早于本地今天且尚未闭环，今天到期不算逾期。</p><p>解决率 = 当前已解决工单 ÷ 所选创建范围内全部工单。巡检闭环率同理。它们反映该批记录的当前状态，不能解释为期间完成数量、服务时效或学校受理率；没有记录时显示「—」。百分比取整，分类百分比之和可能略有偏差。</p><p>工作流借鉴 PDCA 的计划、执行、检查和改进思路；统计结果用于回顾和安排后续行动，不代表通过任何管理体系认证。CSV 包含筛选范围内的工单和巡检摘要、统计范围及快照时间，涉及地点与人员信息，请按实际需要保管。</p><button onClick={() => navigate("research")}>查看参考文献与方法边界 <ArrowRight size={12} /></button></div></details>
    <p className="ops-export-status" role="status" aria-live="polite">{exportStatus}</p>
  </div>;
}
