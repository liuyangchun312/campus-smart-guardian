import { describe, expect, it } from "vitest";
import { retryQuestion } from "./consultation";
import type { Message } from "../types";

describe("consultation retry", () => {
  const messages: Message[] = [
    { id: "first", role: "user", content: "前一个问题" },
    { id: "answer", role: "assistant", content: "前一个答复", mode: "ai" },
    { id: "question", role: "user", content: "原始问题", identity: "student" },
    { id: "failed", role: "assistant", content: "服务错误", mode: "error" },
  ];
  it("keeps the original question and identity, with only the preceding context", () => {
    const retry = retryQuestion(messages, "failed");
    expect(retry?.question.id).toBe("question");
    expect(retry?.question.identity).toBe("student");
    expect(retry?.history.map(message => message.id)).toEqual(["first", "answer"]);
  });
  it("rejects old or missing retries so later conversation is never discarded", () => {
    expect(retryQuestion([...messages, { id: "new", role: "user", content: "新问题" }], "failed")).toBeNull();
    expect(retryQuestion(messages, "answer")).toBeNull();
    expect(retryQuestion(messages, "missing")).toBeNull();
  });
});
