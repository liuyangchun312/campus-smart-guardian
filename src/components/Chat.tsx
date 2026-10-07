import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  MessageCircle,
  Plus,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Sprout,
  Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Message } from "../types";
import { RetrievedSources } from "./Knowledge";

export default function Chat({
  messages,
  loading,
  mode,
  model,
  onAiSettings,
  ask,
  reset,
  onRepair,
}: {
  messages: Message[];
  loading: boolean;
  mode: "local" | "ai";
  model: string;
  onAiSettings: () => void;
  ask: (value: string, identity?: Message["identity"]) => void;
  reset: () => void;
  onRepair: () => void;
}) {
  const [input, setInput] = useState("");
  const [identity, setIdentity] = useState(() => {
    const lastIdentity = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.identity;
    return lastIdentity === "student"
      ? "勤工助学学生"
      : lastIdentity === "other"
        ? "其他"
        : "后勤劳动者";
  });
  const [copied, setCopied] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);
  const askWithIdentity = (value: string) =>
    ask(
      value.trim(),
      identity === "勤工助学学生"
        ? "student"
        : identity === "后勤劳动者"
          ? "worker"
          : "other",
    );
  const send = () => {
    if (input.trim() && !loading) {
      askWithIdentity(input);
      setInput("");
      textareaRef.current?.focus();
    }
  };
  const copy = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("error");
    }
  };
  return (
    <div className="chat-page page-enter">
      <div className="page-heading">
        <div>
          <span className="eyebrow">有疑问，慢慢说</span>
          <h1>
            和小护聊一聊 <Sparkles size={24} />
          </h1>
          <p>先把事情说明白，再陪您一步步找到解决办法。</p>
        </div>
        <button
          className="button outline small"
          onClick={reset}
          disabled={loading || messages.length === 0}
        >
          <Plus size={16} />
          新对话
        </button>
      </div>
      <div className="chat-shell">
        <div className="chat-toolbar">
          <div>
            <span className="assistant-avatar small">
              <Sprout size={20} />
            </span>
            <div>
              <strong>小护 · 校园劳动好帮手</strong>
              <span>
                <i className="green-dot" />
                {mode === "ai"
                  ? `AI · ${model || "已配置模型"}`
                  : "尚未连接 AI · 本地参考问答"}
              </span>
            </div>
          </div>
          <span className="privacy-label">
            <ShieldCheck size={14} />
            请勿输入身份证、银行卡等敏感信息
          </span>
        </div>
        {mode === "local" && (
          <div className="ai-chat-banner">
            <PlugZap size={20} />
            <div>
              <strong>连接模型，即可自由提问</strong>
              <p>
                当前提供本地参考指引与资料检索。由管理员配置 AI 服务
                后，小护将结合问题、上下文和匹配资料生成回答。
              </p>
            </div>
            <button onClick={onAiSettings}>
              连接 AI
              <ArrowUpRight size={15} />
            </button>
          </div>
        )}
        <div
          className="conversation"
          role="log"
          aria-label="与小护的对话"
          aria-live="polite"
        >
          <div className="message assistant">
            <span className="assistant-avatar small">
              <Sprout size={20} />
            </span>
            <div className="message-main">
              <span className="message-name">小护</span>
              <div className="message-bubble welcome-bubble">
                <h3>您好，我是小护。很高兴陪着您 🌿</h3>
                <p>
                  无论是工资算不清、校园设施出了故障，还是工作中的安全问题，都可以跟我说说。
                </p>
                <p>告诉我您遇到了什么事，我会先讲结论，再说明操作步骤。</p>
                <div className="welcome-prompts">
                  {[
                    "加班费怎么计算？",
                    "没有签劳动合同怎么办？",
                    "84消毒液能和洁厕灵混用吗？",
                  ].map((question) => (
                    <button
                      key={question}
                      onClick={() => askWithIdentity(question)}
                      disabled={loading}
                    >
                      {question}
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <span
                className={
                  message.role === "assistant"
                    ? "assistant-avatar small"
                    : "user-avatar"
                }
              >
                {message.role === "assistant" ? <Sprout size={20} /> : "您"}
              </span>
              <div className="message-main">
                <span className="message-name">
                  {message.role === "assistant" ? "小护" : "您"}
                </span>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <div className="markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkBreaks]}
                        components={{
                          a: ({ children, ...props }) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                              <ArrowUpRight size={11} />
                            </a>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="user-content">{message.content}</p>
                  )}
                </div>
                {message.role === "assistant" && message.sources && message.mode !== "error" && (
                  <RetrievedSources sources={message.sources} />
                )}
                {message.role === "assistant" && (
                  <div className="message-actions">
                    <span>
                      {message.mode === "ai"
                        ? `AI 生成${message.model ? ` · ${message.model}` : ""}`
                        : message.mode === "error"
                          ? "模型请求未成功 · 请检查连接"
                          : message.mode === "fallback"
                            ? "AI 暂不可用 · 已使用本地参考指引"
                            : "本地知识指引 · 请核实个案适用性"}
                    </span>
                    {message.mode === "error" && (
                      <button onClick={onAiSettings}>
                        <PlugZap size={14} />
                        AI 连接设置
                      </button>
                    )}
                    <button
                      onClick={() => void copy(message)}
                      aria-label="复制这条答复"
                    >
                      {copied === message.id ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                      {copied === message.id ? "已复制" : "复制"}
                    </button>
                    {message.topic === "repair" && (
                      <button onClick={onRepair}>
                        <Wrench size={14} />
                        填写报修单
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message assistant">
              <span className="assistant-avatar small">
                <Sprout size={20} />
              </span>
              <div className="thinking">
                <span />
                <span />
                <span />
                <p>小护正在整理您的问题…</p>
              </div>
            </div>
          )}
          {copied === "error" && (
            <p role="alert" className="inline-note">
              浏览器暂不支持复制，请选中答复文字手动复制。
            </p>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-area">
          <div className="identity-picker">
            <span>我的身份</span>
            {["后勤劳动者", "勤工助学学生", "其他"].map((value) => (
              <button
                key={value}
                className={identity === value ? "selected" : ""}
                aria-pressed={identity === value}
                onClick={() => setIdentity(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="说说您遇到的事，也可以补充工作地点、用工形式和具体时间…"
              aria-label="咨询问题"
              disabled={loading}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <div className="composer-bottom">
              <span>
                <MessageCircle size={13} />
                {input.length
                  ? `${input.length} / 2000`
                  : "Enter 发送 · Shift + Enter 换行"}
              </span>
              <button
                className="send-message"
                type="submit"
                disabled={!input.trim() || loading}
              >
                发送
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
          <p className="chat-disclaimer">
            {mode === "local"
              ? "当前为本地参考问答，可解答预设常见场景；"
              : "回答由 AI 辅助生成；"}
            重大争议请向校后勤工会或劳动仲裁机构核实。
          </p>
        </div>
      </div>
    </div>
  );
}
