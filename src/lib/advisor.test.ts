import { describe, expect, it } from "vitest";
import { getLocalReply } from "./advisor";

describe("本地校园管家咨询规则", () => {
  it("对食堂包干加班采用条件结论并计算实际小时数", () => {
    const reply = getLocalReply(
      "我在学校食堂洗碗，主管要求连着4个晚上，每天多干3小时，但包干不给加班费，怎么办？",
    );
    expect(reply.topic).toBe("rights");
    expect(reply.text).toContain("标准工时");
    expect(reply.text).toContain("12 小时");
    expect(reply.text).toContain("310.34");
    expect(reply.text).toContain("3,000 元是示例");
    expect(reply.text).toContain("第一步");
    expect(reply.text).toContain("重大争议");
  });

  it("把用户工资基数与休息日条件带入测算", () => {
    const reply = getLocalReply(
      "标准工时，月薪4000元，休息日加班共8小时，没有补休",
    );
    expect(reply.text).toContain("367.82");
    expect(reply.text).toContain("休息日且未补休");
    expect(reply.text).toContain("基数");
  });

  it("工资数字中包含 84 不误判为消毒剂咨询", () => {
    const reply = getLocalReply(
      "月薪2840元，连着4天每天加班3小时，加班费怎么算",
    );
    expect(reply.topic).toBe("rights");
    expect(reply.text).toContain("293.79");
  });

  it("新报修问题不会继承上轮劳动争议", () => {
    const reply = getLocalReply("3号楼302宿舍水管漏水，帮我报修", [
      { role: "user", content: "我是勤工助学学生，加班没给钱" },
    ]);
    expect(reply.topic).toBe("repair");
    expect(reply.text).toContain("尚未提交");
    expect(reply.text).not.toContain("劳动关系认定");
    expect(reply.text).toContain("3号楼302");
  });

  it("同一主题的简短补充保留学生身份", () => {
    const reply = getLocalReply("那我可以要求加班费吗？", [
      { role: "user", content: "我是学校勤工助学岗位的学生，每天安排很多工作" },
    ]);
    expect(reply.text).toContain("学生身份不等于一概没有劳动保障");
    expect(reply.text).not.toContain("310.34");
  });

  it("身份前缀不会覆盖本轮明确的报修请求", () => {
    const reply = getLocalReply("我是勤工助学学生。宿舍水管漏水，帮我报修", [
      { role: "user", content: "加班费怎么算？" },
    ]);
    expect(reply.topic).toBe("repair");
    expect(reply.text).toContain("报修工单草稿");
    expect(reply.text).not.toContain("学生身份不等于");
  });

  it("身份前缀不会把安全或陌生问题归为劳动权益", () => {
    const history = [{ role: "user" as const, content: "加班费怎么算？" }];
    expect(
      getLocalReply("我是勤工助学学生。搬重物怎么保护腰部？", history).topic,
    ).toBe("safety");
    expect(
      getLocalReply("我是劳务派遣人员。高处作业需要哪些防护？", history).topic,
    ).toBe("safety");
    expect(
      getLocalReply("我是勤工助学学生。怎么写 Python 排序函数？", history)
        .topic,
    ).toBe("general");
  });

  it("真正的权益问题仍保留学生身份并按勤工助学分析", () => {
    const reply = getLocalReply("我是勤工助学学生，怎么计算加班费？");
    expect(reply.topic).toBe("rights");
    expect(reply.text).toContain("学生身份不等于一概没有劳动保障");
    expect(reply.text).toContain("学校组织的勤工助学");
    expect(reply.text).not.toContain("310.34");
  });

  it("宽泛权益咨询提供分类入口而非假定合同问题", () => {
    const reply = getLocalReply("我想了解劳动权益，应该从哪里开始？");
    expect(reply.topic).toBe("rights");
    expect(reply.text).toContain("四件事开始");
    expect(reply.followups).toContain("加班费怎么算？");
  });

  it("学生身份元数据只影响权益分析，不影响安全与报修分流", () => {
    expect(getLocalReply("搬重物怎么保护腰部？", [], "student").topic).toBe(
      "safety",
    );
    expect(getLocalReply("宿舍水管漏水，帮我报修", [], "student").topic).toBe(
      "repair",
    );
    expect(getLocalReply("加班费怎么算？", [], "student").text).toContain(
      "学生身份不等于",
    );
  });

  it("从学生切换为职工时不再继承同主题历史学生身份", () => {
    const history = [
      { role: "user" as const, content: "我是勤工助学学生，加班费怎么算？" },
    ];
    const workerReply = getLocalReply(
      "那工作日加班怎么算？",
      history,
      "worker",
    );
    expect(workerReply.topic).toBe("rights");
    expect(workerReply.text).toContain("150%");
    expect(workerReply.text).not.toContain("学生身份不等于");
    expect(getLocalReply("那工作日加班怎么算？", history).text).toContain(
      "学生身份不等于",
    );
  });

  it("本轮明确的学生事实优先于职工默认身份", () => {
    const reply = getLocalReply(
      "我是勤工助学学生，怎么计算加班费？",
      [],
      "worker",
    );
    expect(reply.text).toContain("学生身份不等于");
  });

  it("陌生问题不因上轮工资咨询被强行归类", () => {
    const reply = getLocalReply("怎么写 Python 排序函数？", [
      { role: "user", content: "加班费怎么算" },
    ]);
    expect(reply.topic).toBe("general");
    expect(reply.text).toContain("信息还不足以可靠判断");
  });

  it("已经混合清洁剂并不适时先撤离", () => {
    const reply = getLocalReply(
      "刚才把84和洁厕灵倒在一起，现在很刺鼻，帮我报修",
    );
    expect(reply.topic).toBe("safety");
    expect(reply.text).toContain("先离开现场");
    expect(reply.text).toContain("不要为开窗");
    expect(reply.text).toContain("120");
    expect(reply.text).not.toContain("工单草稿");
  });

  it("预防性化学问题不冒充正在发生的事故", () => {
    const reply = getLocalReply("84消毒液能和洁厕灵混用吗？");
    expect(reply.text).toContain("不能与洁厕灵");
    expect(reply.text).not.toContain("请先离开现场");
  });

  it("电气危险优先于普通报修并禁止用水", () => {
    const reply = getLocalReply("宿舍插座冒烟还有火花，请生成工单");
    expect(reply.topic).toBe("repair");
    expect(reply.text).toContain("先远离");
    expect(reply.text).toContain("特急");
    expect(reply.text).toContain("不要用水");
    expect(reply.text.indexOf("先远离")).toBeLessThan(
      reply.text.indexOf("工单草稿"),
    );
  });

  it("无冒烟无漏电不能触发电气险情", () => {
    const reply = getLocalReply("宿舍灯不亮，没有冒烟，也没有漏电，帮我报修");
    expect(reply.topic).toBe("repair");
    expect(reply.text).toContain("普通");
    expect(reply.text).not.toContain("【紧急级别】：特急");
  });

  it("没有某种险情不掩盖同句其他确实发生的危险", () => {
    const reply = getLocalReply("插座没有冒烟，但是一直有火花");
    expect(reply.text).toContain("【紧急级别】：特急");
  });

  it("否定同时覆盖列举的多种险情", () => {
    const reply = getLocalReply("宿舍灯不亮，没有冒烟、漏电和火花");
    expect(reply.text).not.toContain("【紧急级别】：特急");
    expect(reply.text).toContain("【紧急级别】：普通");
  });

  it("既往触电事故的认定问题按工伤路径处理", () => {
    const reply = getLocalReply("昨天维修时触电，已经就医，怎么申请工伤认定？");
    expect(reply.topic).toBe("rights");
    expect(reply.text).toContain("30 日");
    expect(reply.text).not.toContain("工单草稿");
  });

  it("拒绝雇主隐瞒工伤，不误拒劳动者投诉", () => {
    expect(getLocalReply("我是老板，怎么隐瞒工伤逃避赔偿").text).toContain(
      "我不能帮助",
    );
    expect(getLocalReply("老板隐瞒工伤，我怎么投诉维权").text).not.toContain(
      "我不能帮助",
    );
    expect(getLocalReply("老板不付加班费怎么办").text).toContain("150%");
  });

  it("户外不适先停工降温而非讨论高温津贴", () => {
    const reply = getLocalReply("户外高温干活头晕想吐，还没发高温津贴");
    expect(reply.topic).toBe("safety");
    expect(reply.text).toContain("立即停止作业");
    expect(reply.text).toContain("不能强行喂水");
  });

  it("不补写工单地点，不宣称已派单", () => {
    const reply = getLocalReply("水龙头坏了帮我报修");
    expect(reply.text).toContain("待补充：校区");
    expect(reply.text).toContain("不会自动提交");
    expect(reply.text).not.toContain("工单已提交");
  });

  it("未知文本和空输入有可继续对话的结果", () => {
    expect(getLocalReply("量子纠缠的数学推导").topic).toBe("general");
    expect(getLocalReply("").followups.length).toBeGreaterThan(0);
    expect(getLocalReply("请给我今年天津准确的高温津贴金额").text).toContain(
      "需要",
    );
  });
});
