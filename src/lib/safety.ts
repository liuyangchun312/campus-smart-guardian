export type SafetyAnswer = "unchecked" | "passed" | "failed";
export type RiskRatings = { severity: number; occurrence: number; detection: number };
export type ResidualRiskRatings = RiskRatings | null;
export type ControlLevel = "elimination" | "substitution" | "engineering" | "administrative" | "ppe";
export type SafetyTemplate = {
  id: string;
  name: string;
  context: string;
  icon: "cleaning" | "electrical" | "heat";
  checks: { id: string; text: string; help: string; critical?: boolean }[];
};
export type Remediation = { owner: string; dueDate: string; action: string; control: ControlLevel; completionEvidence?: string };
export type SafetyReview = { reviewer: string; evidence: string; residualRatings: ResidualRiskRatings; criticalResolved: boolean; at: string };
export type InspectionStatus = "registered" | "remediating" | "review" | "closed";
export type Inspection = {
  id: string;
  templateId: string;
  site: string;
  inspector: string;
  notes: string;
  answers: Record<string, SafetyAnswer>;
  ratings: RiskRatings;
  status: InspectionStatus;
  createdAt: string;
  updatedAt: string;
  remediation?: Remediation;
  review?: SafetyReview;
  timeline: { at: string; status: InspectionStatus; note: string }[];
};

export const SAFETY_TEMPLATES: SafetyTemplate[] = [
  { id: "cleaning", name: "保洁与化学品", context: "楼宇保洁 · 清洁剂使用 · 湿滑区域", icon: "cleaning", checks: [
    { id: "chemical", text: "清洁剂有标签，按说明使用且未混用", help: "特别核查含氯清洁剂与酸性产品、氨类产品分开使用。", critical: true },
    { id: "isolation", text: "湿滑地面已隔离并设置可见提示", help: "先隔离作业区，再清洁；恢复通行前确认地面干燥。" },
    { id: "storage", text: "药剂妥善封存，现场具备通风条件", help: "原包装存放，不使用饮料瓶分装；避免密闭空间积聚。" },
    { id: "protection", text: "按产品要求配备并正确使用防护用品", help: "核对手套、护目镜等是否适用；个人防护不能代替通风和隔离。" },
  ] },
  { id: "electrical", name: "用电与设备", context: "配电区域 · 插座电缆 · 设备维护", icon: "electrical", checks: [
    { id: "live", text: "无裸露带电部位、异常火花或焦糊气味", help: "发现异常立即远离并隔离，由具备资格的人员处置。", critical: true },
    { id: "maintenance", text: "维护作业已停机断电并防止意外启动", help: "断电与能源隔离由有资质人员按现场规程确认。", critical: true },
    { id: "cable", text: "电缆插座完好，无积水和过载迹象", help: "查看外观与环境，不触碰疑似带电或破损部位。" },
    { id: "access", text: "配电通道畅通，设备使用人员已受培训", help: "确保紧急断电位置可达，非专业人员不进行维修。" },
  ] },
  { id: "heat", name: "高温与户外作业", context: "校园绿化 · 搬运 · 户外保洁", icon: "heat", checks: [
    { id: "symptoms", text: "人员无意识异常、晕厥等疑似严重热病表现", help: "出现严重症状应停止作业、转移到阴凉处并及时呼叫急救。", critical: true },
    { id: "rest", text: "已安排饮水、阴凉休息点和工作休息轮换", help: "结合现场温度、湿度、负荷和个体情况安排，不用固定温度代替评估。" },
    { id: "acclimatization", text: "新上岗或返岗人员有逐步适应安排", help: "循序增加热暴露，安排同伴观察和异常报告。" },
    { id: "schedule", text: "已评估错峰、遮阳及机械辅助的可行性", help: "优先减少暴露和劳动强度，再辅以培训与个人防护。" },
  ] },
];

export const CONTROL_LEVELS: { value: ControlLevel; label: string; example: string }[] = [
  { value: "elimination", label: "消除", example: "取消危险步骤，直接移除危险源" },
  { value: "substitution", label: "替代", example: "改用更低危的产品或工艺" },
  { value: "engineering", label: "工程控制", example: "隔离、通风、防护装置或机械辅助" },
  { value: "administrative", label: "管理控制", example: "轮班、培训、警示和作业程序" },
  { value: "ppe", label: "个人防护", example: "适配的手套、护目镜等，作为最后一道防线" },
];

export const RATING_GUIDE: { key: keyof RiskRatings; label: string; short: string; descriptions: string[] }[] = [
  { key: "severity", label: "后果严重度", short: "S", descriptions: ["轻微不适，无需医疗处置", "可逆轻伤，可能需简单处理", "需医疗处置或造成停工", "可能造成永久损伤或严重伤害", "可能导致死亡或多人严重伤害"] },
  { key: "occurrence", label: "发生可能性", short: "O", descriptions: ["暴露很少，现有控制稳定", "偶发暴露，发生可能性较低", "周期性暴露，存在发生可能", "频繁暴露或曾反复出现", "危险持续存在或事件即将发生"] },
  { key: "detection", label: "发现难度", short: "D", descriptions: ["可靠监测可提前发现", "通常能在事件前发现", "依赖定期人工检查", "较难在事件前察觉", "缺少监测，通常事后才发现"] },
];

export const STATUS_LABELS: Record<InspectionStatus, string> = { registered: "待制定整改", remediating: "整改中", review: "待复核", closed: "已闭环" };
export const isRiskRatings = (value: unknown): value is RiskRatings => {
  if (!value || typeof value !== "object") return false;
  const rating = value as Record<string, unknown>;
  return ["severity", "occurrence", "detection"].every((key) => typeof rating[key] === "number" && Number.isInteger(rating[key]) && (rating[key] as number) >= 1 && (rating[key] as number) <= 5);
};

/** Project heuristic inspired by FMEA, not a standardized FMEA scale or safety certification. */
export function getRisk(ratings: ResidualRiskRatings, criticalFailure = false): { score: number; level: "low" | "medium" | "high"; label: string; reason: string } {
  if (ratings === null) return { score: 0, level: criticalFailure ? "high" : "low", label: criticalFailure ? "高优先" : "无风险（未发现问题）", reason: criticalFailure ? "关键检查项尚未确认排除" : "本次复查未发现残余风险" };
  if (!isRiskRatings(ratings)) throw new Error("S、O、D 必须是 1–5 的整数。");
  const score = ratings.severity * ratings.occurrence * ratings.detection;
  const level = criticalFailure || ratings.severity >= 4 || score >= 50 ? "high" : score >= 20 ? "medium" : "low";
  return { score, level, label: level === "high" ? "高优先" : level === "medium" ? "中优先" : "常规", reason: criticalFailure ? "关键检查项不符合，优先处理" : ratings.severity >= 4 ? "严重度 S ≥ 4，触发严重后果优先规则" : `RPN ${score}；按项目阈值排序` };
}

export function hasCriticalFailure(inspection: Pick<Inspection, "templateId" | "answers">): boolean {
  return SAFETY_TEMPLATES.find((template) => template.id === inspection.templateId)?.checks.some((check) => check.critical && inspection.answers[check.id] === "failed") ?? false;
}

export function inspectionRisk(inspection: Inspection) {
  return getRisk(inspection.review ? inspection.review.residualRatings : inspection.ratings, hasCriticalFailure(inspection) && !inspection.review?.criticalResolved);
}

const validDate = (value: unknown): value is string => typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const validDueDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isRemediation = (value: unknown): value is Remediation => {
  if (!value || typeof value !== "object") return false;
  const plan = value as Remediation;
  return nonempty(plan.owner) && validDueDate(plan.dueDate) && nonempty(plan.action) && CONTROL_LEVELS.some(({ value }) => value === plan.control) && (plan.completionEvidence === undefined || typeof plan.completionEvidence === "string");
};
const isReview = (value: unknown): value is SafetyReview => {
  if (!value || typeof value !== "object") return false;
  const review = value as SafetyReview;
  return nonempty(review.reviewer) && nonempty(review.evidence) && (review.residualRatings === null ? review.criticalResolved === true : isRiskRatings(review.residualRatings)) && typeof review.criticalResolved === "boolean" && validDate(review.at);
};

export function isOverdue(inspection: Inspection, now: Date = new Date()): boolean {
  if (!inspection.remediation || inspection.status === "closed") return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return inspection.remediation.dueDate < today;
}

export function isInspections(value: unknown): value is Inspection[] {
  if (!Array.isArray(value) || value.length > 5000) return false;
  const ids = new Set<string>();
  return value.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Inspection;
    const template = SAFETY_TEMPLATES.find(({ id }) => id === row.templateId);
    if (!nonempty(row.id) || ids.has(row.id) || !template || !nonempty(row.site) || !nonempty(row.inspector) || typeof row.notes !== "string" || !isRiskRatings(row.ratings) || !Object.hasOwn(STATUS_LABELS, row.status) || !validDate(row.createdAt) || !validDate(row.updatedAt) || !row.answers || typeof row.answers !== "object") return false;
    ids.add(row.id);
    if (!template.checks.every(({ id }) => row.answers[id] === "passed" || row.answers[id] === "failed")) return false;
    if (row.remediation !== undefined && !isRemediation(row.remediation)) return false;
    if (row.review !== undefined && !isReview(row.review)) return false;
    if ((row.status === "registered" || row.status === "remediating") && row.review !== undefined) return false;
    if (row.status !== "registered" && !row.remediation) return false;
    if ((row.status === "review" || row.status === "closed") && !nonempty(row.remediation?.completionEvidence)) return false;
    if (row.status === "closed" && (!row.review || inspectionRisk(row).level === "high")) return false;
    return Array.isArray(row.timeline) && row.timeline.length > 0 && row.timeline.at(-1)?.status === row.status && row.timeline.every((event) => event && validDate(event.at) && Object.hasOwn(STATUS_LABELS, event.status) && nonempty(event.note));
  });
}

export function createInspection(input: Pick<Inspection, "templateId" | "site" | "inspector" | "notes" | "answers" | "ratings">, now = new Date().toISOString()): Inspection {
  const row: Inspection = { ...input, site: input.site.trim(), inspector: input.inspector.trim(), notes: input.notes.trim(), answers: { ...input.answers }, ratings: { ...input.ratings }, id: crypto.randomUUID(), status: "registered", createdAt: now, updatedAt: now, timeline: [{ at: now, status: "registered", note: "完成现场检查并登记风险" }] };
  if (!isInspections([row])) throw new Error("请填写检查地点、检查人，并完成全部检查项和风险评分。");
  return row;
}

export type InspectionAction =
  | { type: "plan"; plan: Remediation }
  | { type: "submit-review"; evidence: string }
  | { type: "review"; review: Omit<SafetyReview, "at"> }
  | { type: "return"; reason: string }
  | { type: "close" };

export function transitionInspection(inspection: Inspection, action: InspectionAction, now = new Date().toISOString()): Inspection {
  if (!isInspections([inspection])) throw new Error("巡检记录格式无效，无法变更。");
  if (!validDate(now)) throw new Error("操作时间无效。");
  if (inspection.status === "closed") throw new Error("已闭环记录不能跳过重新巡检直接修改。");
  let next = { ...inspection, updatedAt: now };
  let note: string;
  switch (action.type) {
    case "plan":
      if (inspection.status === "review") throw new Error("请先退回整改，再修改整改计划。");
      if (!isRemediation(action.plan)) throw new Error("请填写责任人、有效截止日期、整改措施和控制层级。");
      next = { ...next, status: "remediating", remediation: { ...action.plan, owner: action.plan.owner.trim(), action: action.plan.action.trim(), completionEvidence: undefined }, review: undefined };
      note = `落实整改计划；责任人：${next.remediation!.owner}；期限：${action.plan.dueDate}`;
      break;
    case "submit-review":
      if (inspection.status !== "remediating" || !inspection.remediation) throw new Error("须先制定整改计划，再提交复核。");
      if (!nonempty(action.evidence)) throw new Error("请填写整改完成情况，供复核核验。");
      next = { ...next, status: "review", remediation: { ...inspection.remediation, completionEvidence: action.evidence.trim() }, review: undefined };
      note = "已提交整改完成说明，等待复核";
      break;
    case "review": {
      if (inspection.status !== "review") throw new Error("仅待复核记录可填写复核结论。");
      const review = { ...action.review, at: now };
      if (review.residualRatings === null && !review.criticalResolved) throw new Error("关键检查项尚未确认排除，不能记录为无风险。");
      if (!isReview(review)) throw new Error("请填写复核人、核验依据，并选择无风险或填写有效的残余风险评分。");
      next = { ...next, review: { ...review, reviewer: review.reviewer.trim(), evidence: review.evidence.trim(), residualRatings: review.residualRatings === null ? null : { ...review.residualRatings } } };
      note = `保存复核结论；复核人：${review.reviewer}；${review.residualRatings === null ? "残余风险：无风险（未发现问题）；" : ""}残余 RPN：${getRisk(review.residualRatings).score}`;
      break;
    }
    case "return":
      if (inspection.status !== "review" || !nonempty(action.reason)) throw new Error("待复核记录退回时须填写原因。");
      next = { ...next, status: "remediating", review: undefined, remediation: { ...inspection.remediation!, completionEvidence: undefined } };
      note = `退回整改：${action.reason.trim()}`;
      break;
    case "close":
      if (inspection.status !== "review" || !inspection.review) throw new Error("须完成整改、提交复核并保存复核结论后才能闭环。");
      if (inspectionRisk(inspection).level === "high") throw new Error("残余风险仍为高优先，或关键检查项尚未排除，须继续整改。");
      next = { ...next, status: "closed" };
      note = "复核后确认措施有效，关闭本次记录";
      break;
  }
  return { ...next, timeline: [...inspection.timeline, { at: now, status: next.status, note }] };
}

export function inspectionMarkdown(inspection: Inspection): string {
  const template = SAFETY_TEMPLATES.find(({ id }) => id === inspection.templateId)!;
  const risk = getRisk(inspection.ratings, hasCriticalFailure(inspection));
  const sections = [`# 巡检与整改记录`, `编号：${inspection.id}\n地点：${inspection.site}\n场景：${template.name}\n检查人：${inspection.inspector}\n状态：${STATUS_LABELS[inspection.status]}\n登记时间：${inspection.createdAt}`, `## 检查结果\n${template.checks.map(({ id, text }) => `- ${inspection.answers[id] === "passed" ? "符合" : "不符合"}：${text}`).join("\n")}\n现场备注：${inspection.notes || "无"}`, `## 初始风险\nS=${inspection.ratings.severity} / O=${inspection.ratings.occurrence} / D=${inspection.ratings.detection}\nRPN=${risk.score}；${risk.label}；${risk.reason}`];
  if (inspection.remediation) sections.push(`## 整改\n责任人：${inspection.remediation.owner}\n期限：${inspection.remediation.dueDate}\n控制层级：${CONTROL_LEVELS.find(({ value }) => value === inspection.remediation!.control)?.label}\n措施：${inspection.remediation.action}\n完成说明：${inspection.remediation.completionEvidence || "尚未提交"}`);
  if (inspection.review) {
    const { reviewer, evidence, residualRatings, criticalResolved } = inspection.review;
    const residual = residualRatings === null ? "残余风险：无风险（未发现问题）" : `残余 S/O/D：${residualRatings.severity}/${residualRatings.occurrence}/${residualRatings.detection}`;
    sections.push(`## 复核\n复核人：${reviewer}\n核验依据：${evidence}\n${residual}\n残余 RPN：${inspectionRisk(inspection).score}；${inspectionRisk(inspection).label}\n关键项已排除：${criticalResolved ? "是" : "否"}`);
  }
  sections.push(`## 流转记录\n${inspection.timeline.map(({ at, note }) => `- ${at}：${note}`).join("\n")}`, "## 方法边界\n采用 FMEA 思路的简化排序工具。S/O/D 1–5，RPN=S×O×D；RPN ≥ 50 为高优先，20–49 为中优先，其余常规；S ≥ 4 或关键项不符合直接高优先。量表、阈值与严重度优先规则均为本项目约定，不是行业统一标准。控制措施参考 NIOSH 控制层级。本地记录不等于已提交校方或专业安全评估。");
  return sections.join("\n\n");
}
