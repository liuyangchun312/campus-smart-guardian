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
