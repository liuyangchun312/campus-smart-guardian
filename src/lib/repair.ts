import type { WorkOrder } from "../types";

export type RepairDraft = { description: string; location: string; category: string; priority?: WorkOrder["priority"] };
export const emptyRepairDraft: RepairDraft = { description: "", location: "", category: "水电与暖通" };
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

const electricalDevice = "(?:插座|排插|插排|插线板|接线板|电源(?:线)?|电线|开关|配电(?:箱|柜|盘)|电箱)";
const negatedDeviceObservation = new RegExp(
  `(?:没有|没|未)(?:发现|看到|观察到|见到|见)${electricalDevice}(?:明显|正在|有|在)?$`,
);

export function hasActiveRisk(description: string, pattern: RegExp): boolean {
  return [...description.matchAll(new RegExp(pattern.source, "g"))].some((match) => {
    const before = description.slice(Math.max(0, match.index! - 30), match.index);
    const clause = before.split(/[，。；！？,;!?\n]/).pop() ?? "";
    const negated = /(?:没有|无|没|未|不是|不会|不要|不|别|不存在|避免|防止|预防)(?:明显的?|发现|出现|发生过?|任何|情况是|发生的|看到|闻到|正在|在|让|有)*\s*$/.test(clause);
    const negatedList = /(?:没有|无|没|未)(?:发现|出现|看到)?(?:漏电|触电|短路|火花|焦味|冒烟|起火|着火)(?:\s*[、和及或与]\s*(?:漏电|触电|短路|火花|焦味|冒烟|起火|着火))*\s*[、和及或与]\s*$/.test(clause);
    return !negated && !negatedList && !negatedDeviceObservation.test(clause);
  });
}

export function hasWaterLeak(description: string): boolean {
  return hasActiveRisk(description, /(?:水管|水龙头|洗手池)?(?:持续|正在|大量)?漏水(?!传感器|报警器|探测器|检测)/);
}

const adverbs = "(?:已经?|正在?|仍然?|仍在|还在|逐渐|慢慢|直接|开始|也|又|都)*";
const route = "(?:(?:顺着|沿着)(?:墙面|墙边|墙角|地面|管道))?";
const qualifier = "(?:[^没未无不但、，,]{1,8}的|墙上|墙边|墙角|地面)?";
const deviceCount = "(?:[这那]?[一二三四五六七八九十两\\d]+个|[这那]个)?";
const reachesDevice = `${route}(?:流[到入进向]|淹[到没]|漫[到过]|渗[到入进]|溅到|靠近|接触到?|浸泡|泡着)了?${qualifier}${deviceCount}${electricalDevice}`;
const waterExposure = new RegExp([
  `(?:积水|漏水|水流|水)${adverbs}${reachesDevice}`,
  `${electricalDevice}${adverbs}(?:泡在|浸泡在|浸在|掉进|落在|靠近)${qualifier}(?:地面|地上)?(?:积水|水里|水中)`,
  `${electricalDevice}${adverbs}被(?:积水|水)(?:浸泡|淹没)`,
  `${electricalDevice}(?:旁边?|附近|周围|边上)${adverbs}(?:有|出现|形成|全是)了?积水`,
].join("|"));
const impliedWaterExposure = new RegExp(`^${adverbs}${reachesDevice}`);

export function hasWaterExposure(description: string): boolean {
  for (const sentence of description.split(/[。；！？.;!?\n]/)) {
    let previousMentionsWater = false;
    for (const part of sentence.split(/[，,]|但是|不过|然而|而是|并且|而且|但|却/)) {
      const clause = part.replace(/\s+/g, "");
      if (!clause) continue;
      if (hasActiveRisk(clause, waterExposure)) return true;
      // “水管漏水，已流到插座” keeps the water subject across adjacent clauses.
      if (previousMentionsWater && impliedWaterExposure.test(clause)) return true;
      previousMentionsWater = hasActiveRisk(clause, /积水|漏水|水流|地上的水/);
    }
  }
  return false;
}

export function classifyRepair(description: string) {
  const electrical =
    hasActiveRisk(
      description,
      /漏电|触电|短路|火花|焦味|焦糊味|冒烟|起火|着火|电线裸露|电线掉落/,
    ) || hasWaterExposure(description);
  const gas = hasActiveRisk(
    description,
    /(?:燃气|煤气|天然气|气体)(?:有)?(?:泄漏|漏气|异味)|闻到.{0,8}(?:燃气|煤气)|疑似.{0,8}(?:燃气|煤气)/,
  );
  const trapped = hasActiveRisk(description, /被困|困在|电梯困人/);
  const priority =
    electrical || gas || trapped
      ? "特急"
      : hasWaterLeak(description) || /停水|停电|堵塞|门打不开|无法开门/.test(description)
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
