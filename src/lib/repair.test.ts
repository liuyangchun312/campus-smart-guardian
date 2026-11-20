import { describe, expect, it } from "vitest";
import { classifyRepair, extractRepairLocation, validateRepairDraft } from "./repair";

describe("工单安全分类", () => {
  it("does not classify equipment names or negated risks as active emergencies", () => {
    expect(classifyRepair("插座不通电，没有漏电或火花").priority).toBe("普通");
    expect(classifyRepair("燃气表显示屏数字不显示，没有异味").priority).toBe(
      "普通",
    );
  });
  it("treats live electrical, gas and entrapment risks as emergencies", () => {
    for (const input of [
      "配电箱正在冒烟",
      "食堂燃气泄漏",
      "有人被困在电梯里",
      "漏水流到插座旁边",
    ])
      expect(classifyRepair(input).priority).toBe("特急");
  });
  it("keeps later positive hazards despite earlier negation", () => {
    expect(classifyRepair("没有冒烟，但是插座有火花").priority).toBe("特急");
  });
  it("marks water leaks urgent and supplies slip protection", () => {
    const order = classifyRepair("北区3号楼201室水管漏水");
    expect(order.priority).toBe("紧急");
    expect(order.category).toBe("水电与暖通");
    expect(order.safety).toContain("防滑");
  });
  it("keeps a fixture defect ordinary when the pipe leak is ruled out", () => {
    expect(classifyRepair("洗手池松动，未发现水管漏水。").priority).toBe("普通");
  });
  it.each([
    "教学楼洗手池水管漏水，积水没有流到插座旁。",
    "水管漏水，积水尚未靠近配电箱。",
    "水管漏水，未发现积水流到插座旁。",
    "水管漏水，电源线没有泡在积水里。",
    "水管漏水，积水没有靠近插座，插座也未冒烟。",
    "水管漏水，积水尚未靠近插座，也未发现插座有火花。",
    "水管漏水，积水流到了地漏，另一个房间的插座需要更换。",
    "水管漏水，维修人员靠近插座检查。",
    "水管漏水，地上有积水，千万不要靠近插座。",
    "水管漏水，请不要让积水靠近插座。",
    "水管漏水，积水没有流到墙边的插座。",
  ])("keeps a leak urgent when electrical exposure is denied or unrelated: %s", (input) => {
    const order = classifyRepair(input);
    expect(order.priority).toBe("紧急");
    expect(order.safety).toContain("防滑");
  });
  it.each([
    "教学楼洗手池水管漏水，积水已经流到插座旁。",
    "教学楼水管漏水，已经流到墙边的插座。",
    "水管漏水，积水 已经顺着墙面流到了 旁边的两个插座。",
    "电源线正泡在地上的积水里。",
    "水管漏水，电源线泡在地面积水里。",
    "洗手池下面漏水，插座旁边已经有积水。",
    "地上积水正在靠近排插。",
    "水管漏水，积水已经靠近墙角插座。",
    "水管漏水已流到墙上的开关。",
    "插座被积水浸泡。",
    "积水没有流到插座旁，但是另一个插座正在冒烟。",
    "水管漏水，积水还没流到插座但已经流到了配电箱旁。",
  ])("escalates an affirmed electrical hazard wherever it occurs: %s", (input) => {
    const order = classifyRepair(input);
    expect(order.priority).toBe("特急");
    expect(order.safety).toContain("断电");
  });
});

describe("报修地点提取", () => {
  it("keeps the room and accepts punctuation between location parts", () => {
    expect(extractRepairLocation("北区 3 号宿舍楼 201 室，水管一直漏水")).toBe("北区 3 号宿舍楼 201 室");
    expect(extractRepairLocation("北校区，3号宿舍楼，201室水管漏水")).toBe("北校区，3号宿舍楼，201室");
    expect(extractRepairLocation("大学城校区3号楼201室水管漏水")).toBe("大学城校区3号楼201室");
  });
  it("keeps named spaces after a floor instead of stopping at the building", () => {
    expect(extractRepairLocation("教学楼二楼卫生间水龙头漏水")).toBe("教学楼二楼卫生间");
    expect(extractRepairLocation("我在南区食堂一楼大厅发现灯不亮")).toBe("南区食堂一楼大厅");
  });
  it("does not invent a location from an ordinary fault description", () => {
    expect(extractRepairLocation("水管漏水，地上已经有积水")).toBe("");
  });
});

describe("报修输入校验", () => {
  it("rejects short descriptions padded with spaces with a field error", () => {
    expect(validateRepairDraft({ description: "漏水      ", location: "北区201室" }).description).toContain("至少 8");
  });
  it("rejects short locations padded with spaces with a field error", () => {
    expect(validateRepairDraft({ description: "洗手池水管持续漏水", location: "201 " }).location).toContain("至少 4");
  });
  it("accepts valid fields and rejects values beyond the form limits", () => {
    expect(validateRepairDraft({ description: "洗手池水管持续漏水", location: "北区201室" })).toEqual({});
    expect(validateRepairDraft({ description: "水".repeat(1501), location: "楼".repeat(121) })).toEqual({
      description: expect.stringContaining("1500"), location: expect.stringContaining("120"),
    });
  });
});
