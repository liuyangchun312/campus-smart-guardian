import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, ClipboardCheck, FilePenLine, RefreshCw, Wrench } from "lucide-react";
import { getRepairFindings } from "../lib/inspection-repair";
import { orderStatusLabel } from "../lib/orders";
import { validateRepairDraft } from "../lib/repair";
import { SAFETY_TEMPLATES, type Inspection } from "../lib/safety";
import type { WorkOrder } from "../types";
import "./inspection-repair.css";

type RepairFields = { location: string; description: string };
type Props = {
  inspection: Inspection;
  orders: WorkOrder[];
  deletedOrderIds: string[];
  onCreateDraft: (inspectionId: string, checkId: string, fields: RepairFields) => Promise<boolean>;
  onOpenOrder: (orderId: string) => void;
  onUseResult?: (note: string) => void;
  loading: boolean;
  error: string;
  onRefresh: () => void;
};

type Finding = ReturnType<typeof getRepairFindings>[number];

export default function InspectionRepair(props: Props) {
  const { inspection } = props;
  const links = inspection.repairLinks ?? [];
  const findings = getRepairFindings(inspection);
  const choices = inspection.status === "closed"
    ? findings.filter(finding => links.some(link => link.checkId === finding.checkId))
    : [...findings];
  for (const { checkId } of links) {
    if (!choices.some(finding => finding.checkId === checkId)) {
      const check = SAFETY_TEMPLATES.find(template => template.id === inspection.templateId)?.checks.find(item => item.id === checkId);
      choices.push({ checkId, label: check?.repairLabel ?? "原巡检检查项", description: "" });
    }
  }
  if (!choices.length) return null;
  return <FindingPanel key={inspection.id} {...props} choices={choices} />;
}

function FindingPanel({ choices, inspection, onCreateDraft, ...orderProps }: Props & { choices: Finding[] }) {
  const fieldId = useId();
  const links = inspection.repairLinks ?? [];
  const [selection, setSelection] = useState(links[0]?.checkId ?? choices[0].checkId);
  const [edits, setEdits] = useState<Record<string, RepairFields>>({});
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [awaitingLinks, setAwaitingLinks] = useState<string[]>([]);
  const submitting = useRef(false);
  const finding = choices.find(item => item.checkId === selection) ?? choices[0];
  const { checkId } = finding;
  const link = links.find(item => item.checkId === checkId);
  const fields = edits[checkId] ?? { location: inspection.site, description: finding.description };
  const errors = attempted ? validateRepairDraft(fields) : {};
  const saved = awaitingLinks.includes(checkId);

  useEffect(() => {
    if (!awaitingLinks.length || !inspection.repairLinks?.length) return;
    const acknowledged = new Set(inspection.repairLinks.map(item => item.checkId));
    const waiting = awaitingLinks.filter(id => !acknowledged.has(id));
    if (waiting.length !== awaitingLinks.length) setAwaitingLinks(waiting);
  }, [inspection.repairLinks, awaitingLinks]);

  function selectFinding(next: string) {
    setSelection(next);
    setAttempted(false);
    setSaveError("");
  }

  function editField(name: keyof RepairFields, value: string) {
    setEdits(previous => ({ ...previous, [checkId]: { ...fields, [name]: value } }));
    setSaveError("");
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || link || saved || inspection.status === "closed") return;
    setAttempted(true);
    setSaveError("");
    const invalid = validateRepairDraft(fields);
    if (invalid.location || invalid.description) {
      const first = event.currentTarget.elements.namedItem(invalid.location ? "location" : "description");
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      if (await onCreateDraft(inspection.id, checkId, { location: fields.location.trim(), description: fields.description.trim() })) {
        setAwaitingLinks(previous => [...previous, checkId]);
      } else {
        setSaveError("上次保存草稿未成功。");
      }
    } catch (caught) {
      setSaveError(caught instanceof Error && caught.message ? caught.message : "草稿未保存，请重试。");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return <section className="inspection-repair" aria-labelledby={`${fieldId}-title`}>
    <div className="inspection-repair__heading"><Wrench size={17} aria-hidden="true" /><h3 id={`${fieldId}-title`}>关联报修</h3></div>
    {choices.length > 1
      ? <label className="inspection-repair__field">选择检查项
          <select value={checkId} disabled={saving} onChange={event => selectFinding(event.target.value)}>
            {choices.map(choice => <option key={choice.checkId} value={choice.checkId}>{choice.label}{links.some(item => item.checkId === choice.checkId) ? "（已关联）" : ""}</option>)}
          </select>
        </label>
      : <p className="inspection-repair__finding"><span>检查项</span>{finding.label}</p>}
    {link
      ? <LinkedOrder {...orderProps} orderId={link.orderId} onUseResult={inspection.status === "remediating" ? orderProps.onUseResult : undefined} />
      : <form className="inspection-repair__form" noValidate onSubmit={saveDraft}>
          <label className="inspection-repair__field">报修地点
            <input name="location" required maxLength={120} value={fields.location} disabled={saving || saved}
              aria-invalid={errors.location ? true : undefined} aria-describedby={errors.location ? `${fieldId}-location-error` : undefined}
              onChange={event => editField("location", event.target.value)} />
          </label>
          {errors.location && <p className="inspection-repair__error" role="alert" id={`${fieldId}-location-error`}>{errors.location}</p>}
          <label className="inspection-repair__field">故障描述
            <textarea name="description" required rows={3} maxLength={1500} value={fields.description} disabled={saving || saved}
              aria-invalid={errors.description ? true : undefined} aria-describedby={errors.description ? `${fieldId}-description-error` : undefined}
              onChange={event => editField("description", event.target.value)} />
          </label>
          {errors.description && <p className="inspection-repair__error" role="alert" id={`${fieldId}-description-error`}>{errors.description}</p>}
          <div className="inspection-repair__save">
            <p role={saved ? "status" : undefined}>{saved ? "草稿已保存。" : "草稿仅自己可见，可前往「我的工单」提交给学校。"}</p>
            <button type="submit" className="inspection-repair__primary" disabled={saving || saved}><FilePenLine size={15} aria-hidden="true" />{saving ? "正在保存…" : saved ? "已保存草稿" : "保存报修草稿"}</button>
          </div>
        </form>}
    {link && saving && <p className="inspection-repair__notice" role="status">正在同步报修草稿…</p>}
    {saveError && <p className="inspection-repair__error" role="alert">{saveError} {link ? "请查看页面上的账号同步状态。" : "填写的内容已保留，可再次保存。"}</p>}
  </section>;
}

type LinkedOrderProps = Omit<Props, "inspection" | "onCreateDraft"> & { orderId: string };

function LinkedOrder({ orderId, orders, deletedOrderIds, loading, error, onOpenOrder, onUseResult, onRefresh }: LinkedOrderProps) {
  const order = orders.find(item => item.id === orderId);
  if (deletedOrderIds.includes(orderId)) return <div className="inspection-repair__record">
    <p className="inspection-repair__reference">关联工单 <code>{orderId}</code></p>
    <p className="inspection-repair__notice">已从个人工单移除。校方仍保留办理记录。</p>
  </div>;

  const refresh = <button type="button" className="inspection-repair__text-button" disabled={loading} onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />刷新进度</button>;
  if (!order || loading || error) return <div className="inspection-repair__record">
    <p className="inspection-repair__reference">关联工单 <code>{orderId}</code></p>
    {error
      ? <p className="inspection-repair__error" role="alert">工单进度未能更新。{error}</p>
      : <p className="inspection-repair__notice" role="status">{loading ? "正在读取关联工单…" : "暂时无法查看这张关联工单。"}</p>}
    <div className="inspection-repair__actions">{!loading && refresh}
      {order && <button type="button" className="inspection-repair__text-button" onClick={() => onOpenOrder(orderId)}>查看关联记录<ArrowRight size={14} aria-hidden="true" /></button>}
    </div>
  </div>;

  const draft = !order.school && order.status === "draft";
  const completion = order.school && (order.status === "awaiting_confirmation" || order.status === "resolved")
    ? [...order.history].reverse().find(entry => entry.status === "awaiting_confirmation")
    : undefined;
  const note = completion?.actorRole === "user" ? undefined : completion?.note?.trim();
  return <div className="inspection-repair__record">
    <div className="inspection-repair__summary">
      <p className="inspection-repair__reference">{order.school ? "校方工单" : draft ? "个人草稿" : "个人历史记录"} <code>{orderId}</code></p>
      <strong className="inspection-repair__status">{orderStatusLabel(order)}</strong>
    </div>
    {order.school && <p className="inspection-repair__assignee"><span>办理人</span>{order.school.assignee || "待学校指派"}</p>}
    {note && <div className="inspection-repair__result"><h4>校方处理结果</h4><p>{note}</p></div>}
    <div className="inspection-repair__actions">
      <button type="button" className="inspection-repair__primary" onClick={() => onOpenOrder(orderId)}>{draft ? "查看草稿" : "查看工单"}<ArrowRight size={15} aria-hidden="true" /></button>
      {note && onUseResult && <button type="button" className="inspection-repair__text-button" onClick={() => onUseResult(note)}><ClipboardCheck size={15} aria-hidden="true" />填入整改完成说明</button>}
      {order.school && refresh}
    </div>
  </div>;
}
