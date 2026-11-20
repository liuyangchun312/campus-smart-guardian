import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Sprout, UserRound } from "lucide-react";
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
  const sampleProgress = 98;
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
  return <main className="auth-page">
    <header className="auth-header">
      <div className="auth-brand">
        <span className="brand-mark"><Sprout size={25} strokeWidth={1.75} aria-hidden="true" /></span>
        <strong>校园智护</strong>
      </div>
      <div className="auth-toolbar">
        <span className="auth-environment" title={description}><span className="status-dot" aria-hidden="true" />{label}</span>
        <ThemeControl />
      </div>
    </header>
    <section className="auth-story" aria-labelledby="auth-service-title">
      <div className="auth-story-copy">
        <h1 id="auth-service-title">校园服务<wbr />工作台</h1>
        <p>集中办理后勤报修和安全巡检，随时查阅劳动权益指引。</p>
      </div>
      <div className="auth-campus">
        <img src="/campus-scene.svg" alt="" width="600" height="360" />
        <div className="auth-campus-card auth-campus-status">
          <span className="status-dot" aria-hidden="true" />
          账号服务在线
        </div>
        <div className="auth-campus-card auth-campus-progress">
          <div><span>巡检进度示例</span><strong className="numeric">{sampleProgress}%</strong></div>
          <progress value={sampleProgress} max={100} aria-label="示例巡检进度" />
        </div>
      </div>
    </section>
    <section className="auth-form-wrap" aria-labelledby="auth-form-title">
      <h2 id="auth-form-title">{mode === "bootstrap" ? "初始化管理员" : mode === "register" ? "创建您的账号" : portal === "admin" ? "管理员登录" : "登录校园智护"}</h2>
      <p>{mode === "bootstrap" ? "使用部署初始化码创建首位管理员。" : mode === "register" ? "注册后即可保存您的咨询、报修与巡检记录。" : portal === "admin" ? "受理校方工单，管理用户与 AI 服务配置。" : "进入个人工作台，查看工单和巡检进度。"}</p>
      <div className="auth-portal" data-portal={portal} role="group" aria-label="登录身份">
        <button type="button" disabled={busy} aria-pressed={portal === "user"} onClick={() => { setPortal("user"); changeMode("login"); }}><UserRound size={17} aria-hidden="true" />用户入口</button>
        <button type="button" disabled={busy} aria-pressed={portal === "admin"} onClick={() => { setPortal("admin"); changeMode("login"); }}><ShieldCheck size={17} aria-hidden="true" />管理员入口</button>
      </div>
      <form onSubmit={(event) => void submit(event)} className="account-form">
        {mode === "bootstrap" && <label>管理员初始化码<input type="password" autoComplete="off" value={setupCode} onChange={(event) => setSetupCode(event.target.value)} required maxLength={128} placeholder="由部署人员提供" /><small>{deployment === "local" ? "首次启动生成于项目目录 .guardian/admin-setup-code.txt，使用后失效。" : "请使用部署人员配置的管理员初始化码，使用后失效。"}</small></label>}
        {creating && <label>姓名或昵称<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" required maxLength={40} placeholder="方便在工作记录中识别您" /></label>}
        <div className="auth-field">
          <label htmlFor="auth-username">账号</label>
          <div className="auth-input">
            <UserRound size={17} aria-hidden="true" />
            <input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required pattern="[a-zA-Z0-9_]{3,32}" minLength={3} maxLength={32} placeholder="3–32位字母、数字或下划线" spellCheck={false} autoCapitalize="none" />
          </div>
        </div>
        <div className="auth-field">
          <label htmlFor="auth-password">密码</label>
          <div className="auth-input account-password">
            <LockKeyhole size={17} aria-hidden="true" />
            <input id="auth-password" type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 10 : 1} maxLength={128} placeholder={creating ? "设置至少10个字符的密码" : "请输入您的密码"} />
            <button type="button" aria-label={visible ? "隐藏密码" : "显示密码"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
        </div>
        {creating && <label>确认密码<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required maxLength={128} placeholder="再次输入密码" /></label>}
        {error && <p className="account-error" role="alert">{error}</p>}
        <button className="account-submit" disabled={busy} type="submit">{busy ? "正在验证…" : mode === "bootstrap" ? "创建管理员并进入" : mode === "register" ? "注册并进入工作台" : "登录并进入工作台"}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      {portal === "user" && <p className="account-switch">{creating ? "已有账号？" : "第一次使用？"}<button disabled={busy} onClick={() => changeMode(creating ? "login" : "register")}>{creating ? "返回登录" : "注册用户账号"}</button></p>}
      {portal === "admin" && setupRequired && <p className="account-switch"><KeyRound size={14} />{mode === "bootstrap" ? "已有管理员账号？" : "首次部署？"}<button disabled={busy} onClick={() => changeMode(mode === "bootstrap" ? "login" : "bootstrap")}>{mode === "bootstrap" ? "返回登录" : "初始化管理员"}</button></p>}
      {portal === "admin" && !setupRequired && <p className="account-hint">管理员账号由部署人员初始化，普通用户注册不授予管理权限。</p>}
    </section>
    <footer className="auth-footer">
      <p><ShieldCheck size={15} aria-hidden="true" />{description}</p>
      <p>课程项目演示 · 非校方官方服务渠道</p>
    </footer>
  </main>;
}
