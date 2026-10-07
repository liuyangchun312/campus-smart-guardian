import { Activity, ArrowRight, ArrowUpRight, BookOpen, Calculator, ClipboardCheck, Clock3, FileSearch, FlaskConical, MessageCircle, Plus, ShieldCheck, Wrench } from "lucide-react";
import type { Page, WorkOrder } from "../types";
import type { Inspection } from "../lib/safety";
import { formatDate } from "../lib/storage";
import "./workbench.css";

type Props = { navigate: (page: Page) => void; ask: (text: string) => void; openTool: (tool: string) => void; orders: WorkOrder[]; inspections: Inspection[] };
export default function Home({ navigate, ask, openTool, orders, inspections }: Props) {
  const openOrders = orders.filter((order) => order.status !== "resolved");
  const openInspections = inspections.filter((item) => item.status !== "closed");
  const reviewing = inspections.filter((item) => item.status === "review");
  const activities = [
    ...orders.map((item) => ({ id: item.id, title: item.description, site: item.location, at: item.history.at(-1)?.at ?? item.createdAt, page: "orders" as Page, type: "报修", done: item.status === "resolved" })),
    ...inspections.map((item) => ({ id: item.id, title: item.site, site: item.inspector || "巡检记录", at: item.updatedAt, page: "safety" as Page, type: "巡检", done: item.status === "closed" })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 4);
  return <div className="workbench-home page-enter">
    <div className="page-heading"><div><span className="eyebrow">CAMPUS GUARDIAN / 工作总览</span><h1>把每一件事，跟进到底。</h1><p>从发现问题到复查留痕，让校园服务有依据、有记录、有进展。</p></div><span className="wb-local"><i className="green-dot" />专属账号 · 本机工作空间</span></div>
    <section className="wb-brief" aria-label="工作概览"><div className="wb-brief-copy"><span className="wb-kicker">服务 · 安全 · 劳动权益</span><h2>看见问题，<br /><em>也看见解决的过程。</em></h2><p>先从一次巡检或一张报修单开始。需要判断时查阅依据，处理之后记录整改与复查。</p><div className="wb-actions"><button className="button primary" onClick={() => navigate("safety")}><Plus size={17} />开始安全巡检</button><button className="wb-light-link" onClick={() => navigate("operations")}>打开运行看板<ArrowUpRight size={17} /></button></div></div>
      <div className="wb-ledger"><div className="wb-ledger-title"><Activity size={17} /><span>当前待办</span><small>基于您的记录</small></div>{[
        { label: "待跟进报修", value: openOrders.length, page: "orders" as Page, sub: "包含待提交与已自行提交" },
        { label: "未闭环巡检", value: openInspections.length, page: "safety" as Page, sub: "登记、整改与复查中" },
        { label: "等待复查", value: reviewing.length, page: "safety" as Page, sub: "补充验证记录后再关闭" },
      ].map((metric) => <button key={metric.label} onClick={() => navigate(metric.page)}><div><span>{metric.label}</span><small>{metric.sub}</small></div><strong>{metric.value.toString().padStart(2, "0")}</strong><ArrowUpRight size={16} /></button>)}<p>数据仅来自您的账号记录，工单状态由使用者维护。</p></div>
    </section>
    <section aria-labelledby="wb-services"><div className="section-heading"><h2 id="wb-services">进入工作场景</h2><span className="soft-label">发现 → 判断 → 处理 → 复查</span></div><div className="wb-service-grid">{[
      { page: "safety" as Page, icon: ShieldCheck, index: "01", title: "安全巡检与整改", text: "场景清单、风险分级、责任与期限，直至复查关闭。", tag: "FMEA 思路 · 控制层级" },
      { page: "knowledge" as Page, icon: FileSearch, index: "02", title: "查依据，再做判断", text: "检索政策与安全资料，查看整理摘要、适用条件与原文。", tag: "BM25 检索 · 来源追溯" },
      { page: "repair" as Page, icon: Wrench, index: "03", title: "报修与进度跟进", text: "把故障说明白，整理标准工单，记录提交和解决过程。", tag: "结构化记录 · 时间线" },
    ].map((item) => <button className="wb-service" key={item.page} onClick={() => navigate(item.page)}><div><item.icon size={23} strokeWidth={1.6} /><span>{item.index}</span></div><h3>{item.title}<ArrowUpRight size={17} /></h3><p>{item.text}</p><small>{item.tag}</small></button>)}</div></section>
    <div className="wb-bottom-grid"><section className="panel wb-activity"><div className="section-heading"><h2><Clock3 size={18} />最近记录</h2><button className="text-button" onClick={() => navigate("operations")}>查看全部<ArrowRight size={14} /></button></div>{activities.length ? <div className="wb-activity-list">{activities.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => navigate(item.page)}><span className={`wb-record-type ${item.done ? "done" : ""}`}>{item.type}</span><span className="wb-record-copy"><strong>{item.title}</strong><small>{item.site} · {item.done ? "已完成" : "跟进中"}</small></span><time>{formatDate(item.at, true)}</time><ArrowUpRight size={14} /></button>)}</div> : <div className="wb-first"><ClipboardCheck size={32} strokeWidth={1.3} /><h3>您的第一条记录，从这里开始</h3><p>完成一次巡检或保存报修后，进度会显示在这里和运行看板中。</p><button className="text-button accent" onClick={() => navigate("repair")}>创建报修记录<ArrowRight size={15} /></button></div>}</section><section className="wb-evidence-note"><span className="wb-kicker"><FlaskConical size={16} />让方法真正参与工作</span><h2>每一个分数，<br />都有解释。</h2><p>风险评分可查看计算过程；检索结果可追溯原文；文献与工程简化分别说明。</p><button onClick={() => navigate("research")}>阅读方法与参考文献<ArrowUpRight size={17} /></button></section></div>
    <section className="wb-quick" aria-label="常用工具">
      <button onClick={() => navigate("chat")}><MessageCircle size={19} /><span>智能咨询<small>带检索来源的答复</small></span><ArrowUpRight size={15} /></button>
      <button onClick={() => openTool("calculator")}><Calculator size={19} /><span>加班费计算<small>条件与公式可核对</small></span><ArrowUpRight size={15} /></button>
      <button onClick={() => openTool("evidence")}><ClipboardCheck size={19} /><span>维权证据清单<small>整理关键材料</small></span><ArrowUpRight size={15} /></button>
      <button onClick={() => ask("学校组织的勤工助学，工作时间和报酬应该如何约定？")}><BookOpen size={19} /><span>勤工助学指引<small>先核实用工形式</small></span><ArrowUpRight size={15} /></button>
    </section>
  </div>;
}
