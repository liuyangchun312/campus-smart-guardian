import http from "node:http";
import { readFile, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { SYSTEM_PROMPT } from "./prompt.mjs";
import { retrieveEvidence, formatEvidenceContext } from "../shared/knowledge.mjs";
import { createAccounts, AccountError } from "./accounts.mjs";
import { createAiRuntime, recoverModel } from "./ai-runtime.mjs";

const defaultConfigFile = import.meta.url
  ? fileURLToPath(new URL("../.guardian/ai-config.json", import.meta.url))
  : "/tmp/guardian/ai-config.json";
class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}
function send(res, status, body) {
  if (res.destroyed || res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}
function isLocal(req) {
  const hosts = ["127.0.0.1", "localhost", "[::1]"];
  try {
    if (!hosts.includes(new URL(`http://${req.headers.host}`).hostname))
      return false;
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (
        origin.protocol !== "http:" ||
        !hosts.includes(origin.hostname) ||
        !["5173", "4173", "3001"].includes(origin.port)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function readJson(req, limit = 96 * 1024) {
  if (
    !req.headers["content-type"]?.toLowerCase().startsWith("application/json")
  )
    throw new HttpError(415, "请求必须使用 JSON 格式。");
  if (Number(req.headers["content-length"]) > limit)
    throw new HttpError(413, "请求内容过长，请精简后重试。");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "请求内容过长。");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "请求内容不是有效的 JSON 对象。");
  }
}
function canonicalBase(value) {
  try {
    if (typeof value !== "string" || value.length > 1000) throw new Error();
    const url = new URL(value.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
      throw new Error();
    if (url.username || url.password || url.hash || url.search)
      throw new Error();
    url.pathname = url.pathname
      .replace(/\/+$/, "")
      .replace(/\/(?:chat\/completions|responses)$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new HttpError(
      400,
      "服务地址格式不正确。请填写 HTTPS API Base URL，例如 https://ahhilai.top/v1。",
      "baseUrl",
    );
  }
}
function validateConfig(raw, previous) {
  const baseUrl = canonicalBase(raw.baseUrl);
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!model || model.length > 150 || /[\r\n\x00-\x1f]/.test(model))
    throw new HttpError(400, "请填写站点提供的准确模型名称。", "model");
  const protocol = raw.protocol ?? "chat";
  if (!["chat", "responses"].includes(protocol))
    throw new HttpError(400, "请选择支持的接口协议。", "protocol");
  const supplied = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const apiKey =
    supplied || (previous?.baseUrl === baseUrl ? previous.apiKey : "");
  if (!apiKey || apiKey.length > 2048 || /[^\x21-\x7e]/.test(apiKey))
    throw new HttpError(
      400,
      "请填写此站点签发的有效 API Key。更换服务地址时需要重新输入密钥。",
      "apiKey",
    );
  return { baseUrl, model, protocol, apiKey, enabled: true, verifiedAt: null };
}
function readEventResponse(raw, responses) {
  let text = "";
  let completed = false;
  let result;
  for (const block of raw.replace(/\r\n?/g, "\n").split("\n\n")) {
    const data = block.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    if (data === "[DONE]") {
      if (!responses) completed = true;
      continue;
    }
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new HttpError(502, "模型服务返回的事件流格式不正确，请稍后重试。");
    }
    if (!event || typeof event !== "object" || Array.isArray(event))
      throw new HttpError(502, "模型服务返回的事件流格式不正确，请稍后重试。");
    if (event.error || ["error", "response.failed", "response.incomplete"].includes(event.type))
      throw new HttpError(502, "模型服务在生成答复时返回错误，请检查服务状态、额度或稍后重试。");
    if (responses) {
      // Use the completed response, which includes all output blocks, only once.
      if (event.type === "response.completed" && event.response) {
        result = event.response;
        completed = true;
      }
    } else {
      const choice = event.choices?.find((item) => (item.index ?? 0) === 0);
      if (typeof choice?.delta?.content === "string") text += choice.delta.content;
      if (typeof choice?.message?.content === "string") text = choice.message.content;
      if (choice?.finish_reason != null) completed = true;
    }
  }
  if (!completed)
    throw new HttpError(502, "模型服务的事件流未完整结束，请重新发送问题。");
  return responses ? result : { choices: [{ message: { content: text } }] };
}
async function readResponse(response, responses) {
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(502, "模型服务未返回内容。");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw new HttpError(502, "模型服务返回内容过长。");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const raw = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "").trim();
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!raw) throw new HttpError(502, "模型服务返回了空响应，请稍后重试。");
  if (contentType.includes("text/html") || /^<(?:!doctype\s+html|html)\b/i.test(raw))
    throw new HttpError(502, "模型服务返回了 HTML 网页，可能是 API 地址错误或中转站网关异常，请检查服务地址及服务状态。", "baseUrl");
  if (contentType.includes("text/event-stream") || /^(?:data:|event:|:)/.test(raw))
    return readEventResponse(raw, responses);
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload;
  } catch {
    throw new HttpError(
      502,
      "模型服务返回了无法识别的响应格式，请检查中转站服务状态、API 地址和接口协议。",
    );
  }
}
function publicConfig(config, source) {
  return {
    configured: !!config?.apiKey,
    enabled: !!config?.enabled,
    hasKey: !!config?.apiKey,
    baseUrl: config?.baseUrl ?? "",
    model: config?.model ?? "",
    protocol: config?.protocol ?? "chat",
    verifiedAt: config?.verifiedAt ?? null,
    source,
  };
}
function validateMessages(body) {
  if (
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    body.messages.length > 20
  )
    throw new HttpError(400, "请提供 1–20 条对话消息。");
  let total = 0;
  const messages = body.messages.map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > 10000
    )
      throw new HttpError(400, "消息角色或长度不正确。");
    total += message.content.length;
    return { role: message.role, content: message.content.trim() };
  });
  if (total > 32000)
    throw new HttpError(413, "上下文过长，请开始新对话后重试。");
  if (messages.at(-1).role !== "user")
    throw new HttpError(400, "最后一条消息必须来自用户。");
  return messages;
}
async function callModel(config, messages, probe, fetchImpl, sources = [], signal) {
  const responses = config.protocol === "responses";
  const endpoint = `${config.baseUrl}/${responses ? "responses" : "chat/completions"}`;
  const instructions = probe ? "Reply only OK." : `${SYSTEM_PROMPT}\n\n${formatEvidenceContext(sources)}`;
  const body = responses
    ? {
        model: config.model,
        instructions,
        input: messages,
        stream: true,
        store: false,
        max_output_tokens: probe ? 2048 : 4096,
      }
    : {
        model: config.model,
        messages: [{ role: "system", content: instructions }, ...messages],
        stream: true,
      };
  if (/^gpt-5(?:[.-]|$)/.test(config.model)) {
    if (responses) body.reasoning = { effort: "low" };
    else body.reasoning_effort = "low";
  }
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "User-Agent": "CampusGuardian/1.0",
    },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(probe ? 18000 : 45000),
    redirect: "manual",
  });
  // Workers only supports manual/follow; never forward a model key to a redirect target.
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw new HttpError(400, "模型服务返回重定向，请填写服务商提供的最终 API 地址。", "baseUrl");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status))
      throw new HttpError(
        400,
        "密钥无效或没有此模型的访问权限。请核对站点令牌、分组及模型权限。",
        "apiKey",
      );
    if (response.status === 402)
      throw new HttpError(
        402,
        "站点账户额度不足，请在该站控制台查看余额和令牌额度。",
      );
    if ([404, 405].includes(response.status))
      throw new HttpError(
        400,
        "接口或模型未找到，请核对服务地址、模型名称和接口协议。",
        "model",
      );
    if (response.status === 429)
      throw new HttpError(
        429,
        "站点限流或额度受限，请查看账户额度并稍后重试。",
      );
    if (response.status === 400 || response.status === 422)
      throw new HttpError(
        400,
        "模型不接受当前请求，请核对模型名称、令牌分组，或切换接口协议。",
        "model",
      );
    throw new HttpError(502, "中转站或上游模型暂不可用，请稍后重试。");
  }
  const payload = await readResponse(response, responses);
  const text = responses
    ? typeof payload.output_text === "string"
      ? payload.output_text
      : payload.output
          ?.filter((item) => item.type === "message")
          .flatMap((item) => item.content ?? [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text)
          .join("\n")
    : payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    const error = new HttpError(
      502,
      "模型没有返回可显示的答复，请检查所选协议，或更换可用的对话模型。",
    );
    const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
    const content = choice?.message?.content;
    error.diagnostic = {
      protocol: config.protocol,
      choices: Array.isArray(payload.choices) ? payload.choices.length : null,
      contentType: content === null ? "null" : Array.isArray(content) ? "array" : typeof content,
      reasoningOnly: !text && typeof choice?.message?.reasoning_content === "string" && !!choice.message.reasoning_content,
      finishReason: ["stop", "length", "content_filter", "tool_calls"].includes(choice?.finish_reason) ? choice.finish_reason : null,
      hasOutput: Array.isArray(payload.output) || typeof payload.output_text === "string",
      hasError: !!payload.error,
    };
    throw error;
  }
  return text.trim().slice(0, 20000);
}

export async function createGuardianServer({
  configFile = defaultConfigFile,
  env = process.env,
  fetchImpl = fetch,
  databaseFile = join(dirname(configFile), "guardian.sqlite"),
  bootstrapToken,
  database,
  configStore,
  secureCookies = false,
  requestAllowed = isLocal,
  clientAddress,
  recoveryDelayMs = 300,
} = {}) {
  const accounts = await createAccounts({ file: databaseFile, bootstrapToken, send, readJson, database, secureCookies, clientAddress });
  const runtime = createAiRuntime(accounts.database, accounts.transaction, { dailyLimit: env.AI_DAILY_LIMIT });
  let config = null;
  let source = "none";
  try {
    const saved = configStore ? await configStore.load() : JSON.parse(await readFile(configFile, "utf8"));
    if (!saved) throw Object.assign(new Error("No configuration"), { code: "ENOENT" });
    source = "saved";
    if (saved.enabled !== false)
      config = {
        ...validateConfig(saved),
        verifiedAt: saved.verifiedAt ?? null,
      };
    if (config && saved.backup?.enabled) {
      try { config.backup = { ...validateConfig(saved.backup), verifiedAt: saved.backup.verifiedAt ?? null }; }
      catch { /* An invalid backup must not disable the primary service. */ }
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      try {
        config = validateConfig({
          apiKey: env.AI_API_KEY,
          baseUrl: env.AI_BASE_URL,
          model: env.AI_MODEL,
          protocol: env.AI_PROTOCOL || "chat",
        });
        source = "env";
      } catch {
        /* Not configured. */
      }
    }
  }
  const persist = async (candidate) => {
    if (configStore) return configStore.save(candidate);
    await mkdir(dirname(configFile), { recursive: true, mode: 0o700 });
    const temporary = `${configFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(candidate, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, configFile);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  };
  let concurrent = 0;
  let configuring = false;
  const recent = [];
  const visibleConfig = () => ({ ...publicConfig(config, source), backup: publicConfig(config?.backup, source) });
  const safeIssue = (error) => error instanceof HttpError ? error.message : "模型服务连接失败或响应超时，请检查服务状态。";
  const server = http.createServer(async (req, res) => {
    try {
      if (!requestAllowed(req))
        return send(res, 403, { error: "仅接受本机应用请求。" });
      const path = new URL(req.url ?? "/", "http://127.0.0.1:3001").pathname;
      if (await accounts.handle(req, res, path)) return;
      if (req.method === "GET" && path === "/api/health")
        return send(res, 200, {
          deployment: database ? "cloud" : "local",
          mode: config?.enabled ? "ai" : "local",
          model: config?.model ?? "",
          verifiedAt: config?.verifiedAt ?? null,
        });
      if (req.method === "GET" && path === "/api/ai/config") {
        accounts.requireAdmin(req);
        return send(res, 200, visibleConfig());
      }
      if (req.method === "GET" && path === "/api/ai/status") {
        accounts.requireAdmin(req);
        return send(res, 200, { ...runtime.stats(), enabled: !!config?.enabled, model: config?.model ?? "", backup: publicConfig(config?.backup, source) });
      }
      if (
        !["/api/ai/connect", "/api/ai/disconnect", "/api/ai/backup/connect", "/api/ai/backup/disconnect", "/api/chat"].includes(path)
      )
        return send(res, 404, { error: "接口不存在。" });
      if (req.method !== "POST")
        return send(res, 405, { error: "请使用 POST 请求。" });
      const isSettings = path !== "/api/chat";
      const user = isSettings ? accounts.requireAdmin(req) : accounts.currentUser(req);
      if (isSettings && req.headers["x-guardian-config"] !== "1")
        return send(res, 403, { error: "请从本机的 AI 连接设置操作。" });
      const now = Date.now();
      while (recent.length && recent[0] < now - 60000) recent.shift();
      if (recent.length >= 30 || concurrent >= 4)
        return send(res, 429, { error: "请求较多，请稍后再试。" });
      recent.push(now);
      const body = await readJson(req);
      if (isSettings) {
        if (configuring)
          throw new HttpError(409, "已有连接设置正在处理，请稍后重试。");
        configuring = true;
        try {
          if (path === "/api/ai/disconnect") {
            await persist({ enabled: false });
            config = null;
            source = "saved";
            return send(res, 200, {
              ...publicConfig(config, source),
              mode: "local",
            });
          }
          const backup = path.startsWith("/api/ai/backup/");
          if (backup && !config?.enabled) throw new HttpError(400, "请先配置并启用主 AI 服务。");
          if (path === "/api/ai/backup/disconnect") {
            const candidate = { ...config };
            delete candidate.backup;
            await persist(candidate);
            config = candidate;
            source = "saved";
            return send(res, 200, { ...visibleConfig(), mode: "ai" });
          }
          const candidate = validateConfig(body, backup ? config?.backup : config);
          await callModel(
            candidate,
            [{ role: "user", content: "Reply only OK." }],
            true,
            fetchImpl,
          );
          candidate.verifiedAt = new Date().toISOString();
          const next = backup ? { ...config, backup: candidate } : { ...candidate, ...(config?.backup ? { backup: config.backup } : {}) };
          await persist(next);
          config = next;
          source = "saved";
          return send(res, 200, {
            ...visibleConfig(),
            mode: "ai",
          });
        } finally {
          configuring = false;
        }
      }
      if (!config?.enabled)
        throw new HttpError(
          503,
          "请先点击“连接 AI”，填写中转站令牌并测试启用。",
        );
      const messages = validateMessages(body);
      const sources = retrieveEvidence(messages.at(-1).content);
      if (concurrent >= 4) throw new HttpError(429, "请求较多，请稍后再试。");
      const current = config;
      const quota = runtime.consume(user.id);
      if (!quota.allowed) throw new HttpError(429, `今日智能咨询已达到 ${quota.limit} 次，请明天再试；紧急问题请联系现场人员。`);
      concurrent++;
      const started = Date.now();
      try {
        const result = await recoverModel((service, signal) => callModel(service, messages, false, fetchImpl, sources, signal), current, current.backup, { delayMs: recoveryDelayMs });
        runtime.record({ ok: true, model: result.model, durationMs: Date.now() - started, attempts: result.attempts, fallback: result.fallback, issue: result.issue ? safeIssue(result.issue) : null });
        return send(res, 200, { text: result.text, model: result.model, sources, remaining: quota.remaining });
      } catch (error) {
        runtime.record({ ok: false, model: error.model ?? current.model, durationMs: Date.now() - started, attempts: error.attempts ?? 1, fallback: error.fallback ?? false, issue: safeIssue(error) });
        if (user.role !== "admin") return send(res, error.status === 429 ? 429 : 503, { error: "智能咨询服务暂时繁忙，问题已保留，请稍后点击重新发送。" });
        throw error;
      } finally {
        concurrent--;
      }
    } catch (error) {
      if (error instanceof HttpError || error instanceof AccountError)
        return send(res, error.status, {
          error: error.message,
          ...(error.field ? { field: error.field } : {}),
          ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}),
        });
      if (["AbortError", "TimeoutError"].includes(error?.name))
        return send(res, 504, {
          error: "模型服务响应超时，请检查网络或稍后重试。",
        });
      if (["EACCES", "EPERM", "ENOSPC"].includes(error?.code))
        return send(res, 500, {
          error: "无法保存本机数据，请检查项目目录写入权限和磁盘空间。",
        });
      if (/^\/api\/(auth|workspace|admin)(\/|$)/.test(req.url ?? ""))
        return send(res, 500, { error: "账号或记录服务暂不可用，请检查本机服务后重试。" });
      return send(res, 502, {
        error: "无法连接模型服务，请核对 API 地址、网络和接口协议。",
      });
    }
  });
  server.on("close", () => accounts.close());
  return server;
}
