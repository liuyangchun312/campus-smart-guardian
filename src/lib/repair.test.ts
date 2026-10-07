import { describe, expect, it } from "vitest";
import { classifyRepair } from "./repair";

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
