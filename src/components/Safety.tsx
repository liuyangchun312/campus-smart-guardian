import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, ClipboardCheck, Clock3, Download, FlaskConical, Plus, Search, ShieldCheck, ShieldAlert, Sun, Trash2, Zap } from "lucide-react";
import { CONTROL_LEVELS, RATING_GUIDE, SAFETY_TEMPLATES, STATUS_LABELS, createInspection, getRisk, hasCriticalFailure, inspectionMarkdown, inspectionRisk, isOverdue, isRiskRatings, transitionInspection } from "../lib/safety";
import type { ControlLevel, Inspection, InspectionAction, Remediation, ResidualRiskRatings, RiskRatings, SafetyAnswer, SafetyTemplate } from "../lib/safety";
import type { InspectionViewState } from "../lib/navigation";
import { useDeployment } from "../lib/deployment";
import "./safety.css";

type Props = { inspections: Inspection[]; onChange: (next: Inspection[] | ((prev: Inspection[]) => Inspection[])) => void; notify: (message: string) => void; selectedId: string | null; onSelect: (id: string | null) => void; view: InspectionViewState; onViewChange: (view: InspectionViewState) => void };
const ICONS = { cleaning: FlaskConical, electrical: Zap, heat: Sun };
const formatTime = (at: string) => new Date(at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function Ratings({ value, onChange, residual = false }: { value: ResidualRiskRatings; onChange: (next: ResidualRiskRatings) => void; residual?: boolean }) {
  return <fieldset className="safety-ratings"><legend>{residual ? "措施落实后的残余风险" : "现场风险评分"}{value !== null && <span>1 最低 / 5 最高</span>}</legend>
    {residual && <label className="safety-confirm-check"><input type="checkbox" checked={value === null} onChange={(event) => onChange(event.target.checked ? null : { severity: 0, occurrence: 0, detection: 0 })} /><span>无风险（未发现问题）</span></label>}
    {value !== null && <div className="safety-rating-grid">{RATING_GUIDE.map(({ key, label, short, descriptions }) => <label className="safety-rating" key={key}>
      <span><b>{short}</b>{label}</span>
      <select value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} required aria-label={`${residual ? "残余" : "初始"}${label}`}>
        <option value={0} disabled>请选择评分</option>{descriptions.map((description, index) => <option key={index} value={index + 1}>{index + 1} · {description}</option>)}
      </select><small>{value[key] ? descriptions[value[key] - 1] : "结合现场事实选择，不能仅凭场景预设。"}</small>
    </label>)}</div>}
    {residual && value !== null && <p className="safety-field-hint">仅增加培训或防护通常不能降低后果严重度。请依据危险源是否被消除、暴露是否减少等事实重新评分。</p>}
  </fieldset>;
}

function RiskPanel({ ratings, critical, residual = false }: { ratings: ResidualRiskRatings; critical: boolean; residual?: boolean }) {
  if (ratings !== null && !isRiskRatings(ratings)) return <div className="safety-risk-panel unassessed"><ShieldAlert size={24} /><div><strong>等待现场评分</strong><p>完成 S / O / D 三项后计算风险优先数。</p></div></div>;
  const risk = getRisk(ratings, critical);
  return <div className={`safety-risk-panel ${risk.level}`}><div className="safety-rpn"><span>{residual ? "残余 RPN" : "风险优先数"}</span><strong>{risk.score}<small>/125</small></strong></div><div className="safety-risk-text"><b>{risk.label}</b><p>{risk.reason}</p>{ratings !== null && <span>{ratings.severity} × {ratings.occurrence} × {ratings.detection} = {risk.score}</span>}</div></div>;
}

function InspectionForm({ onSave }: { onSave: (row: Inspection) => void }) {
  const { storageLabel } = useDeployment();
  const [templateId, setTemplateId] = useState("cleaning");
  const [site, setSite] = useState("");
  const [inspector, setInspector] = useState("");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, SafetyAnswer>>({});
  const [ratings, setRatings] = useState<RiskRatings>({ severity: 0, occurrence: 0, detection: 0 });
  const [error, setError] = useState("");
  const template = SAFETY_TEMPLATES.find(({ id }) => id === templateId)!;
  const checked = template.checks.filter(({ id }) => answers[id] === "passed" || answers[id] === "failed").length;
  const critical = hasCriticalFailure({ templateId, answers });
  return <form className="safety-work-card" onSubmit={(event) => { event.preventDefault(); try { onSave(createInspection({ templateId, site, inspector, notes, answers, ratings })); } catch (caught) { setError(caught instanceof Error ? caught.message : "登记失败，请检查表单。"); } }}>
    <div className="safety-card-heading"><div><span className="safety-eyebrow">NEW INSPECTION</span><h2>登记现场巡检</h2></div><span className="safety-local-label">{storageLabel}</span></div>
    <section className="safety-form-section"><h3><span>01</span>选择作业场景</h3><div className="safety-template-grid">{SAFETY_TEMPLATES.map((item) => {
      const Icon = ICONS[item.icon]; return <button key={item.id} type="button" className={`safety-template ${templateId === item.id ? "selected" : ""}`} aria-pressed={templateId === item.id} onClick={() => { setTemplateId(item.id); setAnswers({}); setRatings({ severity: 0, occurrence: 0, detection: 0 }); setError(""); }}><Icon size={22} /><strong>{item.name}</strong><small>{item.context}</small>{templateId === item.id && <Check size={15} className="safety-template-check" />}</button>;
    })}</div><div className="safety-field-grid"><label>检查地点 <em>*</em><input value={site} onChange={(event) => setSite(event.target.value)} placeholder="例如：北区教学楼一层保洁间" maxLength={120} required /></label><label>检查人 <em>*</em><input value={inspector} onChange={(event) => setInspector(event.target.value)} placeholder="填写现场检查人" maxLength={60} required /></label></div></section>
    <section className="safety-form-section"><div className="safety-section-heading"><h3><span>02</span>逐项检查</h3><span>{checked} / {template.checks.length} 已检查</span></div><div className="safety-checklist">{template.checks.map((check, index) => <div key={check.id} className={`safety-check ${answers[check.id] ?? "unchecked"}`}><span className="safety-check-index">{String(index + 1).padStart(2, "0")}</span><div className="safety-check-copy"><strong>{check.text}{check.critical && <small>关键项</small>}</strong><p>{check.help}</p></div><div className="safety-answer-buttons" role="group" aria-label={check.text}><button type="button" className={answers[check.id] === "passed" ? "active passed" : ""} aria-pressed={answers[check.id] === "passed"} onClick={() => setAnswers((prev) => ({ ...prev, [check.id]: "passed" }))}>符合</button><button type="button" className={answers[check.id] === "failed" ? "active failed" : ""} aria-pressed={answers[check.id] === "failed"} onClick={() => setAnswers((prev) => ({ ...prev, [check.id]: "failed" }))}>不符合</button><span>{answers[check.id] ? "已检查" : "未检查"}</span></div></div>)}</div>
      {critical && <div className="safety-critical-alert" role="alert"><ShieldAlert size={20} /><p><strong>关键检查项不符合</strong>请先停止相关危险作业、隔离现场并联系有资质人员；存在人身紧急危险时优先急救和报警。该项直接进入高优先处理。</p></div>}
      <label className="safety-block-field">现场发现与现有控制措施<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="记录观察到的事实、影响范围、已采取的临时措施，避免只写“有问题”。" /></label>
    </section>
    <section className="safety-form-section"><h3><span>03</span>评估并登记</h3><Ratings value={ratings} onChange={(next) => { if (next !== null) setRatings(next); }} /><RiskPanel ratings={ratings} critical={critical} /><details className="safety-method-note"><summary>这组分数如何解释？</summary><p>借鉴 FMEA，以 S（后果严重度）、O（发生可能性）、D（发现难度）各 1–5 分计算 RPN = S × O × D。RPN ≥ 50 为高优先，20–49 为中优先，其余为常规；S ≥ 4 或关键检查项不符合，直接高优先。分级阈值、量表和严重度优先规则均为本项目约定，不是行业统一标准。</p><p>相同 RPN 可能对应完全不同的风险，应同时查看各维度与现场事实。常规优先级也不代表现场已被证明安全。</p></details></section>
    <div className="safety-form-footer"><span>{checked < template.checks.length ? `还有 ${template.checks.length - checked} 项未检查，不能登记为安全。` : "登记后继续落实责任人、整改措施与复核。"}</span><button className="safety-primary" type="submit" disabled={checked < template.checks.length || !isRiskRatings(ratings)}><ClipboardCheck size={17} />登记巡检</button></div>{error && <p className="safety-form-error" role="alert">{error}</p>}
  </form>;
}

function InspectionDetail({ row, onAction, notify }: { row: Inspection; onAction: (id: string, action: InspectionAction) => void; notify: Props["notify"] }) {
  const template = SAFETY_TEMPLATES.find(({ id }) => id === row.templateId)!;
  const [owner, setOwner] = useState(row.remediation?.owner ?? "");
  const [dueDate, setDueDate] = useState(row.remediation?.dueDate ?? "");
  const [action, setAction] = useState(row.remediation?.action ?? "");
  const [control, setControl] = useState<ControlLevel>(row.remediation?.control ?? "engineering");
  const [completion, setCompletion] = useState(row.remediation?.completionEvidence ?? "");
  const [reviewer, setReviewer] = useState(row.review?.reviewer ?? "");
  const [evidence, setEvidence] = useState(row.review?.evidence ?? "");
  const [residual, setResidual] = useState<ResidualRiskRatings>(row.review ? row.review.residualRatings : { severity: 0, occurrence: 0, detection: 0 });
  const [criticalResolved, setCriticalResolved] = useState(row.review?.criticalResolved ?? !hasCriticalFailure(row));
  const [returnReason, setReturnReason] = useState("");
  const critical = hasCriticalFailure(row);
  const planChanged = Boolean(row.remediation && (row.remediation.owner !== owner.trim() || row.remediation.dueDate !== dueDate || row.remediation.action !== action.trim() || row.remediation.control !== control));
  const reviewChanged = Boolean(row.review && (row.review.reviewer !== reviewer.trim() || row.review.evidence !== evidence.trim() || row.review.criticalResolved !== criticalResolved || RATING_GUIDE.some(({ key }) => residual?.[key] !== row.review!.residualRatings?.[key])));
  const canClose = Boolean(row.review && !reviewChanged && inspectionRisk(row).level !== "high");
  const noFindings = !Object.values(row.answers).includes("failed");
  const stages = ["registered", "remediating", "review", "closed"] as const;
  const exportRecord = () => {
    const url = URL.createObjectURL(new Blob([inspectionMarkdown(row)], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `巡检记录-${row.id.slice(0, 8)}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify("已导出巡检、整改和复核完整记录");
  };
  return <article className="safety-work-card"><div className="safety-card-heading"><div><span className="safety-eyebrow">INSPECTION / {row.id.slice(0, 8).toUpperCase()}</span><h2>{row.site}</h2><p>{template.name} · {row.inspector} · {formatTime(row.createdAt)}</p></div><button className="safety-subtle" onClick={exportRecord}><Download size={16} />导出记录</button></div>
    <ol className="safety-stage-bar">{stages.map((stage, index) => <li className={`${row.status === stage ? "current" : ""} ${stages.indexOf(row.status) > index ? "done" : ""}`} key={stage}><span>{stages.indexOf(row.status) > index ? <Check size={13} /> : index + 1}</span><b>{["巡检登记", "落实整改", "效果复核", "确认闭环"][index]}</b></li>)}</ol>
    <div className="safety-detail-body"><div className="safety-section-heading"><h3>现场检查记录</h3><span>{row.templateId === "electrical" ? "请由有资质人员处理电气风险" : "按现场事实留痕"}</span></div><div className="safety-result-list">{template.checks.map(({ id, text, critical: isCritical }) => <div key={id}><span className={`safety-check-result ${row.answers[id]}`}>{row.answers[id] === "passed" ? "符合" : "不符合"}</span><p>{text}{isCritical && <small>关键项</small>}</p></div>)}</div>{row.notes && <p className="safety-record-note">{row.notes}</p>}<RiskPanel ratings={row.ratings} critical={critical} />
    {(row.status === "registered" || row.status === "remediating") && <form className="safety-action-section" onSubmit={(event) => { event.preventDefault(); const plan: Remediation = { owner, dueDate, action, control }; onAction(row.id, { type: "plan", plan }); }}><div className="safety-section-heading"><h3>{noFindings ? "落实持续控制与复查计划" : "落实整改计划"}</h3><span>责任到人 · 明确期限</span></div>{noFindings && <p className="safety-field-hint">本次检查项均符合。请如实记录现有控制的维护责任、检查期限和核验方式，不必编造隐患或整改事项；仍需完成核验留痕。</p>}<div className="safety-field-grid"><label>{noFindings ? "控制措施责任人" : "整改责任人"} <em>*</em><input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={60} placeholder="负责落实措施的人" required /></label><label>完成期限 <em>*</em><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />{isOverdue(row) && <small className="safety-overdue">已逾期，请更新处置进展</small>}</label></div><label className="safety-block-field">控制措施层级 <em>*</em><select value={control} onChange={(event) => setControl(event.target.value as ControlLevel)}>{CONTROL_LEVELS.map(({ value, label, example }, index) => <option key={value} value={value}>{index + 1}. {label} — {example}</option>)}</select></label><div className="safety-control-ladder" aria-label="优先从消除危险源开始选择控制措施">{CONTROL_LEVELS.map(({ value, label }, index) => <span className={control === value ? "active" : ""} key={value}><b>{index + 1}</b>{label}</span>)}</div><p className="safety-field-hint">参考 NIOSH 控制层级，优先考虑消除、替代和工程控制；选择管理或个人防护时，请说明更高层级措施暂不可行的原因。</p><label className="safety-block-field">具体措施与选择依据 <em>*</em><textarea value={action} onChange={(event) => setAction(event.target.value)} rows={3} maxLength={3000} placeholder="说明做什么、如何验证，以及为何采用这一层级。多项措施可一起记录。" required /></label><button className="safety-primary" type="submit">{row.status === "registered" ? "确认整改计划" : "更新整改计划"}<ArrowRight size={16} /></button></form>}
    {row.status === "remediating" && <form className="safety-action-section" onSubmit={(event) => { event.preventDefault(); if (planChanged) { notify("整改计划有未保存的修改，请先点击“更新整改计划”，再提交效果复核。"); return; } onAction(row.id, { type: "submit-review", evidence: completion }); }}><div className="safety-section-heading"><h3>整改完成后，提交复核</h3><span>完成说明不等于已通过复核</span></div><label className="safety-block-field">实际完成情况 <em>*</em><textarea value={completion} onChange={(event) => setCompletion(event.target.value)} maxLength={3000} rows={3} required placeholder="记录已落实措施、完成时间和可供复核的位置、工单号或文档编号。" /></label>{planChanged && <p className="safety-field-hint" role="status">整改计划有未保存的修改。请先点击上方“更新整改计划”，再提交效果复核。</p>}<button className="safety-primary" type="submit" disabled={planChanged}>提交效果复核<ArrowRight size={16} /></button></form>}
    {(row.status === "review" || row.status === "closed") && <div className="safety-action-section"><h3>已落实的整改措施</h3><dl className="safety-plan-summary"><div><dt>责任人</dt><dd>{row.remediation!.owner}</dd></div><div><dt>完成期限</dt><dd>{row.remediation!.dueDate}{isOverdue(row) && <em>逾期未闭环</em>}</dd></div><div><dt>控制层级</dt><dd>{CONTROL_LEVELS.find(({ value }) => value === row.remediation!.control)?.label}</dd></div></dl><p className="safety-record-note">{row.remediation!.action}</p><div className="safety-completion"><CheckCheck size={18} /><p><b>整改完成说明</b>{row.remediation!.completionEvidence}</p></div></div>}
    {row.status === "review" && <><form className="safety-action-section" onSubmit={(event) => { event.preventDefault(); onAction(row.id, { type: "review", review: { reviewer, evidence, residualRatings: residual, criticalResolved } }); }}><div className="safety-section-heading"><h3>复核措施是否有效</h3><span>建议由另一位人员核验</span></div><label className="safety-block-field">复核人 <em>*</em><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} required maxLength={60} placeholder="填写实际复核人" /></label><label className="safety-block-field">核验依据与结论 <em>*</em><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} required maxLength={3000} rows={3} placeholder="说明复查时间、现场观察/测量结果和证据编号；不能只写“已完成”。" /></label><Ratings value={residual} onChange={setResidual} residual />{critical && <label className="safety-confirm-check"><input type="checkbox" checked={criticalResolved} onChange={(event) => setCriticalResolved(event.target.checked)} /><span>复查确认原关键检查项不符合情形已经排除，并已在上方记录依据</span></label>}<RiskPanel ratings={residual} critical={critical && !criticalResolved} residual /><button className="safety-primary" type="submit" disabled={residual === null ? !criticalResolved : !isRiskRatings(residual)}>保存复核结论<Check size={16} /></button></form><div className="safety-close-area"><div><ShieldCheck size={24} /><div><strong>{reviewChanged ? "复核内容已修改，请重新保存" : row.review ? canClose ? "复核已记录，可以确认闭环" : "残余风险仍需继续整改" : "先保存复核结论，再确认闭环"}</strong><p>{reviewChanged ? "当前输入尚未保存，闭环暂不可用。" : row.review ? `已保存残余 RPN ${inspectionRisk(row).score} · ${inspectionRisk(row).label}。${canClose ? "闭环仅表示本次措施已核验，不代表永久消除风险。" : "高优先风险或未排除的关键问题不能关闭。"}` : "系统保留初始评分、整改计划和复核结果。"}</p></div></div><button className="safety-primary" disabled={!canClose} onClick={() => onAction(row.id, { type: "close" })}>确认闭环<CheckCheck size={16} /></button></div><form className="safety-return-form" onSubmit={(event) => { event.preventDefault(); onAction(row.id, { type: "return", reason: returnReason }); }}><label>复核未通过时可退回整改<input required value={returnReason} onChange={(event) => setReturnReason(event.target.value)} maxLength={1000} placeholder="填写退回原因及还需改进的事项" /></label><button className="safety-subtle" type="submit">退回整改</button></form></>}
    {row.status === "closed" && <div className="safety-closed-summary"><ShieldCheck size={32} /><div><h3>本次巡检已闭环</h3><p>{row.review!.reviewer} 于 {formatTime(row.review!.at)} 完成复核</p><p>{row.review!.evidence}</p></div><RiskPanel ratings={row.review!.residualRatings} critical={false} residual /></div>}
    <section className="safety-timeline"><h3>完整流转记录<span>{row.timeline.length} 条</span></h3><ol>{[...row.timeline].reverse().map((event, index) => <li key={`${event.at}-${index}`}><span /><div><p>{event.note}</p><time dateTime={event.at}>{formatTime(event.at)}</time></div></li>)}</ol></section></div>
  </article>;
}

export default function Safety({ inspections, onChange, notify, selectedId, onSelect, view, onViewChange }: Props) {
  const { storageLabel } = useDeployment();
  const [formVersion, setFormVersion] = useState(0);
  const { filter, search } = view;
  const selected = inspections.find(({ id }) => id === selectedId);
  const stats = useMemo(() => ({ open: inspections.filter(({ status }) => status !== "closed").length, high: inspections.filter((row) => row.status !== "closed" && inspectionRisk(row).level === "high").length, overdue: inspections.filter((row) => isOverdue(row)).length, closed: inspections.filter(({ status }) => status === "closed").length }), [inspections]);
  const visible = inspections.filter((row) => (filter === "all" || filter === "open" && row.status !== "closed" || filter === "overdue" && isOverdue(row) || filter === "review" && row.status === "review" || filter === "high" && row.status !== "closed" && inspectionRisk(row).level === "high" || filter === "closed" && row.status === "closed") && [row.site, row.inspector, row.remediation?.owner ?? "", SAFETY_TEMPLATES.find(({ id }) => id === row.templateId)?.name ?? ""].join(" ").toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const handleAction = (id: string, action: InspectionAction) => {
    const current = inspections.find((row) => row.id === id);
    if (!current) return;
    try { const next = transitionInspection(current, action); onChange((prev) => prev.map((row) => row.id === id ? next : row)); notify(action.type === "close" ? "复核通过，本次巡检已闭环" : action.type === "return" ? "已退回整改，原流转记录保留" : action.type === "review" ? "复核结论已保存，可继续确认闭环或退回整改" : "整改进展已保存"); } catch (caught) { notify(caught instanceof Error ? caught.message : "保存失败，请检查填写内容。"); }
  };
  const handleDelete = (row: Inspection) => {
    if (!window.confirm(`确定删除「${row.site}」的巡检记录（${row.id}）吗？\n关联的整改、复核和完整流转历史将一并删除，此操作不可恢复。`)) return;
    onChange((prev) => prev.filter(({ id }) => id !== row.id));
    if (selectedId === row.id) onSelect(null);
    notify("巡检记录已删除，正在同步到账号");
  };
  const startNew = () => { onSelect(null); setFormVersion((value) => value + 1); };
  const filters: { value: InspectionViewState["filter"]; label: string }[] = [{ value: "all", label: "全部" }, { value: "open", label: "待处理" }, { value: "review", label: "待复核" }, { value: "high", label: "高优先" }, { value: "overdue", label: "逾期" }, { value: "closed", label: "已闭环" }];
  const statCards: { label: string; value: number; icon: typeof ClipboardCheck; caption: string; filter: InspectionViewState["filter"] }[] = [{ label: "待处理记录", value: stats.open, icon: ClipboardCheck, caption: "从登记到复核", filter: "open" }, { label: "高优先风险", value: stats.high, icon: ShieldAlert, caption: "含严重后果优先规则", filter: "high" }, { label: "逾期未闭环", value: stats.overdue, icon: Clock3, caption: "按整改截止日期统计", filter: "overdue" }, { label: "已完成闭环", value: stats.closed, icon: ShieldCheck, caption: "措施有效性已复核", filter: "closed" }];
  return <div className="safety-page">
    <header className="safety-page-header"><div><span className="safety-eyebrow">SAFETY / FIELD OPERATIONS</span><h1>安全巡检</h1><p>巡检台账 · 整改落实 · 效果复核</p></div><button className="safety-primary" onClick={startNew}><Plus size={17} />新建巡检</button></header>
    <div className="safety-stats">{statCards.map(({ label, value, icon: Icon, caption, filter: targetFilter }, index) => <button className={`safety-stat stat-${index}`} key={label} aria-pressed={filter === targetFilter} onClick={() => onViewChange({ ...view, search: "", filter: targetFilter })}><span><Icon size={17} />{label}</span><strong>{value.toString().padStart(2, "0")}</strong><small>{caption}</small></button>)}</div>
    <div className={`safety-layout ${selectedId ? "has-selection" : ""}`}>
      <div className="safety-main">
        {selectedId && <div className="safety-detail-toolbar"><button className="safety-subtle" onClick={() => onSelect(null)}><ArrowLeft size={16} />关闭详情</button>{selected && <button type="button" className="safety-delete" aria-label={`删除巡检记录：${selected.site}`} title="删除巡检记录" onClick={() => handleDelete(selected)}><Trash2 size={17} /></button>}</div>}
        {selected ? <InspectionDetail key={`${selected.id}:${selected.status}`} row={selected} onAction={handleAction} notify={notify} /> : selectedId ? <div className="safety-unavailable" role="status"><ShieldAlert size={28} /><h2>巡检记录不可用</h2><p>记录可能已移除，或不属于当前账号。</p><button className="safety-subtle" onClick={startNew}><Plus size={16} />新建巡检</button></div> : <InspectionForm key={formVersion} onSave={(row) => { onChange((prev) => [row, ...prev]); onSelect(row.id); notify("巡检已登记，请继续明确整改责任与措施"); }} />}
      </div>
      <aside className="safety-records"><div className="safety-records-header"><div><span className="safety-eyebrow">INSPECTION REGISTER</span><h2>巡检台账 <span>{inspections.length}</span></h2></div><ClipboardCheck size={24} /></div>
        <label className="safety-search"><Search size={16} /><input value={search} onChange={(event) => onViewChange({ ...view, search: event.target.value })} placeholder="搜索地点、人员、场景" aria-label="搜索巡检台账" /></label>
        <div className="safety-filters" aria-label="筛选巡检记录">{filters.map(({ value, label }) => <button key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => onViewChange({ ...view, filter: value })}>{label}</button>)}</div>
        <div className="safety-record-list">{visible.length ? visible.map((row) => { const risk = inspectionRisk(row); const template = SAFETY_TEMPLATES.find(({ id }) => id === row.templateId) as SafetyTemplate; return <div className="safety-record-entry" key={row.id}><button type="button" onClick={() => onSelect(row.id)} aria-current={selectedId === row.id ? "true" : undefined} className={`safety-record ${selectedId === row.id ? "selected" : ""}`}><span className="safety-record-top"><span className={`safety-risk-badge ${risk.level}`}>{risk.label} · {risk.score}</span>{isOverdue(row) && <em>已逾期</em>}</span><strong>{row.site}<ChevronRight size={16} /></strong><small>{template.name} · {row.inspector}</small><span className="safety-record-bottom"><b className={row.status === "closed" ? "closed" : ""}>{STATUS_LABELS[row.status]}</b><time>{formatTime(row.updatedAt)}</time></span></button><button type="button" className="safety-delete" aria-label={`删除巡检记录：${row.site}`} title="删除巡检记录" onClick={() => handleDelete(row)}><Trash2 size={16} /></button></div>; }) : <div className="safety-empty"><ClipboardCheck size={36} /><strong>{inspections.length ? "没有符合条件的记录" : "暂无巡检记录"}</strong><p>{inspections.length ? "尝试切换筛选或搜索关键词。" : "登记后显示巡检与整改进展。"}</p></div>}</div>
        <div className="safety-register-footnote"><ShieldCheck size={18} /><p>参考 FMEA 风险评价与 NIOSH 控制层级。当前记录归属您的账号，保存在{storageLabel}，尚未提交校方。</p></div>
      </aside>
    </div>
  </div>;
}
