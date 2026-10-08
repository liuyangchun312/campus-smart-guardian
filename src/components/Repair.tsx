import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  DoorOpen,
  Droplets,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { classifyRepair, extractRepairLocation, validateRepairDraft, type RepairDraft } from "../lib/repair";
import { useDeployment } from "../lib/deployment";
import type { WorkOrder } from "../types";
import "./orders.css";

export default function Repair({
  onSave,
  onOrders,
  draft,
  onDraftChange,
}: {
  onSave: (order: WorkOrder) => void;
  onOrders: () => void;
  draft: RepairDraft;
  onDraftChange: (draft: RepairDraft) => void;
}) {
  const { storageLabel } = useDeployment();
  const { description, location, category, priority } = draft;
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateRepairDraft(draft) : {};
  const [extracted, setExtracted] = useState(false);
  const assessment = classifyRepair(description);
  const effectivePriority = assessment.priority === "特急" ? "特急" : priority;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const invalid = validateRepairDraft(draft);
    if (invalid.description || invalid.location) {
      document.getElementById(invalid.description ? "repair-description" : "repair-location")?.focus();
      return;
    }
    const now = new Date().toISOString();
    onSave({
      id: `BX-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      category,
      location: location.trim(),
      description: description.trim(),
      priority: effectivePriority,
      safety: assessment.safety,
      status: "draft",
      createdAt: now,
      history: [{ status: "draft", at: now }],
    });
  };
  return (
    <div className="page-enter repair-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">报修登记</span>
          <h1>
            校园后勤报修 <Wrench size={25} />
          </h1>
          <p>填写现场情况，生成一张清楚、规范的报修工单。</p>
        </div>
        <button className="button outline small" onClick={onOrders}>
          <ClipboardList size={16} />
          我的工单
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="repair-layout">
        <form className="repair-form" onSubmit={submit} noValidate>
          <div className="form-section-title">
            <span>01</span>
            <h2>故障情况</h2>
          </div>
          <label className="field-label" htmlFor="repair-description">
            故障描述 <span>*</span>
          </label>
          <textarea
            id="repair-description"
            className="form-textarea"
            required
            minLength={8}
            maxLength={1500}
            aria-describedby={`repair-description-help${errors.description ? " repair-description-error" : ""}`}
            aria-invalid={Boolean(errors.description)}
            rows={4}
            value={description}
            onChange={(event) => {
              onDraftChange({ ...draft, description: event.target.value });
              setExtracted(false);
            }}
            placeholder="例如：北区 3 号宿舍楼 201 室，洗手池下面的水管一直漏水，地上已经有积水。"
          />
          <div className="field-help-row">
            <span id="repair-description-help">描述故障现象、发生时间及影响，至少 8 个字。</span>
            <button
              type="button"
              className="text-button accent"
              disabled={description.trim().length < 4}
              onClick={() => {
                onDraftChange({ ...draft, category: assessment.category, priority: assessment.priority,
                  location: location.trim() ? location : extractRepairLocation(description) });
                setExtracted(true);
              }}
            >
              {extracted ? <Check size={14} /> : <Sparkles size={14} />}
              {extracted ? "已提取，请核对" : "帮我提取工单要素"}
            </button>
          </div>
          {errors.description && <p className="repair-field-error" id="repair-description-error" role="alert">{errors.description}</p>}
          {assessment.priority === "特急" && (
            <div className="danger-notice" role="alert">
              <AlertTriangle size={20} />
              <div>
                <strong>涉及人身安全，请先远离险情</strong>
                <p>{assessment.safety}</p>
                <p>
                  本页面不会通知救援人员，请直接联系学校值班人员或应急救援。
                </p>
              </div>
            </div>
          )}
          <div className="form-divider" />
          <div className="form-section-title">
            <span>02</span>
            <h2>补充现场信息</h2>
          </div>
          <label className="field-label" htmlFor="repair-location">
            发生地点 <span>*</span>
          </label>
          <div className="input-icon">
            <MapPin size={17} />
            <input
              id="repair-location"
              required
              minLength={4}
              maxLength={120}
              aria-describedby={`repair-location-help${errors.location ? " repair-location-error" : ""}`}
              aria-invalid={Boolean(errors.location)}
              value={location}
              onChange={(event) => onDraftChange({ ...draft, location: event.target.value })}
              placeholder="校区 · 楼栋 · 楼层 / 房号"
            />
          </div>
          <p className="field-help" id="repair-location-help">
            地点越具体，维修人员越容易找到。请核对自动提取的结果。
          </p>
          {errors.location && <p className="repair-field-error" id="repair-location-error" role="alert">{errors.location}</p>}
          <span className="field-label" id="repair-category-label">工单类型</span>
          <div className="category-options" role="group" aria-labelledby="repair-category-label">
            {[
              { text: "水电与暖通", icon: Droplets },
              { text: "门禁与物联网", icon: DoorOpen },
              { text: "公共设施", icon: Wrench },
              { text: "环境与卫生", icon: Lightbulb },
            ].map((item) => (
              <button
                key={item.text}
                type="button"
                className={category === item.text ? "active" : ""}
                aria-pressed={category === item.text}
                onClick={() => onDraftChange({ ...draft, category: item.text })}
              >
                <item.icon size={19} />
                {item.text}
                {category === item.text && <Check size={13} />}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="repair-priority">
            紧急程度
          </label>
          <select
            id="repair-priority"
            value={effectivePriority}
            disabled={assessment.priority === "特急"}
            onChange={(event) =>
              onDraftChange({ ...draft, priority: event.target.value as WorkOrder["priority"] })
            }
          >
            <option value="普通">普通 · 暂不影响正常使用</option>
            <option value="紧急">紧急 · 影响正常工作与生活</option>
            <option value="特急">
              特急 · 涉及生命、电气或其他严重安全风险
            </option>
          </select>
          <div className="form-footer">
            <p>
              <ShieldCheck size={16} />
              工单将保存于{storageLabel}，归属当前账号，尚未发送给学校。
              <br />
              <span>保存后可复制，通过学校的正式报修渠道提交。</span>
            </p>
            <button className="button primary" type="submit">
              <ClipboardList size={16} />
              保存报修工单
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
        <aside className="repair-sidebar">
          <div className="repair-guide">
            <span className="service-icon">
              <ClipboardList size={27} />
            </span>
            <h3>
              提交前核对
            </h3>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>说清故障</strong>
                  <p>发生了什么？现在有何影响？</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>确认地点</strong>
                  <p>校区、楼栋、楼层和房号。</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>复制并提交</strong>
                  <p>通过学校正式渠道发送工单。</p>
                </div>
              </li>
            </ol>
            <div className="guide-note">
              <ShieldCheck size={19} />
              <p>
                安全比报修更优先。
                <br />
                遇到险情，先远离、再求助。
              </p>
            </div>
          </div>
          <button className="back-link" onClick={onOrders}>
            <ArrowLeft size={14} />
            查看已保存的工单
          </button>
        </aside>
      </div>
    </div>
  );
}
