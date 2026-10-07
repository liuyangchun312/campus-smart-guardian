import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  PlugZap,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";

type PublicConfig = {
  configured: boolean;
  enabled: boolean;
  hasKey: boolean;
  baseUrl: string;
  model: string;
  verifiedAt: string | null;
  source: "saved" | "env" | "none";
  protocol: "chat" | "responses";
};
const RELAY_URL = "https://ahhilai.top/v1";
const DEFAULT_MODEL = "deepseek-v4.1-flash";

export default function AiSettings({
  onClose,
  onChange,
}: {
  onClose: () => void;
  onChange: (mode: "local" | "ai", model: string) => void;
}) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState(RELAY_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [protocol, setProtocol] = useState<"chat" | "responses">("chat");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"load" | "connect" | "disconnect" | null>(
    "load",
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const canonical = (value: string) =>
    value
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/chat\/completions$/, "");
  const canReuseKey =
    !!config?.hasKey && canonical(baseUrl) === canonical(config.baseUrl);
  useEffect(() => {
    let active = true;
    const pending = new AbortController();
    const timer = window.setTimeout(() => pending.abort(), 5000);
    apiFetch("/api/ai/config", { signal: pending.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("无法读取 AI 设置，请确认本机服务已启动后重新打开。");
        const data: PublicConfig = await response.json();
        if (!active) return;
        setConfig(data);
        setError("");
        if (data.baseUrl) setBaseUrl(data.baseUrl);
        if (data.model) setModel(data.model);
        if (data.configured && data.protocol) setProtocol(data.protocol);
      })
      .catch((reason) => {
        if (!active) return;
        if (!pending.signal.aborted)
          setError(reason instanceof Error ? reason.message : "无法读取设置");
        else setError("读取设置超时，请确认本机服务已启动。");
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (active) setBusy(null);
      });
    return () => {
      active = false;
      pending.abort();
      controller.current?.abort();
      window.clearTimeout(timer);
    };
  }, []);
  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSuccess(false);
    setBusy("connect");
    const pending = new AbortController();
    controller.current = pending;
    const timer = window.setTimeout(() => pending.abort(), 20000);
    try {
      const response = await apiFetch("/api/ai/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Guardian-Config": "1",
        },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          protocol,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
        signal: pending.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "连接失败，请核对密钥、地址及模型名称。",
        );
      if (data.mode !== "ai" || !data.enabled || !data.verifiedAt)
        throw new Error("服务没有返回连接成功确认，请重试。");
      setConfig(data);
      setApiKey("");
      setShowKey(false);
      setSuccess(true);
      onChange("ai", data.model);
    } catch (reason) {
      setError(
        pending.signal.aborted
          ? "连接测试超时，请检查网络，并重新打开设置确认当前连接状态。"
          : reason instanceof Error
            ? reason.message
            : "无法连接本机服务，请稍后重试。",
      );
    } finally {
      window.clearTimeout(timer);
      setBusy(null);
      controller.current = null;
    }
  };
  const disconnect = async () => {
    if (busy) return;
    setBusy("disconnect");
    setError("");
    setSuccess(false);
    const pending = new AbortController();
    controller.current = pending;
    const timer = window.setTimeout(() => pending.abort(), 5000);
    try {
      const response = await apiFetch("/api/ai/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Guardian-Config": "1",
        },
        body: "{}",
        signal: pending.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "停用失败，请重试。");
      setConfig(data);
      setApiKey("");
      onChange("local", "");
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name !== "AbortError"
          ? reason.message
          : "请求超时，请重新打开设置确认连接状态。",
      );
    } finally {
      window.clearTimeout(timer);
      setBusy(null);
      controller.current = null;
    }
  };
  return (
    <Modal
      title="连接 AI 问答"
      onClose={() => {
        if (!busy || busy === "load") onClose();
      }}
    >
      <div className="ai-setup-intro">
        <span>
          <PlugZap size={26} />
        </span>
        <div>
          <h3>连接 AHHil_AI 中转站</h3>
          <p>让模型结合您的问题和上下文生成回答，支持自由提问与追问。</p>
        </div>
      </div>
      <ol className="ai-setup-steps">
        <li>
          <span>1</span>
          <div>
            <strong>在中转站创建令牌</strong>
            <p>
              登录站点控制台，在“令牌管理”创建
              Key，选择可访问目标模型的分组，并确认有可用额度。
            </p>
            <a
              href="https://ahhilai.top/dashboard"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开 AHHil_AI 控制台
              <ArrowUpRight size={14} />
            </a>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>填写令牌，确认模型</strong>
            <p>
              已按站点文档预填地址和示例模型，实际可用模型以您账号的权限为准。
            </p>
          </div>
        </li>
      </ol>
      <form onSubmit={(event) => void connect(event)} autoComplete="off">
        <fieldset className="ai-settings-fields" disabled={!!busy}>
          <label className="field-label" htmlFor="ai-key">
            中转站 API Key <KeyRound size={13} />
          </label>
          <div className="secret-input">
            <input
              id="ai-key"
              name="guardian-ai-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              required={!canReuseKey}
              maxLength={2048}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={
                canReuseKey
                  ? "已保存密钥；留空继续使用，更换时粘贴新密钥"
                  : "粘贴 ahhilai.top 令牌管理中生成的 Key"
              }
              onChange={(event) => {
                setApiKey(event.target.value);
                setSuccess(false);
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={showKey ? "隐藏密钥" : "显示密钥"}
              onClick={() => setShowKey((previous) => !previous)}
            >
              {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p className="field-help">
            <ShieldCheck size={13} />{" "}
            密钥只保存在本机后端配置文件，不存入浏览器；仅发给您设置的模型服务。
          </p>
          <label className="field-label" htmlFor="ai-base-url">
            服务地址
          </label>
          <input
            id="ai-base-url"
            type="url"
            required
            value={baseUrl}
            maxLength={1000}
            onChange={(event) => {
              setBaseUrl(event.target.value);
              setSuccess(false);
            }}
            spellCheck={false}
          />
          <label className="field-label" htmlFor="ai-model">
            模型名称
          </label>
          <input
            id="ai-model"
            required
            value={model}
            maxLength={150}
            onChange={(event) => {
              setModel(event.target.value);
              setSuccess(false);
            }}
            spellCheck={false}
          />
          <div className="ai-model-presets">
            <button
              type="button"
              onClick={() => {
                setModel("deepseek-v4.1-flash");
                setProtocol("chat");
                setSuccess(false);
              }}
              className={model === "deepseek-v4.1-flash" ? "selected" : ""}
            >
              DeepSeek V4.1 Flash
            </button>
            <button
              type="button"
              onClick={() => {
                setModel("gpt-5.5");
                setProtocol("responses");
                setSuccess(false);
              }}
              className={model === "gpt-5.5" ? "selected" : ""}
            >
              GPT 5.5
            </button>
          </div>
          <p className="field-help">
            DeepSeek 在站点列表中对应“小国模”分组；GPT 需允许访问的 GPT 分组。
            <a
              href="https://ahhilai.top/pricing"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看站点模型列表 <ArrowUpRight size={11} />
            </a>
          </p>
          <label className="field-label" htmlFor="ai-protocol">
            接口协议
          </label>
          <select
            id="ai-protocol"
            value={protocol}
            onChange={(event) => {
              setProtocol(event.target.value as "chat" | "responses");
              setSuccess(false);
            }}
          >
            <option value="responses">
              Responses · 站点 GPT 文档使用的接口
            </option>
            <option value="chat">Chat Completions · 通用对话接口</option>
          </select>
        </fieldset>
        {busy === "load" && (
          <p className="ai-connection-feedback" role="status">
            <LoaderCircle size={16} className="spinning" />
            正在读取连接设置…
          </p>
        )}
        {error && (
          <div className="ai-connection-error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="ai-connection-success" role="status">
            <CheckCircle2 size={20} />
            <div>
              <strong>连接测试成功，AI 问答已启用</strong>
              <p>
                当前模型：{config?.model}。关闭窗口后就可以开始提问，无需重启。
              </p>
            </div>
          </div>
        )}
        {!success && config?.enabled && (
          <p className="ai-connection-feedback">
            <CheckCircle2 size={15} />
            当前已启用：{config.model}
            {config.verifiedAt ? " · 已通过连接测试" : " · 尚未测试"}
          </p>
        )}
        <button
          className="button primary full-button"
          type="submit"
          disabled={!!busy || (!apiKey.trim() && !canReuseKey)}
        >
          {busy === "connect" ? (
            <>
              <LoaderCircle size={17} className="spinning" />
              正在测试连接…
            </>
          ) : (
            <>
              <PlugZap size={17} />
              测试连接并启用 AI
            </>
          )}
        </button>
        <p className="ai-test-caption">
          将发送一条简短测试消息；测试成功后保存设置。后续咨询会发送至所选模型服务。
        </p>
      </form>
      <div className="ai-settings-footer">
        <a
          href="https://ahhilai.top/docs#protocol"
          target="_blank"
          rel="noopener noreferrer"
        >
          AHHil_AI 接入文档
          <ArrowUpRight size={12} />
        </a>
        {config?.enabled && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void disconnect()}
          >
            <Unplug size={14} />
            {busy === "disconnect" ? "正在停用…" : "停用 AI 连接"}
          </button>
        )}
      </div>
    </Modal>
  );
}
