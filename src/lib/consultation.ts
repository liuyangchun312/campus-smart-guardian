import type { Message } from "../types";

export function retryQuestion(messages: Message[], errorId: string) {
  const error = messages.at(-1);
  const question = messages.at(-2);
  if (error?.id !== errorId || error.role !== "assistant" || error.mode !== "error" || question?.role !== "user") return null;
  return { question, history: messages.slice(0, -2) };
}

export function consultationError(message: Message, admin: boolean) {
  if (admin) return message.content;
  if (message.errorCode === 401) return "登录已过期，请重新登录后继续咨询。您的问题已保留。";
  if (message.errorCode === 429) return "咨询次数已达上限或请求较多，请稍后再试。每日额度于次日恢复；紧急问题请联系现场人员。";
  return "智能咨询服务暂时繁忙，您的问题已保留，请稍后点击重新发送。也可以联系管理员寻求帮助。";
}
