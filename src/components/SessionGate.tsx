import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck, Sprout, UserRound } from "lucide-react";
import { api, setActiveAccount, type Account } from "../lib/api";
import { ThemeControl } from "../lib/theme";
import type { WorkspaceSnapshot } from "../lib/workspace";
import { useDeployment } from "../lib/deployment";
import { parseWorkspaceRoute, workspaceHash } from "../lib/navigation";
import "./accounts.css";

type Session = { user: Account | null; setupRequired: boolean };
export default function SessionGate({ children }: { children: (user: Account, workspace: WorkspaceSnapshot, exit: () => void) => ReactNode }) {
  const [session, setSession] = useState<Session>({ user: null, setupRequired: false });
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError(""); setActiveAccount(null);
    try {
      const next = await api<Session>("/api/auth/session");
      setActiveAccount(next.user);
      const data = next.user ? await api<WorkspaceSnapshot>("/api/workspace") : null;
      setSession(next); setWorkspace(data);
    } catch { setError("无法连接账号服务，请检查网络和服务状态后重试。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const enter = async (user: Account) => {
    setActiveAccount(user);
    const data = await api<WorkspaceSnapshot>("/api/workspace");
    setWorkspace(data); setSession({ user, setupRequired: false });
    const route = parseWorkspaceRoute(window.location.hash, user.role);
    window.location.hash = workspaceHash(user.role === "admin" && route.page === "home" ? { page: "admin" } : route);
  };
  if (loading || error) return <div className="account-loading"><Sprout size={38} /><h1>校园智护</h1><p role={error ? "alert" : "status"}>{error || "正在载入您的工作空间…"}</p>{error && <button className="button primary" onClick={() => void load()}>重新连接</button>}<ThemeControl /></div>;
  if (session.user && workspace) return children(session.user, workspace, () => { setActiveAccount(null); setSession({ user: null, setupRequired: false }); setWorkspace(null); window.location.hash = "home"; void load(); });
  return <AuthScreen setupRequired={session.setupRequired} onAuthenticated={enter} />;
}

function AuthScreen({ setupRequired, onAuthenticated }: { setupRequired: boolean; onAuthenticated: (user: Account) => Promise<void> }) {
  const { deployment, label, description } = useDeployment();
  const [portal, setPortal] = useState<"user" | "admin">("user");
  const [mode, setMode] = useState<"login" | "register" | "bootstrap">("login");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const creating = mode !== "login";
  useEffect(() => { document.title = `${mode === "bootstrap" ? "初始化管理员" : mode === "register" ? "用户注册" : portal === "admin" ? "管理员登录" : "用户登录"} · 校园智护`; }, [mode, portal]);
  const changeMode = (next: typeof mode) => { setMode(next); setError(""); setPassword(""); setConfirm(""); setSetupCode(""); setVisible(false); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busyRef.current) return;
    if (creating && password !== confirm) { setError("两次输入的密码不一致。"); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await api<{ user: Account }>(`/api/auth/${mode}`, { username, name, password, portal, ...(mode === "bootstrap" ? { setupCode } : {}) });
      await onAuthenticated(result.user);
    } catch (e) { setError(e instanceof Error ? e.message : "暂时无法登录，请重试。"); }
    finally { setBusy(false); busyRef.current = false; }
  };
  return <div className="auth-page">
    <section className="auth-story" aria-labelledby="auth-service-title">
      <div className="auth-brand"><span><Sprout size={26} strokeWidth={1.8} /></span><strong>校园智护</strong></div>
      <div className="auth-story-copy">
        <h1 id="auth-service-title">校园服务<br /><em>工作台</em></h1>
        <p>办理后勤报修与安全巡检，查阅劳动权益资料。</p>
      </div>
      <div className="auth-campus"><img src="/campus-scene.svg" alt="" width="600" height="360" /></div>
      <footer><ShieldCheck size={16} />账号记录独立保存</footer>
    </section>
    <section className="auth-panel" aria-labelledby="auth-form-title">
      <header><span className="auth-environment"><i aria-hidden="true" />{label}</span><ThemeControl /></header>
      <div className="auth-form-wrap">
        <h2 id="auth-form-title">{mode === "bootstrap" ? "初始化管理员" : mode === "register" ? "创建您的账号" : portal === "admin" ? "管理员登录" : "登录校园智护"}</h2>
        <p>{mode === "bootstrap" ? "使用部署初始化码创建首位管理员。" : mode === "register" ? "注册后即可保存您的咨询、报修与巡检记录。" : portal === "admin" ? "受理校方工单，管理用户与 AI 服务配置。" : "进入个人工作台，查看工单和巡检进度。"}</p>
        <div className="auth-portal" role="group" aria-label="登录身份">
          <button disabled={busy} className={portal === "user" ? "active" : ""} aria-pressed={portal === "user"} onClick={() => { setPortal("user"); changeMode("login"); }}><UserRound size={17} />用户入口</button>
          <button disabled={busy} className={portal === "admin" ? "active" : ""} aria-pressed={portal === "admin"} onClick={() => { setPortal("admin"); changeMode("login"); }}><ShieldCheck size={17} />管理员入口</button>
        </div>
        <form onSubmit={(event) => void submit(event)} className="account-form">
          {mode === "bootstrap" && <label>管理员初始化码<input type="password" autoComplete="off" value={setupCode} onChange={(event) => setSetupCode(event.target.value)} required maxLength={128} placeholder="由部署人员提供" /><small>{deployment === "local" ? "首次启动生成于项目目录 .guardian/admin-setup-code.txt，使用后失效。" : "请使用部署人员配置的管理员初始化码，使用后失效。"}</small></label>}
          {creating && <label>姓名或昵称<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" required maxLength={40} placeholder="方便在工作记录中识别您" /></label>}
          <label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} placeholder="3–32位字母、数字或下划线" spellCheck={false} autoCapitalize="none" /></label>
          <label>密码<div className="account-password"><input type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 10 : 1} maxLength={128} placeholder={creating ? "设置至少10个字符的密码" : "请输入您的密码"} /><button type="button" aria-label={visible ? "隐藏密码" : "显示密码"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {creating && <label>确认密码<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required maxLength={128} placeholder="再次输入密码" /></label>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <button className="account-submit" disabled={busy} type="submit">{busy ? "正在验证…" : mode === "bootstrap" ? "创建管理员并进入" : mode === "register" ? "注册并进入工作台" : "登录并进入工作台"}<ArrowRight size={18} /></button>
        </form>
        {portal === "user" && <p className="account-switch">{creating ? "已有账号？" : "第一次使用？"}<button disabled={busy} onClick={() => changeMode(creating ? "login" : "register")}>{creating ? "返回登录" : "注册用户账号"}</button></p>}
        {portal === "admin" && setupRequired && <p className="account-switch"><KeyRound size={14} />{mode === "bootstrap" ? "已有管理员账号？" : "首次部署？"}<button disabled={busy} onClick={() => changeMode(mode === "bootstrap" ? "login" : "bootstrap")}>{mode === "bootstrap" ? "返回登录" : "初始化管理员"}</button></p>}
        {portal === "admin" && !setupRequired && <p className="account-hint">管理员账号由部署人员初始化，普通用户注册不授予管理权限。</p>}
      </div>
      <footer>{description}<br />课程项目演示 · 非校方官方服务渠道</footer>
    </section>
  </div>;
}
