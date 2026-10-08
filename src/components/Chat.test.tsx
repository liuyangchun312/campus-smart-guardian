import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Chat from "./Chat";

describe("managed AI consultation", () => {
  const render = (admin: boolean, mode: "local" | "ai" = "ai") => renderToStaticMarkup(<Chat messages={[
    { id: "q", role: "user", content: "我的问题" },
    { id: "e", role: "assistant", content: "令牌错误，请检查API连接", mode: "error" },
  ]} loading={false} mode={mode} model="model" admin={admin} onAiSettings={() => {}} onRetry={() => {}} onHelp={() => {}} ask={() => {}} reset={() => {}} onRepair={() => {}} />);
  it("offers retry and help without exposing model configuration to ordinary users", () => {
    const html = render(false);
    expect(html).toContain("重新发送");
    expect(html).toContain("联系管理员");
    expect(html).not.toContain("AI 连接设置");
    expect(html).not.toContain("令牌错误");
  });
  it("keeps configuration and diagnostic details available to administrators", () => {
    expect(render(true)).toContain("AI 连接设置");
    expect(render(true)).toContain("令牌错误");
  });
  it("clearly labels local reference mode without asking ordinary users to connect AI", () => {
    expect(render(false, "local")).toContain("本地参考");
    expect(render(false, "local")).not.toContain("连接 AI");
  });
});
