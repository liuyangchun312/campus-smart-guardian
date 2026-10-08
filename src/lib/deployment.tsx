import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "./api";

export type Deployment = "local" | "cloud" | "unknown";
type DeploymentContextValue = { deployment: Deployment; label: string; storageLabel: string; description: string };
const contexts: Record<Deployment, DeploymentContextValue> = {
  local: { deployment: "local", label: "本地服务", storageLabel: "本地服务数据库", description: "记录保存在本地服务数据库，提交的报修由本站校方管理员办理。" },
  cloud: { deployment: "cloud", label: "云端服务", storageLabel: "云端数据库", description: "记录保存在云端服务数据库，提交的报修由本站校方管理员办理。" },
  unknown: { deployment: "unknown", label: "服务环境待确认", storageLabel: "账号服务数据库", description: "账号记录由服务端保存，当前尚未确认服务部署环境。" },
};
const DeploymentContext = createContext<DeploymentContextValue>(contexts.unknown);

export function DeploymentProvider({ children }: { children: ReactNode }) {
  const [deployment, setDeployment] = useState<Deployment>("unknown");
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/health", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const health: { deployment?: unknown } = await response.json();
      if (!controller.signal.aborted && (health.deployment === "local" || health.deployment === "cloud")) setDeployment(health.deployment);
    }).catch(() => { /* Keep the neutral context while health is unavailable. */ });
    return () => controller.abort();
  }, []);
  return <DeploymentContext.Provider value={contexts[deployment]}>{children}</DeploymentContext.Provider>;
}

export function useDeployment() { return useContext(DeploymentContext); }
