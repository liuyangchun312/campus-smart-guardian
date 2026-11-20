import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Message, WorkOrder } from "../types";
import type { Inspection } from "./safety";
export type WorkspaceData = { messages: Message[]; orders: WorkOrder[]; inspections: Inspection[] };
export type WorkspaceSnapshot = { data: WorkspaceData; revision: number };
type Update<T> = T | ((previous: T) => T);

export function useAccountWorkspace(initial: WorkspaceSnapshot) {
  const [data, setData] = useState(initial.data);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState("已同步");
  const [error, setError] = useState("");
  const latest = useRef(initial.data);
  const revision = useRef(initial.revision);
  const changed = useRef(0);
  const saved = useRef(0);
  const running = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const change = useCallback((transform: (current: WorkspaceData) => WorkspaceData) => {
    const next = transform(latest.current);
    if (next === latest.current) return next;
    latest.current = next;
    changed.current++; setData(latest.current); setVersion(changed.current); setStatus("待同步");
    return next;
  }, []);
  const update = useCallback(<K extends keyof WorkspaceData>(key: K, value: Update<WorkspaceData[K]>) => {
    change(current => ({ ...current, [key]: typeof value === "function" ? value(current[key]) : value }));
  }, [change]);
  const flush = useCallback(async (): Promise<boolean> => {
    if (running.current) return running.current;
    if (saved.current === changed.current) return true;
    running.current = (async () => {
      try {
        while (saved.current < changed.current) {
          const sending = changed.current;
          setStatus("同步中");
          const result = await api<{ revision: number }>("/api/workspace", { data: latest.current, revision: revision.current }, "PUT");
          revision.current = result.revision; saved.current = sending;
        }
        if (mounted.current) { setError(""); setStatus("已同步"); }
        return true;
      } catch (e) {
        if (mounted.current) { setError(e instanceof Error ? e.message : "记录暂未保存，请重试。"); setStatus("未同步"); }
        return false;
      } finally { running.current = null; }
    })();
    return running.current;
  }, []);
  useEffect(() => {
    if (!version) return;
    const timer = window.setTimeout(() => void flush(), 350);
    return () => window.clearTimeout(timer);
  }, [version, flush]);
  // Another tab (or a response lost after commit) may already have saved the same operation.
  // Only adopt its snapshot when the caller flushed beforehand and no newer local edit would be lost.
  const recoverSaved = async (expected: WorkspaceData, matches: (data: WorkspaceData) => boolean) => {
    try {
      const snapshot = await api<WorkspaceSnapshot>("/api/workspace");
      if (!mounted.current || latest.current !== expected || running.current || !matches(snapshot.data)) return null;
      latest.current = snapshot.data;
      revision.current = snapshot.revision;
      saved.current = changed.current;
      setData(snapshot.data); setError(""); setStatus("已同步");
      return snapshot.data;
    } catch { return null; }
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (changed.current !== saved.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const download = (orders: WorkOrder[] = latest.current.orders) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...latest.current, orders }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "校园智护-工作记录备份.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return { data, update, change, status, error, flush, recoverSaved, download };
}
