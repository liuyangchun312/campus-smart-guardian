import { useCallback, useEffect, useState } from "react";
import { Activity, PlugZap, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import "./ai-service.css";

type Event = { at: string; ok: boolean; model: string; durationMs: number; attempts: number; fallback: boolean; issue: string | null };
type Status = { enabled: boolean; model: string; backup: { enabled: boolean; model: string }; total: number; success: number; recovered: number; fallback: number; averageMs: number; dailyLimit: number; lastIssue: Event | null; recent: Event[] };

export default function AiServiceStatus({ onSettings, onBackupSettings }: { onSettings: () => void; onBackupSettings: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setStatus(await api<Status>("/api/ai/status")); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取服务状态。"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  return <section className="ai-service-section" aria-label="AI 服务监控">
    <div className="ai-service-heading"><h2><Activity size={19} />AI 服务监控</h2><button className="button outline small" disabled={busy} onClick={() => void load()}><RefreshCw size={15} />刷新</button></div>
    {error && <p className="account-error" role="alert">{error}</p>}
    <div className="ai-service-routes">
      <div><span>主服务</span><strong>{status ? status.enabled ? status.model : "尚未启用" : "正在读取…"}</strong><button className="button outline small" onClick={onSettings}><PlugZap size={14} />配置主服务</button></div>
      <div><span>备用服务</span><strong>{status ? status.backup.enabled ? status.backup.model : "未配置" : "正在读取…"}</strong><button className="button outline small" disabled={!status?.enabled} onClick={onBackupSettings}><PlugZap size={14} />配置备用服务</button></div>
    </div>
    <div className="ai-service-metrics">{[
      { label: "近期成功率", value: status?.total ? `${Math.round(status.success / status.total * 100)}%` : "—" },
      { label: "平均耗时", value: status?.total ? `${(status.averageMs / 1000).toFixed(1)} 秒` : "—" },
      { label: "自动恢复", value: status ? `${status.recovered} 次` : "—" },
      { label: "备用接管", value: status ? `${status.fallback} 次` : "—" },
    ].map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
    <p className="account-hint">最近 {status?.total ?? 0} 次咨询，最多保留 100 次；每账号每日 {status?.dailyLimit ?? "—"} 次，UTC+8 零点恢复。</p>
    {status?.lastIssue && <div className="account-error" role="status"><strong>最近服务异常 · {new Date(status.lastIssue.at).toLocaleString("zh-CN")}</strong><p>{status.lastIssue.issue}</p><span>{status.lastIssue.ok ? "该次咨询已自动恢复" : "该次咨询未完成"}</span></div>}
    {status && <div className="admin-table-wrap"><table className="ai-service-table"><thead><tr><th>时间</th><th>结果</th><th>模型</th><th>耗时</th><th>调用次数</th></tr></thead><tbody>{status.recent.map((event, i) => <tr key={`${event.at}-${i}`}><td>{new Date(event.at).toLocaleString("zh-CN")}</td><td>{event.ok ? event.fallback ? "备用服务答复" : event.attempts > 1 ? "重试成功" : "成功" : "失败"}</td><td>{event.model}</td><td>{(event.durationMs / 1000).toFixed(1)} 秒</td><td>{event.attempts}</td></tr>)}</tbody></table>{!status.total && <p className="admin-empty">暂无咨询调用记录。</p>}</div>}
  </section>;
}
