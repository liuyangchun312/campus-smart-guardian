import { useState } from "react";
import { Download, KeyRound, LogOut, ShieldCheck, Upload } from "lucide-react";
import Modal from "./Modal";
import { api, type Account } from "../lib/api";
export default function AccountPanel({ user, onClose, signOut, importLegacy, download, notify }: { user: Account; onClose: () => void; signOut: () => Promise<void>; importLegacy: () => void; download: () => void; notify: (message: string) => void }) {
  const [current, setCurrent] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [owned, setOwned] = useState(false);
  const change = async (event: React.FormEvent) => {
    event.preventDefault(); if (password !== confirm) { setError("两次新密码不一致。"); return; }
    setBusy(true); setError("");
    try { await api("/api/auth/password", { currentPassword: current, password }); setCurrent(""); setPassword(""); setConfirm(""); notify("密码已修改，其他设备上的登录会话已退出"); }
    catch (e) { setError(e instanceof Error ? e.message : "修改失败，请重试。"); }
    finally { setBusy(false); }
  };
  return <Modal title="我的账号" onClose={onClose}><div className="account-profile"><span>{user.name.slice(0, 1)}</span><div><h3>{user.name}</h3><p>@{user.username} · {user.role === "admin" ? "管理员" : "普通用户"}</p></div><ShieldCheck size={22} /></div><p className="account-hint">工作记录保存在本机服务的账号数据库中，退出账号后仍会保留。</p><details className="account-details"><summary><KeyRound size={16} />修改密码</summary><form className="account-form" onSubmit={(event) => void change(event)}><label>当前密码<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required maxLength={128} /></label><label>新密码<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} /></label><label>确认新密码<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={128} /></label>{error && <p className="account-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "正在修改…" : "保存新密码"}</button></form></details><details className="account-details"><summary><Upload size={16} />导入旧版浏览器记录</summary><p className="account-hint">可把升级前此浏览器中的对话、工单、巡检导入当前账号。同编号记录保留账号已有版本，原始浏览器数据保留。</p><label className="account-ownership"><input type="checkbox" checked={owned} onChange={(e) => setOwned(e.target.checked)} />我确认这些旧记录属于我</label><button className="button outline small" disabled={!owned} onClick={importLegacy}>导入到当前账号</button></details><div className="account-panel-actions"><button className="button outline small" onClick={download}><Download size={15} />导出记录备份</button><button className="button outline small" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); }}><LogOut size={15} />退出登录</button></div></Modal>;
}
