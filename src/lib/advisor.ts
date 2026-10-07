export type Topic = "rights" | "repair" | "safety" | "general";

export type Advice = {
  text: string;
  topic: Topic;
  followups: string[];
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const disclaimer =
  "本建议由 AI 辅助生成，重大争议请向校后勤工会或劳动仲裁机构核实。";

const sources = {
  overtime:
    "[《劳动法》第 41、44 条](https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394625.html)；[人社部发〔2025〕2 号：工资折算](https://app.www.gov.cn/govdata/gov/202501/02/523227/article.html)",
  student:
    "[教育部《高等学校学生勤工助学管理办法（2018 年修订）》](https://www.moe.gov.cn/srcsite/A05/s7505/201809/t20180903_347076.html)",
  chemical:
    "[北京市政府转载疾控提示：消毒剂使用安全](https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202609/t20260919_4871052.html)",
  electrical:
    "[国家消防救援局：电气防火安全](https://www.119.gov.cn/site1/kp/hzyf/jt/2023/37471.shtml)",
  allowance:
    "[天津市政府：高温津贴计发口径](https://www.tj.gov.cn/zmhd/hygqx/202506/t20250605_6947286.html)",
  injury:
    "[《工伤保险条例》第 17 条（最高人民法院发布）](https://www.court.gov.cn/shenpan/xiangqing/2182.html)",
};

const terms = {
  repair:
    /报修|维修|工单|派单|宿舍.{0,8}(?:水|电|门)|漏水|停水|水管|水龙头|堵塞|灯不亮|灯坏|灯泡|灯管|照明|插座|跳闸|停电|断电|门禁|消防节点|烟感|温湿度|传感器|设备故障|空调|暖气|电梯|设施损坏/,
  rights:
    /加班|工资|薪资|欠薪|劳动合同|劳动关系|工伤|仲裁|赔偿|补偿|辞退|解雇|离职|社保|津贴|补贴|勤工助学|兼职|工时|调休|用工|派遣|劳动权益|扣钱|扣薪/,
  safety:
    /安全|防护|防暑|高温|中暑|低温|暴雪|暴雨|雷雨|台风|化学|消毒|清洁剂|洁厕|84|八四|次氯酸|漂白|搬运|搬重物|扭伤|高处|梯子|带电|触电|灭火|消防|着火|冒烟|火花/,
};

function intentText(input: string): string {
  // A declared role gives context; it is not itself a request for rights advice.
  // Only remove a complete, known identity clause, never a clause describing a problem.
  return input
    .replace(
      /(?:^|[，。；！？,;!?\n])\s*(?:我目前是|我们是|我是一名|我是一位|我是|作为一名|作为)(?:(?:学校|校内|校园|大学|后勤|一线|食堂|外包|劳务派遣|派遣|全日制|非全日制|勤工助学|岗位|的)\s*){0,6}(?:学生|员工|人员|工人|职工|劳动者|保洁|宿管|维修工|绿化工|教师|老师|老板|主管|雇主|人事)(?=\s*(?:[，。；！？,;!?\n]|$))/g,
      "",
    )
    .replace(/^[，。；！？,;!?\s]+/, "")
    .trim();
}

const topicOf = (input: string): Topic | undefined => {
  const intent = intentText(input);
  // A fresh task wins over history. Repair requests can naturally contain safety words.
  if (terms.repair.test(intent) && !terms.rights.test(intent)) return "repair";
  if (terms.rights.test(intent)) return "rights";
  if (terms.safety.test(intent)) return "safety";
  return undefined;
};

function activeHazard(input: string, term: RegExp): boolean {
  const matches = input.matchAll(new RegExp(term.source, "g"));
  for (const match of matches) {
    const before = input.slice(
      Math.max(0, (match.index ?? 0) - 20),
      match.index,
    );
    const clause = before.split(/[，。；！？,;!?\n]/).pop() ?? "";
    if (
      /(?:没有|并没有|并无|未发现|未出现|未发生|没有发现|没有出现|无|没|未|不是|不会|不存在)(?:明显的?|发现|出现|发生|任何|发生过|情况是|发生的|看到|闻到)*\s*$/.test(
        clause,
      )
    )
      continue;
    if (
      /(?:没有|并无|无|没|未)(?:发现|出现|看到)?(?:冒烟|漏电|火花|起火|触电|着火)(?:\s*[、和及或与]\s*(?:冒烟|漏电|火花|起火|触电|着火))*\s*[、和及或与]\s*$/.test(
        clause,
      )
    )
      continue;
    return true;
  }
  return false;
}

function resolveContext(input: string, history: ConversationMessage[]): string {
  // Only short follow-up answers inherit context, never a standalone new question.
  const currentTopic = topicOf(input);
  const isSupplement =
    input.length < 90 &&
    /^(?:那|这个|这种|还|我(?:是|在|的|每|已经|没有|还没)|我们|每|月薪|底薪|基本工资|工资|大概|约|是|不是|没有|未|已经|需要|怎么|如何|能不能|可以|请|[\d一二三四五六七八九十两])/.test(
      input,
    );
  if (!isSupplement) return input;
  const lastUser = [...history]
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        message.content.trim() &&
        message.content.trim() !== input,
    );
  if (!lastUser) return input;
  const previous = lastUser.content.slice(0, 1500);
  const previousTopic = topicOf(previous);
  if (currentTopic && previousTopic && currentTopic !== previousTopic)
    return input;
  // Unknown questions such as “怎么写 Python” are not follow-up evidence.
  const intent = intentText(input);
  if (
    !currentTopic &&
    intent &&
    !/(?:那|这个|这种|需要哪些|怎么办|怎么做|证据|材料|计算|流程|[\d一二三四五六七八九十两].*(?:元|小时|天|楼|室)|月薪|底薪|基本工资|每天|每月|劳动合同|外包|全日制|非全日制|派遣)/.test(
      intent,
    )
  )
    return input;
  return `${previous}\n补充情况：${input}`;
}

function result(topic: Topic, text: string, followups: string[]): Advice {
  return { topic, text, followups };
}

function addReference(advice: Advice, source: string): Advice {
  return { ...advice, text: `${advice.text}\n\n📖 **参考依据**\n${source}` };
}

function employerEvasion(input: string): boolean {
  if (/防止|阻止|举报|投诉|追讨|维权|避免被|不被/.test(input)) return false;
  const action =
    /(?:规避|逃避|隐瞒|瞒报|伪造|克扣|不付|不发|少发|不缴|不交|免除)/;
  const subject = /加班费|工伤|工资|社保|用工责任|劳动责任|法定责任|赔偿/;
  return (
    action.test(input) &&
    subject.test(input) &&
    (/(?:我是|作为|我们是).{0,8}(?:老板|雇主|主管|企业|公司|用人单位|人事|外包商)/.test(
      input,
    ) ||
      /(?:帮我|帮公司|教我|我想|如何|怎么|怎样|设计).{0,16}(?:规避|逃避|隐瞒|瞒报|伪造|克扣|不付|不发|少发|不缴|不交|免除)/.test(
        input,
      ))
  );
}

function refusal(): Advice {
  return result(
    "rights",
    `💡 **核心结论**\n我不能帮助规避法定用工责任、隐瞒工伤或克扣劳动者报酬。可以帮助您制定依法排班、如实申报和足额支付的方案。\n\n📋 **具体标准与分析**\n“包干”、口头同意或内部规定，不能当然免除法定义务。具体支付、申报与保障责任，需要结合实际劳动关系、工时制度和当地规定核实。\n\n🛠️ **实操指引与步骤**\n**第一步：** 如实整理合同、排班、考勤、工资与事故记录。\n**第二步：** 对照适用规则核算差额，纠正欠付、漏保或不安全作业安排。\n**第三步：** 与劳动者透明沟通；有争议时向工会、人社部门或劳动仲裁机构核实。\n\n⚠️ **防坑 / 维权证据提示**\n不要伪造考勤、要求倒签文件或诱导劳动者放弃法定权利。${disclaimer}\n\n❤️ **暖心提示**\n合理排班、及时支付和安全防护，能同时保护劳动者与团队的长期运营。`,
    ["如何依法安排加班？", "帮我整理合规用工检查清单"],
  );
}

function chemicalAdvice(emergency: boolean): Advice {
  return result(
    "safety",
    `💡 **核心结论**\n${emergency ? "**请先离开现场，转移到室外空气新鲜处，并提醒周围人员远离。** 含氯消毒剂与酸性洁厕剂混用可能释放有毒气体；不要为开窗或收拾工具返回。" : "**84 消毒液、含氯漂白剂不能与洁厕灵等酸性清洁剂混用，也不要与含氨产品混用。** 先看标签，按说明分别使用。"}\n\n📋 **具体标准与分析**\n含次氯酸钠的消毒剂遇酸可能释放氯气。普通口罩不能提供可靠的有毒气体防护；不要靠“闻一下”判断安全，也不要自行加入其他化学品中和。\n\n🛠️ **实操指引与步骤**\n**第一步：** ${emergency ? "停止操作并撤离；不要单独进入污染区域救人。若有人呼吸困难、胸闷明显或意识异常，立即拨打 120；危险区域需要专业处置时拨打 119。" : "检查产品成分与标签，使用原包装，分开存放；不把不同清洁剂倒进同一容器。"}\n**第二步：** ${emergency ? "在安全位置通知现场负责人，说明产品名称、是否混合、地点和人员症状，由专业人员处理通风与清理。" : "依标签要求稀释、保持通风并穿戴合适的手套与眼部防护，禁止用热水随意配制或加大浓度。"}\n**第三步：** ${emergency ? "皮肤或眼睛沾到药液时，用流动清水持续冲洗并及时就医；带上已有的产品标签照片，不要为取包装重返现场。" : "若已经混合或出现刺鼻气味、咳嗽，立即离开现场；持续或明显不适应尽快就医。"}\n\n⚠️ **防坑 / 维权证据提示**\n先救人、再留证。在安全前提下保留产品标签、作业安排和就医材料，不要为拍照逗留。\n\n❤️ **暖心提示**\n清洁工作很辛苦，遇到不明气味不要硬撑。让受过培训、配备合适防护的人员处理危险现场。`,
    ["84 消毒液应该怎么安全使用？", "帮我整理一次安全事件记录"],
  );
}

function electricalEmergency(input: string): Advice {
  const location = extractLocation(input);
  return result(
    "repair",
    `💡 **核心结论**\n**先远离冒烟、漏电、火花或带电积水区域，并提醒他人不要靠近。** 不要触摸设备、电线、积水或可能带电的人员；有人受伤或火情失控时，立即拨打 120 / 119。\n\n📋 **具体标准与分析**\n这属于可能危及人身安全的电气故障，按 **特急** 记录。只有在不接近危险且能够安全操作时，才由合适人员切断上级电源；不要用水扑救可能带电的火情。\n\n🛠️ **实操指引与步骤**\n**第一步：** 停止使用设备，撤离并在安全处设置提醒，不安排非专业人员带电排查。\n**第二步：** 从安全位置通知校内值班人员、宿管或后勤部门；有明火、持续冒烟或被困人员时联系 119。\n**第三步：** 将以下信息交给学校实际报修渠道，由有资质人员排查。\n\n**报修工单草稿 · 尚未提交**\n- 【工单类型】：电气安全故障\n- 【发生区域】：${location}\n- 【故障描述】：${summarize(input)}\n- 【紧急级别】：特急 · 涉及人身 / 电气安全\n- 【一线作业安全提示】：先隔离危险，按规程停电、验电，由有资质人员携带适配防护与检测设备处置。\n\n⚠️ **防坑 / 维权证据提示**\n不要为拍照接近现场。此卡片仅为草稿，系统没有向学校提交、派单或承诺到场时间。\n\n❤️ **暖心提示**\n人员安全比设备更重要，请等专业人员确认安全后再恢复使用。`,
    ["补充具体楼栋和房间号", "还有哪些工单信息需要补充？"],
  );
}

function heatAdvice(input: string): Advice {
  const symptoms = activeHazard(
    input,
    /中暑|头晕|恶心|呕吐|晕倒|昏迷|意识不清|意识模糊|抽搐|呼吸困难/,
  );
  return result(
    "safety",
    `💡 **核心结论**\n${symptoms ? "**立即停止作业，转移到阴凉通风或有空调的地方降温。** 出现意识不清、昏迷、抽搐或情况迅速加重时，立即拨打 120。" : "高温作业要先调整时段、安排休息和饮水，不能只靠“忍一忍”。出现头晕、恶心或乏力应立即停工并告知同伴。"}\n\n📋 **具体标准与分析**\n${symptoms ? "仅凭文字无法判断中暑轻重；严重中暑属于急症。等待救援时继续安全降温，意识不清或吞咽困难者不能强行喂水。" : "高温防护包含作业安排、降温措施、健康保障与必要劳动防护；发放津贴不能替代安全防护。具体停工、缩短作业时间要求需结合当地天气预报与适用规定。"}\n\n🛠️ **实操指引与步骤**\n**第一步：** 停止暴晒和重体力作业，由同伴陪同到凉爽处，松开紧身衣物。\n**第二步：** 用凉水湿敷、擦拭或扇风帮助降温；清醒且能正常吞咽时少量多次饮水。\n**第三步：** 明显不适、持续不缓解或出现严重症状时及时就医；不要让不适者独自回去。\n\n⚠️ **防坑 / 维权证据提示**\n如涉及职业性中暑及工伤认定，保留作业安排、气象信息、就诊和诊断材料，交由专业机构判断，不直接承诺认定结果。\n\n❤️ **暖心提示**\n您可以向主管明确说明身体不适并请求休息、替班。先照顾好身体，再处理记录与报修。`,
    ["高温津贴怎么核实？", "帮我整理户外作业防暑清单"],
  );
}

function extractLocation(input: string): string {
  const match = input.match(
    /(?:[\u4e00-\u9fffA-Za-z0-9一二三四五六七八九十东西南北]{1,12}校区[，,\s]*)?(?:[\u4e00-\u9fffA-Za-z0-9一二三四五六七八九十]{0,8}(?:宿舍|教学楼|实验楼|办公楼|食堂)|\d{1,3}\s*(?:号楼|栋|号宿舍楼|号宿舍|号教学楼))(?:[，,\s]*\d{1,3}\s*(?:号楼|栋|楼))?(?:[，,\s]*\d{2,5}\s*(?:室|房间|宿舍|号)?)?/,
  );
  return match?.[0]?.trim() || "待补充：校区、楼栋、楼层 / 房间号或具体点位";
}

function summarize(input: string): string {
  return (
    input
      .replace(/\n补充情况：/g, "；补充：")
      .replace(/\s+/g, " ")
      .replace(/[<>]/g, "")
      .slice(0, 180) + (input.length > 180 ? "…" : "")
  );
}

function repairAdvice(input: string): Advice {
  const electric = /插座|灯|电|跳闸|照明/.test(input);
  const water = /漏水|停水|水管|水龙头|堵塞|暖气|管道/.test(input);
  const sensor = /温湿度|传感器|节点|烟感|门禁/.test(input);
  const kind = sensor
    ? "物联网感知 / 门禁设备"
    : water
      ? "给排水 / 管道暖通"
      : electric
        ? "强电 / 照明"
        : "公共设施维修";
  const urgent =
    /停电|停水|跳闸|无法进|进不去|被困|大量漏水|水流不停|无法关闭|不能关闭|大面积|整栋/.test(
      input,
    );
  return result(
    "repair",
    `💡 **核心结论**\n已为您整理一份 **报修工单草稿**，可复制到学校现有报修渠道。${urgent ? "故障已影响正常使用，建议尽快联系值班人员。" : "请补齐准确点位，方便维修师傅一次找到现场。"}\n\n📋 **报修工单草稿 · 尚未提交**\n- 【工单类型】：${kind}\n- 【发生区域】：${extractLocation(input)}\n- 【故障描述】：${summarize(input)}\n- 【紧急级别】：${urgent ? "紧急 · 影响正常生活 / 使用" : "普通 · 待核实现场情况"}\n- 【一线作业安全提示】：${electric ? "停止使用故障设备，不私拆插座或配电箱；由有资质人员按停电、验电规程处置。" : water ? "避开湿滑积水；只有确认安全且熟悉操作时才关闭就近水阀，积水靠近电源时不要踏入。" : sensor ? "保留设备编号与告警时间；不要屏蔽消防告警或绕过门禁，先核实人员与现场安全。" : "设置现场提示，避免继续使用损坏设施，由专业人员检查后恢复。"}\n\n🛠️ **实操指引与步骤**\n**第一步：** 补充校区、楼栋、房间 / 设备编号，以及故障开始时间。\n**第二步：** 在安全位置记录现象，说明影响范围、是否有人员被困，以及是否冒烟、漏电或漏水靠近电源。\n**第三步：** 将草稿提交到学校官方报修入口或交给宿管 / 值班人员，并保存真实受理编号跟进。\n\n⚠️ **防坑 / 维权证据提示**\n本页面没有连接学校派单系统，不会自动提交、通知维修师傅或生成真实受理编号。无需在公开对话中提供身份证、门禁密码等信息。\n\n❤️ **暖心提示**\n描述“在哪儿、哪里坏、有什么现象”就够了，不必自己判断故障原因。请先确保安全，再等待专业维修。`,
    [
      "补充：具体楼栋和房间号",
      "故障已经影响正常使用",
      "出现冒烟或积水靠近电源",
    ],
  );
}

function parseNumber(text: string | undefined): number | undefined {
  if (!text) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (digits[text]) return digits[text];
  if (text.includes("十")) {
    const [left, right] = text.split("十");
    return (left ? digits[left] : 1) * 10 + (right ? digits[right] : 0);
  }
  return undefined;
}

function overtimeCalculation(input: string): string {
  const dailyHours = parseNumber(
    input.match(
      /(?:每天|每日|每晚|一天)(?:多干|多做|多上|多工作|工作|加班|延长|多|.{0,4})\s*([\d.]+|[一二两三四五六七八九十]+)\s*(?:个)?小时/,
    )?.[1],
  );
  const days = parseNumber(
    input.match(
      /(?:连续|连着|连|共|一共|加班)\s*([\d]+|[一二两三四五六七八九十]+)\s*(?:个)?(?:晚上|晚|天)/,
    )?.[1],
  );
  const explicitHours = parseNumber(
    input.match(/(?:合计|累计|总共|共|一共)\s*([\d.]+)\s*(?:个)?小时/)?.[1],
  );
  const hours =
    explicitHours ?? (dailyHours && days ? dailyHours * days : undefined);
  const base =
    Number(
      input.match(
        /(?:月工资基数|加班基数|基本工资|月薪|底薪|月工资)(?:是|为|约|大约|有|：|:)?\s*(\d{3,6})(?:\s*元)?/,
      )?.[1],
    ) || undefined;
  const isHoliday = /法定节假日|法定假日|国庆节当天|春节当天/.test(input);
  const isRest =
    !isHoliday && /休息日|周末|星期六|星期天|周六|周日/.test(input);
  const multiplier = isHoliday ? 3 : isRest ? 2 : 1.5;
  const label = isHoliday
    ? "法定节假日"
    : isRest
      ? "休息日且未补休"
      : "工作日延时";
  const formula =
    "加班工资 = 适用的月工资基数 ÷ 21.75 ÷ 8 × 加班小时数 × 对应倍数。";
  if (hours && hours > 0 && hours < 400 && base && base > 0) {
    const amount = ((base / 21.75 / 8) * hours * multiplier).toFixed(2);
    return `${formula}\n\n**按您提供的数字试算：** 若 ${base} 元确为适用月工资基数，${hours} 小时均属于${label}加班，则 ${base} ÷ 21.75 ÷ 8 × ${hours} × ${multiplier} ≈ **${amount} 元**。这是条件测算，仍需核实工时制、加班性质、工资基数及已付金额。`;
  }
  if (hours && hours > 0 && hours < 400) {
    return `${formula}\n\n您描述的加班时间合计约 **${hours} 小时**。以适用月工资基数 **3,000 元**为演示，若均为${label}加班：3,000 ÷ 21.75 ÷ 8 × ${hours} × ${multiplier} ≈ **${((3000 / 21.75 / 8) * hours * multiplier).toFixed(2)} 元**。3,000 元是示例，不是您的实际工资。`;
  }
  return `${formula}\n\n**演示案例：** 若适用月工资基数为 3,000 元、工作日延时加班 12 小时，则 3,000 ÷ 21.75 ÷ 8 × 12 × 1.5 ≈ **310.34 元**。示例不能替代您的实际核算。`;
}

function overtimeAdvice(input: string): Advice {
  return result(
    "rights",
    `💡 **核心结论**\n**“包干”不能当然免除加班工资义务。** 如果您与单位存在劳动关系、实行标准工时且属于单位安排的加班，通常可以依法要求核算加班工资；特殊工时需要另行核实。\n\n📋 **具体标准与分析**\n- 工作日延时加班：不低于适用工资基数的 **150%**。\n- 休息日加班且不能安排补休：不低于 **200%**。\n- 法定节假日加班：不低于 **300%**；不能简单用补休替代。\n- 一般每日延时不超过 1 小时；特殊原因在保障健康的条件下每日不超过 3 小时、每月不超过 36 小时，法定例外另论。不能只凭连续几晚就判定全部工时安排违法。\n\n${overtimeCalculation(input)}\n\n🛠️ **实操指引与步骤**\n**第一步：** 核实合同签约单位、实际用工方式、工时制度和加班日期；外包员工应同时留存外包公司的信息。\n**第二步：** 保存排班、考勤、主管加班通知、工资条和银行流水，按日期列出实际工时与已付金额。可以沟通：“请按实际考勤核实这段时间的加班类型、基数和应付差额，并提供工资明细。”\n**第三步：** 协商不成，可向校工会 / 后勤管理部门反映，并通过所在地人社部门核实劳动监察或仲裁办理渠道；12333 可咨询人社服务，不替代正式立案。\n\n⚠️ **防坑 / 维权证据提示**\n保留原始记录，不只留裁剪截图；不要在未核清金额前签署“全部结清”等不实确认。申请期限、举证与请求项目需结合具体情况核实。${disclaimer}\n\n❤️ **暖心提示**\n连续工作容易疲劳，湿滑后厨注意防滑、护手与休息。权益问题可以一步步处理，身体安全要放在前面。`,
    [
      "月薪 3000 元，每天加班 3 小时，连着 4 天",
      "外包公司的员工怎么收集证据？",
      "我是勤工助学学生，适用吗？",
    ],
  );
}

function studentAdvice(input: string): Advice {
  const injury = /工伤|受伤|摔伤|事故|烫伤/.test(input);
  return result(
    "rights",
    `💡 **核心结论**\n**学生身份不等于一概没有劳动保障，但也不能直接套用职工加班规则。** 先区分学校组织的勤工助学、实习和自行在外就业，再判断协议、管理方式和实际用工关系。${injury ? "受伤后应先就医，并及时通知学校与实际管理单位。" : ""}\n\n📋 **具体标准与分析**\n学校组织的勤工助学通常依据《高等学校学生勤工助学管理办法（2018 年修订）》及学校现行规定、岗位协议处理；不能仅凭“兼职”二字认定劳动关系。该办法对工作时间和报酬有专门安排，实际适用与校内标准需向学校学生资助管理部门核实。若事实符合劳动关系认定条件，相关劳动法保障不能被一句“你是学生”当然排除。\n\n🛠️ **实操指引与步骤**\n**第一步：** 明确是谁招聘、谁签约、谁安排工作与发工资；说明岗位是否由学校勤工助学机构统一组织。\n**第二步：** 保存岗位公告、协议、排班、工作群通知、考勤、支付流水${injury ? "、就诊与事故记录" : ""}，列清约定报酬与实际履行情况。\n**第三步：** 校内勤工助学先联系学生资助管理部门或指导老师协调；对实际用工关系有争议，再向当地人社部门或法律援助机构核实处理路径。\n\n⚠️ **防坑 / 维权证据提示**\n不要直接认定“学生不能仲裁”或“所有学生兼职都有 1.5 倍加班费”。不公开学号、身份证和银行卡完整号码。${disclaimer}\n\n❤️ **暖心提示**\n勤工助学应兼顾学习与健康，遇到超时、危险任务或报酬不清，尽早让学校指导老师一起协助。`,
    [
      "这是学校统一安排的勤工助学岗位",
      "是我自己找的校外兼职",
      "需要保存哪些工资和排班证据？",
    ],
  );
}

function injuryAdvice(): Advice {
  return result(
    "rights",
    `💡 **核心结论**\n**工作中受伤，先及时就医，再保留事故与用工证据。** 是否认定工伤由有权机关依具体事实决定，不能只凭主管说“不算”就放弃，也不能仅凭聊天直接确认。\n\n📋 **具体标准与分析**\n《工伤保险条例》规定了认定情形和申请程序。一般情况下，单位应在事故伤害发生或被诊断、鉴定为职业病之日起 30 日内申请；单位未按规定申请的，职工、近亲属或工会一般可在 1 年内申请。特殊情况、起算时间和具体材料应向当地办理机构核实。未缴工伤保险不当然免除单位的相关责任。\n\n🛠️ **实操指引与步骤**\n**第一步：** 就医并如实说明受伤时间、地点和经过，保留病历、诊断、检查与收费凭证。\n**第二步：** 及时书面告知单位，保存劳动合同、工资记录、排班、现场记录和同事联系方式；请单位说明是否已经申请。\n**第三步：** 向参保地或有管辖权的人社部门核实认定申请程序；外包、派遣或劳动关系不清的，先核实责任单位与举证要求。\n\n⚠️ **防坑 / 维权证据提示**\n不要为补证重新进入危险现场，也不要签署与事实不符的“非工作原因”说明。工伤认定、劳动能力鉴定与待遇核算是不同环节。${disclaimer}\n\n❤️ **暖心提示**\n先把伤治好，保留好每一次就医材料；需要时请家人、工会或可靠同事协助办理。`,
    [
      "单位不愿意申请工伤怎么办？",
      "我是外包员工，怎么确认用工单位？",
      "帮我整理工伤材料清单",
    ],
  );
}

function allowanceAdvice(input: string): Advice {
  const cold = /低温|防寒|寒冷/.test(input);
  return result(
    "rights",
    `💡 **核心结论**\n${cold ? "**低温补贴不能直接套用全国统一金额。** 先核实当地规定、劳动合同、集体合同和单位制度，并落实必要防寒措施。" : "**高温津贴要结合工作地点、作业条件与当地现行标准核实。** 不能把学校名称或“天气很热”直接当成固定金额的依据；降温饮料、防暑用品不能当然替代应付津贴。"}\n\n📋 **具体标准与分析**\n${cold ? "是否存在专项低温补贴、适用岗位和计发办法，需要有具体依据；没有核实前不提供固定金额。" : "高温作业的劳动保护与津贴是两件需要同时落实的事。天津相关计发口径为上年度全市职工日平均工资的 12% 按符合条件的实际天数计发；具体基数、适用条件与当年文件仍须向天津人社部门核实，不能直接使用未经核验的金额。"}\n\n${cold ? "如单位制度有明确标准，测算公式可写为：应付金额 = 适用日标准 × 符合条件的天数 − 已付金额。" : "**条件测算公式（天津）：** 先用已核实的上年度全市职工日平均工资 × 12%，并四舍五入到角，得到日津贴标准；应付高温津贴 = 日津贴标准 × 符合条件的实际工作天数 − 已支付金额。\n\n**演示案例：** 仅假设日平均工资基数为 400 元、符合条件天数为 10 天且未支付，则 400 × 12% × 10 = 480 元。400 元不是天津现行公布数值，此例仅展示算法。"}\n\n🛠️ **实操指引与步骤**\n**第一步：** 说明实际工作城市、月份、室内 / 室外岗位与作业条件。\n**第二步：** 保存排班、出勤、工资明细、气象与现场条件记录，向单位索取所采用的文件和计发基数。\n**第三步：** 通过所在地人社部门或 12333 咨询现行口径；确认后再核算差额并协商处理。\n\n⚠️ **防坑 / 维权证据提示**\n本地演示答复不具备实时政策检索能力，不能据此认定当年标准已经核验。${disclaimer}\n\n❤️ **暖心提示**\n补贴不能替代安全休息、饮水与防护。身体不适时应及时停止作业并寻求帮助。`,
    ["我在天津做室外绿化工作", "工资条里没有高温津贴", "户外作业头晕怎么办？"],
  );
}

function wageAdvice(): Advice {
  return result(
    "rights",
    `💡 **核心结论**\n**已经提供劳动却被拖欠或无依据扣减报酬，可以要求单位说明并核实补发。** 先确认劳动关系、约定发薪日和扣款原因，再决定投诉或争议处理路径。\n\n📋 **具体标准与分析**\n应区分正常结算周期、依法代扣项目与拖欠 / 克扣。不能仅凭一句“学校没给外包公司结账”就当然免除用人单位依法支付工资的义务。\n\n**核对公式：** 待核差额 = 已确认的应付工资及其他应付项目 − 依法扣除项目 − 实际已付金额。\n**演示案例：** 经核对应付工资 3,500 元、依法扣除 300 元、实付 2,200 元，待核差额为 1,000 元。\n\n🛠️ **实操指引与步骤**\n**第一步：** 整理合同、入职与实际工作记录，按月份列出应付、已付、扣款和约定发薪日。\n**第二步：** 保存工资条、银行流水、考勤和沟通记录，书面询问：“请说明本期工资和扣款的计算依据，并确认差额支付时间。”\n**第三步：** 可请校工会 / 后勤管理部门协助协调；未解决时向所在地人社部门核实劳动监察受理或劳动仲裁申请渠道。\n\n⚠️ **防坑 / 维权证据提示**\n不要签署不实收条或把原始证据交给对方后不留副本。正式申请有期限与材料要求，应及时咨询，不能无限期等待口头承诺。${disclaimer}\n\n❤️ **暖心提示**\n把账按月列清，就更容易说明问题。您可以请工会或信任的人一起核对。`,
    [
      "帮我列一份工资证据清单",
      "外包公司拖欠工资怎么办？",
      "我没有书面劳动合同",
    ],
  );
}

function rightsOverview(): Advice {
  return addReference(
    result(
      "rights",
      `💡 **核心结论**\n了解劳动权益，可以先从 **谁在用工、工时怎样安排、工资怎样支付、劳动保护是否到位** 这四件事开始。先确认实际用工关系，再看哪项规则适用。\n\n📋 **具体标准与分析**\n重点核对工资与加班、合同与社会保险、休息休假、职业安全及工伤保障。全日制、非全日制、派遣、外包与学校组织的勤工助学存在差别；不能仅凭岗位名称判断权利。涉及金额时，应先确定基数、工时类型、适用标准和已付金额。\n\n🛠️ **实操指引与步骤**\n**第一步：** 说明岗位、由谁招聘与发工资、是否签了协议，以及最想解决的问题。\n**第二步：** 保存合同或岗位约定、考勤排班、工资条、银行流水和原始沟通记录，按日期整理。\n**第三步：** 先向单位要求解释具体安排和计算依据；有争议时可请校工会 / 后勤管理部门协调，再向当地人社部门核实办理路径。\n\n⚠️ **防坑 / 维权证据提示**\n不要签空白合同或不实的结清确认；无需在聊天中公开身份证、银行卡和家庭住址。${disclaimer}\n\n❤️ **暖心提示**\n不用一次弄懂所有规定。先告诉我一件具体的事，我会陪您逐项整理。`,
      [
        "加班费怎么算？",
        "拖欠工资需要保留哪些证据？",
        "劳动合同里哪些条款要注意？",
      ],
    ),
    sources.overtime,
  );
}

function contractAdvice(input: string): Advice {
  const dismissal = /解除|辞退|解雇|离职|赔偿|补偿/.test(input);
  return result(
    "rights",
    `💡 **核心结论**\n${dismissal ? "**解除合同后的补偿或赔偿，不能只凭“被辞退”就一律按 2N 计算。** 需要核实解除原因、程序、工作年限、工资基数及实际劳动关系。" : "**先看清谁是用人单位、做什么工作、何时发多少钱，再签字。** 不能用“外包”“包干”等名称当然排除依法应有的劳动保障。"}\n\n📋 **具体标准与分析**\n${dismissal ? "协商解除、依法解除、违法解除和个人主动辞职的后果不同。是否有经济补偿、赔偿金或其他请求，以及适用基数与年限，需结合事实逐项核对；本地演示不据此直接作出结论。" : "重点核对单位名称、工作内容与地点、合同期限、工时休假、报酬支付、社会保险和劳动保护等内容。派遣、外包、非全日制和勤工助学不能混为一谈；合同名称不当然等于实际法律关系。"}\n\n🛠️ **实操指引与步骤**\n**第一步：** ${dismissal ? "保存解除通知，明确是谁提出、什么原因、哪天生效，不急于签署与事实不符的“个人原因辞职”。" : "核对单位主体和签约人，索取完整合同副本，不签空白页或金额待填的文件。"}\n**第二步：** 保存合同、岗位通知、工资流水、考勤与沟通记录；把有疑问的条款遮去隐私后逐条核实。\n**第三步：** 向工会、人社部门或法律援助机构咨询具体请求和期限；有争议时准备完整时间线。\n\n⚠️ **防坑 / 维权证据提示**\n不要公开完整身份证号、住址或银行卡信息；也不要擅自修改原始证据。${disclaimer}\n\n❤️ **暖心提示**\n看不懂的条款可以要求解释清楚。重要文件留一份，给自己多一点核实的时间。`,
    [
      "签劳动合同最该注意什么？",
      "我是外包公司的保洁员工",
      "被辞退后需要保存哪些证据？",
    ],
  );
}

function generalSafety(input: string): Advice {
  const high = /高处|梯子|登高/.test(input);
  const weather = /暴雨|雷雨|台风|暴雪|低温/.test(input);
  return result(
    "safety",
    `💡 **核心结论**\n${high ? "**登高作业先确认人员资格、设备状态和现场防护，不能独自冒险攀爬。** 如果需要拆装电气设备，还要由相应专业人员按停电规程处理。" : weather ? "**极端天气下先停止有明显危险的户外作业，进入安全建筑避险。** 不要涉入不明积水，也不要靠近倒伏电线或树木。" : "**不确定是否安全时，先停下来确认。** 重物搬运、带电检查和化学清洁都有不同风险，不能仅凭“经验”省去防护。"}\n\n📋 **具体标准与分析**\n${high ? "检查梯具、防滑与支撑，隔离下方区域；需要专门资质和防坠措施的作业，应由受训且具备条件的人员实施，不能用桌椅临时搭高。" : weather ? "具体作业安排应结合当地预警、现场积水、风力和结冰情况；出勤要求不能替代风险评估与防护措施。" : "搬运前估计重量、路线与抓握条件，优先使用推车或多人协作；靠近身体平稳搬运，不扭腰猛提。涉及电气拆检时交由有资质人员处理。"}\n\n🛠️ **实操指引与步骤**\n**第一步：** 描述任务、现场和设备，检查是否有电、湿滑、坠落或化学暴露风险。\n**第二步：** 选择合适防护与工具，清理通道，请经过培训的人员共同确认。\n**第三步：** 发现险情立即停止并报告；出现伤情及时就医，严重情况拨打 120，有火灾或救援需要拨打 119。\n\n⚠️ **防坑 / 维权证据提示**\n不为赶工跳过防护，不在危险区域拍摄取证。保留作业安排、培训与事故记录。\n\n❤️ **暖心提示**\n需要帮手或专业工具时，可以明确提出。安全完成比勉强完成更重要。`,
    ["清洁剂有哪些不能混用？", "搬重物怎么保护腰部？", "高温作业头晕怎么办？"],
  );
}

function generalAdvice(input: string): Advice {
  if (/^(?:你好|您好|嗨|hi|hello|在吗|开始|谢谢)[！!。\s]*$/i.test(input)) {
    return result(
      "general",
      "💡 **核心结论**\n您好，我可以帮您整理劳动权益问题、生成报修工单草稿，或查阅常见作业安全提示。\n\n🛠️ **实操指引与步骤**\n**第一步：** 用平常的话描述遇到的事，例如“加班没给钱”或“宿舍水管漏了”。\n**第二步：** 补充岗位、地点、发生时间和已知情况，不需要提供身份证或完整联系方式。\n**第三步：** 我会帮您理清下一步；工单草稿需要您通过学校实际渠道提交。\n\n❤️ **暖心提示**\n这里的本地演示答复来自预设规则，不代表已联网核验政策。遇到火情、触电或身体明显不适，请先确保人身安全。",
      [
        "连续加班却不给加班费怎么办？",
        "宿舍水管漏水，帮我写工单",
        "84 消毒液能和洁厕灵混用吗？",
      ],
    );
  }
  return result(
    "general",
    "💡 **核心结论**\n目前的信息还不足以可靠判断。这套本地演示主要覆盖劳动权益、校园报修和作业安全，我不会把未识别的问题直接归为某种纠纷或故障。\n\n🛠️ **实操指引与步骤**\n**第一步：** 说明您需要“咨询权益”“整理报修”还是“了解安全防护”。\n**第二步：** 补充发生了什么、在哪里、涉及什么岗位 / 设备，以及是否有人身危险。\n**第三步：** 我会按已有信息整理步骤；需要实时政策或复杂判断时，应进一步核验官方来源。\n\n⚠️ **防坑 / 维权证据提示**\n请勿输入身份证、密码、银行卡或他人的敏感信息。\n\n❤️ **暖心提示**\n不用一次说得很完整，先告诉我最困扰您的那件事就好。",
    ["我要咨询工资或加班问题", "我要整理一份报修工单", "我要了解清洁作业安全"],
  );
}

export function getLocalReply(
  input: string,
  history: ConversationMessage[] = [],
  identity?: "worker" | "student" | "other",
): Advice {
  const fresh = input.trim().slice(0, 5000);
  if (!fresh) return generalAdvice("你好");
  if (employerEvasion(fresh)) return refusal();

  const chemical = /(?:^|\D)84(?:\D|$)|八四|次氯酸|洁厕|漂白|含氯|消毒液/.test(
    fresh,
  );
  const mixed = /混用|混合|混了|一起|倒入|倒进|兑|混到/.test(fresh);
  const chemicalSymptoms =
    chemical && activeHazard(fresh, /刺鼻|咳嗽|呼吸困难|胸闷/);
  const chemicalCurrent =
    chemicalSymptoms ||
    (chemical &&
      mixed &&
      /已经|刚才|刚刚|刚把|误把|倒在一起|混了|混合后/.test(fresh) &&
      !/没有.{0,18}(?:混|倒在一起)/.test(fresh));
  if (chemicalCurrent)
    return addReference(chemicalAdvice(true), sources.chemical);
  const dangerousElectric = activeHazard(
    fresh,
    /冒烟|火花|触电|漏电|起火|着火|电线裸露|电线掉落/,
  );
  const safetyQuestion =
    /^(?:怎么|如何|怎样)(?:避免|防止|预防)|(?:会不会|是否会|怎样防|如何防|怎么防)/.test(
      fresh,
    );
  const historicalInjury =
    /昨天|前天|上周|上个月|去年|此前|已经出院|治疗后/.test(fresh) &&
    /工伤|认定|赔偿|报销|医疗费/.test(fresh) &&
    !/现在|正在|仍在|还在|目前/.test(fresh);
  const waterElectric =
    /积水|漏水/.test(fresh) &&
    /靠近|流到|淹到|接触|泡在|泡着|浸泡/.test(fresh) &&
    /插座|电源|配电|电线|电箱/.test(fresh);
  if (
    (dangerousElectric &&
      !safetyQuestion &&
      !historicalInjury &&
      /电|插座|设备|冒烟|火花|着火|起火/.test(fresh)) ||
    waterElectric
  )
    return addReference(electricalEmergency(fresh), sources.electrical);
  if (
    /(?:高温|户外|中暑|很热|暴晒)/.test(fresh) &&
    activeHazard(fresh, /头晕|恶心|呕吐|晕倒|昏迷|意识不清|意识模糊|抽搐|中暑/)
  )
    return heatAdvice(fresh);
  if (chemical && (mixed || terms.safety.test(fresh)))
    return addReference(chemicalAdvice(false), sources.chemical);

  const context = resolveContext(fresh, history);
  const topic = topicOf(fresh) ?? topicOf(context);
  if (topic === "repair") return repairAdvice(context);
  if (topic === "rights") {
    // Profile metadata informs rights guidance, never task routing. An explicitly
    // selected profile supersedes history; facts in this message remain primary.
    const studentContext =
      /学生|勤工助学|实习生/.test(fresh) ||
      identity === "student" ||
      (identity === undefined && /学生|勤工助学|实习生/.test(context));
    if (studentContext)
      return addReference(studentAdvice(context), sources.student);
    if (
      /工伤|在.{0,10}工作.{0,10}受伤|上班.{0,10}(?:摔伤|受伤)|职业病/.test(
        context,
      )
    )
      return addReference(injuryAdvice(), sources.injury);
    if (
      /高温.{0,4}(?:津贴|补贴)|(?:津贴|补贴).{0,4}高温|低温|防寒/.test(context)
    )
      return addReference(allowanceAdvice(context), sources.allowance);
    if (/加班|工时|调休/.test(context))
      return addReference(overtimeAdvice(context), sources.overtime);
    if (
      /拖欠|欠薪|扣钱|扣薪|克扣|工资|薪资/.test(context) &&
      !/合同|辞退|解雇|离职/.test(context)
    )
      return wageAdvice();
    if (
      /劳动权益/.test(context) &&
      !/合同|辞退|解雇|离职|赔偿|补偿|社保/.test(context)
    )
      return rightsOverview();
    return contractAdvice(context);
  }
  if (topic === "safety") {
    if (/高温|防暑|中暑/.test(context)) return heatAdvice(context);
    return generalSafety(context);
  }
  return generalAdvice(fresh);
}
