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
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

export default function AiSettings({
  onClose,
  onChange,
  target = "primary",
}: {
  onClose: () => void;
  onChange: (mode: "local" | "ai", model: string) => void;
  target?: "primary" | "backup";
}) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const backup = target === "backup";
  const endpoint = backup ? "/api/ai/backup" : "/api/ai";
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
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
      .replace(/\/(?:chat\/completions|responses)$/, "");
  const canReuseKey =
    !!config?.hasKey && canonical(baseUrl) === canonical(config.baseUrl);
  useEffect(() => {
    let active = true;
    const pending = new AbortController();
    const timer = window.setTimeout(() => pending.abort(), 5000);
    apiFetch("/api/ai/config", { signal: pending.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("无法读取 AI 设置，请稍后重新打开。");
        const saved: PublicConfig & { backup: PublicConfig } = await response.json();
        const data = backup ? saved.backup : saved;
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
        else setError("读取设置超时，请检查网络连接。");
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
      const response = await apiFetch(`${endpoint}/connect`, {
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
      const tested = backup ? data.backup : data;
      if (data.mode !== "ai" || !tested?.enabled || !tested?.verifiedAt)
        throw new Error("服务没有返回连接成功确认，请重试。");
      setConfig(backup ? data.backup : data);
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
      const response = await apiFetch(`${endpoint}/disconnect`, {
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
      setConfig(backup ? data.backup : data);
      setApiKey("");
      onChange(data.mode, data.model ?? "");
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
      title={backup ? "备用 AI 服务" : "平台 AI 服务"}
      onClose={() => {
        if (!busy || busy === "load") onClose();
      }}
    >
      <div className="ai-setup-intro">
        <span>
          <PlugZap size={26} />
        </span>
        <div>
          <h3>{backup ? "配置备用模型服务" : "统一提供智能咨询"}</h3>
          <p>{backup ? "主服务无法回答时，咨询将自动转交给已测试的备用服务。" : "为全站用户配置模型服务。"}</p>
        </div>
      </div>
      <ol className="ai-setup-steps">
        <li>
          <span>1</span>
          <div>
            <strong>创建 DeepSeek API Key</strong>
            <p>
              登录 DeepSeek 开放平台，创建 API Key，并确认账户有可用余额。
            </p>
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开 DeepSeek 开放平台
              <ArrowUpRight size={14} />
            </a>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>填写密钥，确认模型</strong>
            <p>
              已预填 DeepSeek 官方地址和模型，实际可用模型以您的账号权限为准。
            </p>
          </div>
        </li>
      </ol>
      <form onSubmit={(event) => void connect(event)} autoComplete="off">
        <fieldset className="ai-settings-fields" disabled={!!busy}>
          <label className="field-label" htmlFor="ai-key">
            API Key <KeyRound size={13} />
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
                  : "粘贴 DeepSeek 开放平台生成的 API Key"
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
            密钥仅保存在服务端，不存入浏览器；仅发给您配置的模型服务。
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
                setBaseUrl(DEFAULT_BASE_URL);
                setModel(DEFAULT_MODEL);
                setProtocol("chat");
                setSuccess(false);
              }}
              className={model === DEFAULT_MODEL ? "selected" : ""}
            >
              DeepSeek Flash
            </button>
            <button
              type="button"
              onClick={() => {
                setBaseUrl(DEFAULT_BASE_URL);
                setModel("deepseek-v4-pro");
                setProtocol("chat");
                setSuccess(false);
              }}
              className={model === "deepseek-v4-pro" ? "selected" : ""}
            >
              DeepSeek V4 Pro
            </button>
          </div>
          <p className="field-help">
            <a
              href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看 DeepSeek 模型与价格 <ArrowUpRight size={11} />
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
              Responses · 其他兼容服务
            </option>
            <option value="chat">Chat Completions · DeepSeek 对话接口</option>
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
              <strong>{backup ? "备用服务已通过测试并启用" : "连接测试成功，AI 问答已启用"}</strong>
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
              {backup ? "测试并启用备用服务" : "测试连接并启用 AI"}
            </>
          )}
        </button>
        <p className="ai-test-caption">
          将发送一条简短测试消息；测试成功后保存设置。后续咨询会发送至所选模型服务。
        </p>
      </form>
      <div className="ai-settings-footer">
        <a
          href="https://api-docs.deepseek.com/zh-cn/"
          target="_blank"
          rel="noopener noreferrer"
        >
          DeepSeek 官方接入文档
          <ArrowUpRight size={12} />
        </a>
        {config?.enabled && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void disconnect()}
          >
            <Unplug size={14} />
            {busy === "disconnect" ? "正在停用…" : backup ? "停用备用服务" : "停用 AI 连接"}
          </button>
        )}
      </div>
    </Modal>
  );
}
