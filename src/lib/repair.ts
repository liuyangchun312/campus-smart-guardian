import type { WorkOrder } from "../types";

export type RepairDraft = { description: string; location: string; category: string; priority: WorkOrder["priority"] };
export const emptyRepairDraft: RepairDraft = { description: "", location: "", category: "水电与暖通", priority: "普通" };
export type RepairErrors = Partial<Record<"description" | "location", string>>;

export function validateRepairDraft(draft: Pick<RepairDraft, "description" | "location">): RepairErrors {
  const errors: RepairErrors = {};
  const description = draft.description.trim();
  const location = draft.location.trim();
  if (description.length < 8) errors.description = "请描述具体故障，去除首尾空格后至少 8 个字。";
  else if (description.length > 1500) errors.description = "故障描述不能超过 1500 个字。";
  if (location.length < 4) errors.location = "请补充楼栋或房号，去除首尾空格后至少 4 个字。";
  else if (location.length > 120) errors.location = "发生地点不能超过 120 个字。";
  return errors;
}

export function extractRepairLocation(description: string): string {
  const number = "[A-Za-z\\d一二三四五六七八九十百]+";
  const separator = "[\\s，,·-]*";
  const district = `(?:(?:[东西南北中][\\p{Script=Han}\\d ]{0,8}?(?:校区|区)|[\\p{Script=Han}\\d ]{1,12}?校区)${separator})?`;
  const building = `(?:(?:第?\\s*${number}\\s*号\\s*)?(?:宿舍楼|教学楼|办公楼|实验楼|图书馆|食堂)|${number}\\s*号\\s*楼)`;
  const floor = `(?:${separator}第?\\s*${number}\\s*(?:楼|层))?`;
  const room = `(?:${separator}(?:${number}\\s*(?:室|房|教室)|卫生间|洗手间|大厅|走廊|楼梯间))?`;
  return description.match(new RegExp(`${district}${building}${floor}${room}`, "u"))?.[0].trim().replace(/^(?:我在|位于|发生在)\s*/, "") ?? "";
}

export function classifyRepair(description: string) {
  const active = (pattern: RegExp) =>
    [...description.matchAll(new RegExp(pattern.source, "g"))].some((match) => {
      const clause =
        description
          .slice(Math.max(0, match.index! - 30), match.index)
          .split(/[，。；！？,;!?\n]/)
          .pop() ?? "";
      return (
        !/(?:没有|并无|未发现|未出现|未发生|无|没|不是|不存在)(?:明显的?|发现|出现|发生|任何|看到|闻到)*\s*$/.test(
          clause,
        ) &&
        !/(?:没有|并无|未发现|无|没)(?:发现|出现)?(?:漏电|触电|短路|火花|焦味|冒烟|起火|着火)(?:[、和及或与](?:漏电|触电|短路|火花|焦味|冒烟|起火|着火))*[、和及或与]$/.test(
          clause,
        )
      );
    });
  const electrical =
    active(
      /漏电|触电|短路|火花|焦味|焦糊味|冒烟|起火|着火|电线裸露|电线掉落/,
    ) ||
    (/积水|漏水/.test(description) &&
      /流到|淹到|泡在|泡着|浸泡|靠近/.test(description) &&
      /插座|电源|电线|电箱/.test(description));
  const gas = active(
    /(?:燃气|煤气|天然气|气体)(?:有)?(?:泄漏|漏气|异味)|闻到.{0,8}(?:燃气|煤气)|疑似.{0,8}(?:燃气|煤气)/,
  );
  const trapped = active(/被困|困在|电梯困人/);
  const priority =
    electrical || gas || trapped
      ? "特急"
      : /漏水|停水|停电|堵塞|门打不开|无法开门/.test(description)
        ? "紧急"
        : "普通";
  const category = /门禁|感应卡|刷卡/.test(description)
    ? "门禁与物联网"
    : /水|电|灯|插座|暖气|空调/.test(description)
      ? "水电与暖通"
      : /垃圾|保洁|卫生/.test(description)
        ? "环境与卫生"
        : "公共设施";
  const safety = gas
    ? "立即远离疑似泄漏区域，不操作电器开关、不使用明火；到室外安全位置联系校方值班人员，必要时拨打 119。不要自行查漏。"
    : electrical
      ? "远离异常设备和积水，阻止他人接近；不要自行拆修或触碰电线。由具备资质的维修人员断电、验电并做好防护后处理；出现火情请在安全处拨打 119。"
      : trapped
        ? "在安全位置联系校园值班人员和专业救援；电梯被困时使用轿厢应急通话，不撬门、不攀爬，必要时拨打 119。"
        : /漏水|积水/.test(description)
          ? "注意地面防滑，远离积水附近的电器和插座；仅在安全、熟悉阀门位置时关闭就近水阀，其余操作交由专业人员。"
          : "不要自行拆卸设备。提醒维修人员评估现场风险、设立作业提示，并按工种要求做好防护。";
  return { priority, category, safety } as const;
}
