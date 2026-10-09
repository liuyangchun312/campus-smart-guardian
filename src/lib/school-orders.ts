import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { SchoolOrderAction, WorkOrder } from "../types";
import { sortSchoolOrders } from "./orders";

export function useSchoolOrders(admin = false) {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const generation = useRef(0);
  const mutating = useRef(false);
  const refreshing = useRef(false);
  const endpoint = admin ? "/api/admin/orders" : "/api/orders";
  const refresh = useCallback(async () => {
    if (refreshing.current || mutating.current) return;
    refreshing.current = true;
    const requestGeneration = generation.current;
    try {
      const result = await api<{ orders: WorkOrder[]; deletedIds?: string[] }>(endpoint);
      if (mounted.current && generation.current === requestGeneration) { setOrders(sortSchoolOrders(result.orders)); setDeletedIds(result.deletedIds ?? []); setError(""); }
    } catch (e) {
      if (mounted.current && generation.current === requestGeneration) setError(e instanceof Error ? e.message : "无法读取校方工单，请重试。");
    } finally { refreshing.current = false; if (mounted.current) setLoading(false); }
  }, [endpoint]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const check = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(check, 15000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [refresh]);
  const mutate = async <T,>(path: string, body: unknown, method: string, onSuccess: (result: T) => void) => {
    if (mutating.current) throw new Error("正在保存工单操作，请稍候。");
    mutating.current = true; generation.current++; setBusy(true); setError("");
    try {
      const result = await api<T>(path, body, method);
      if (mounted.current) onSuccess(result);
      return result;
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "工单操作失败，请重试。");
      throw e;
    } finally { mutating.current = false; if (mounted.current) setBusy(false); }
  };
  const save = async (path: string, body: unknown, method: string) => {
    const result = await mutate<{ order: WorkOrder }>(path, body, method, ({ order }) => {
      setOrders(previous => sortSchoolOrders([order, ...previous.filter(item => !(item.id === order.id && item.school?.ownerId === order.school?.ownerId))]));
    });
    return result.order;
  };
  const submit = (id: string) => save("/api/orders", { id }, "POST");
  const act = (order: WorkOrder, action: SchoolOrderAction, values: { note?: string; assignee?: string } = {}) => {
    if (!order.school) throw new Error("此工单尚未提交给学校。");
    const path = admin ? `/api/admin/orders/${encodeURIComponent(order.school.ownerId)}/${encodeURIComponent(order.id)}` : `/api/orders/${encodeURIComponent(order.id)}`;
    return save(path, { action, revision: order.school.revision, ...values }, "PATCH");
  };
  const remove = (order: WorkOrder) => {
    if (admin || !order.school) throw new Error("只能删除当前账号已提交的工单。");
    return mutate<{ deletedId: string }>(`/api/orders/${encodeURIComponent(order.id)}`, { revision: order.school.revision }, "DELETE", ({ deletedId }) => {
      setOrders(previous => previous.filter(item => item.id !== deletedId));
      setDeletedIds(previous => [...new Set([...previous, deletedId])]);
    });
  };
  return { orders, deletedIds, loading, busy, error, refresh, submit, act, remove };
}
