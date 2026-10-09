import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Activity,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Heart,
  HeartHandshake,
  LayoutDashboard,
  Menu,
  PlugZap,
  MessageCircle,
  Sprout,
  ShieldCheck,
  Search,
  FlaskConical,
  Type,
  Wrench,
  X,
} from "lucide-react";
import Home from "./components/Home";
import Tools from "./components/Tools";
import AiSettings from "./components/AiSettings";
import SessionGate from "./components/SessionGate";
import AccountPanel from "./components/AccountPanel";
import { api, apiFetch, ApiError, type Account } from "./lib/api";
import { ThemeControl } from "./lib/theme";
import { useAccountWorkspace, type WorkspaceSnapshot } from "./lib/workspace";
import { isInspections, type Inspection } from "./lib/safety";
import { knowledgeSources, retrieveEvidence } from "../shared/knowledge.mjs";
import type { EvidenceSource } from "../shared/knowledge.mjs";
import { getLocalReply } from "./lib/advisor";
import { retryQuestion } from "./lib/consultation";
import { useStoredState } from "./lib/storage";
import type { Message, Page, WorkOrder } from "./types";
import { parseWorkspaceRoute, workspaceHash, type InspectionViewState, type OrdersViewState, type WorkspaceRoute } from "./lib/navigation";
import type { RecordPeriod } from "./lib/operations";
import { DeploymentProvider, useDeployment } from "./lib/deployment";
import { emptyRepairDraft, type RepairDraft } from "./lib/repair";
import { useSchoolOrders } from "./lib/school-orders";
import { mergeSchoolOrders } from "./lib/orders";
import "./phase-one.css";

const Chat = lazy(() => import("./components/Chat"));
const Repair = lazy(() => import("./components/Repair"));
const Orders = lazy(() => import("./components/Orders"));
const Library = lazy(() => import("./components/Library"));
const Operations = lazy(() => import("./components/Operations"));
const Safety = lazy(() => import("./components/Safety"));
const Knowledge = lazy(() => import("./components/Knowledge"));
const Research = lazy(() => import("./components/Research"));
const Admin = lazy(() => import("./components/Admin"));

const navItems = [
  { id: "home", label: "工作总览", icon: LayoutDashboard },
  { id: "operations", label: "运行看板", icon: Activity },
  { id: "safety", label: "安全巡检", icon: ShieldCheck },
  { id: "chat", label: "智能咨询", icon: MessageCircle },
  { id: "repair", label: "后勤报修", icon: Wrench },
  { id: "library", label: "权益资料库", icon: BookOpen },
  { id: "orders", label: "我的工单", icon: ClipboardList },
  { id: "knowledge", label: "循证检索", icon: Search },
  { id: "research", label: "方法与文献", icon: FlaskConical },
  { id: "admin", label: "管理控制台", icon: ShieldCheck },
] as const;
const navGroups: { label: string; pages: Page[] }[] = [
  { label: "工作台", pages: ["home", "operations"] },
  { label: "业务办理", pages: ["repair", "orders", "safety"] },
  { label: "咨询与资料", pages: ["chat", "knowledge", "library"] },
  { label: "管理", pages: ["admin"] },
];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isEvidenceSources = (value: unknown): value is EvidenceSource[] =>
  Array.isArray(value) && value.length <= 10 && value.every((item) =>
    isRecord(item) && ["id", "title", "source", "url", "excerpt", "applicability"].every((key) => typeof item[key] === "string") &&
    knowledgeSources.some((source) => source.id === item.id && source.url === item.url),
  );
const isMessages = (value: unknown): value is Message[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(
    (item) =>
      isRecord(item) &&
      typeof item.id === "string" &&
      ["user", "assistant"].includes(String(item.role)) &&
      typeof item.content === "string" &&
      (item.sources === undefined || isEvidenceSources(item.sources)),
  );
const isOrders = (value: unknown): value is WorkOrder[] =>
  Array.isArray(value) &&
  value.length <= 1000 &&
  value.every(
    (item) =>
      isRecord(item) &&
      [
        "id",
        "category",
        "location",
        "description",
        "safety",
        "createdAt",
      ].every((key) => typeof item[key] === "string") &&
      Number.isFinite(Date.parse(String(item.createdAt))) &&
      ["普通", "紧急", "特急"].includes(String(item.priority)) &&
      ["draft", "submitted", "resolved"].includes(String(item.status)) &&
      Array.isArray(item.history) &&
      item.history.every(
        (entry: unknown) =>
          isRecord(entry) &&
          ["draft", "submitted", "resolved"].includes(String(entry.status)) &&
          typeof entry.at === "string" &&
          Number.isFinite(Date.parse(entry.at)),
      ),
  );
const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
export default function App() {
  return <DeploymentProvider><SessionGate>{(user, initial, exit) => <WorkspaceApp key={user.id} user={user} initial={initial} onExit={exit} />}</SessionGate></DeploymentProvider>;
}

function WorkspaceApp({ user, initial, onExit }: { user: Account; initial: WorkspaceSnapshot; onExit: () => void }) {
  const readRoute = () => parseWorkspaceRoute(window.location.hash, user.role);
  const [route, setRoute] = useState<WorkspaceRoute>(readRoute);
  const page = route.page;
  const deployment = useDeployment();
  const [ordersView, setOrdersView] = useState<OrdersViewState>({ search: "", filter: "all", priority: "all", layout: "list" });
  const [inspectionView, setInspectionView] = useState<InspectionViewState>({ search: "", filter: "all" });
  const [operationsPeriod, setOperationsPeriod] = useState<RecordPeriod>("30");
  const [repairDraft, setRepairDraft] = useState<RepairDraft>(emptyRepairDraft);
  const appliedFilter = useRef("");
  const editedViews = useRef({ orders: false, safety: false });
  const [accountOpen, setAccountOpen] = useState(false);
  const workspace = useAccountWorkspace(initial);
  const { messages, orders: personalOrders, inspections } = workspace.data;
  const schoolOrders = useSchoolOrders();
  const orders = mergeSchoolOrders(personalOrders, schoolOrders.orders, schoolOrders.deletedIds);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const deletingOrderRef = useRef(false);
  const accountLeaving = useRef(false);
  const accountMounted = useRef(false);
  useEffect(() => { accountMounted.current = true; return () => { accountMounted.current = false; }; }, []);
  const setMessages = (next: Message[] | ((previous: Message[]) => Message[])) => workspace.update("messages", next);
  const setOrders = (next: WorkOrder[] | ((previous: WorkOrder[]) => WorkOrder[])) => workspace.update("orders", next);
  const setInspections = (next: Inspection[] | ((previous: Inspection[]) => Inspection[])) => workspace.update("inspections", next);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [mode, setMode] = useState<"local" | "ai">("local");
  const [aiModel, setAiModel] = useState("");
  const [aiSettingsTarget, setAiSettingsTarget] = useState<"primary" | "backup">("primary");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(
    () => user.role === "admin" && new URLSearchParams(window.location.search).get("setup") === "ai",
  );
  const [largeType, setLargeType] = useStoredState<boolean>(
    `guardian:${user.id}:large-type:v1`,
    false,
    isBoolean,
  );
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const busyRef = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const draftCount = orders.filter((order) => order.status === "draft").length;
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
    if (document.hidden) return;
    apiFetch("/api/health", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mode === "ai" || data?.mode === "local") {
          setMode(data.mode);
          setAiModel(data.model || "");
        }
      })
      .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    const changed = () => {
      const next = readRoute();
      setRoute(next);
      const visited = window.history.state?.guardianRoute === workspaceHash(next);
      applyRouteFilter(next, !visited);
      rememberRoute(next);
      setMenuOpen(false);
      window.scrollTo({ top: 0 });
    };
    applyRouteFilter(readRoute());
    rememberRoute(readRoute());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("large-type", largeType);
  }, [largeType]);
  useEffect(() => {
    document.title = `${navItems.find((item) => item.id === page)?.label} · 校园智护`;
  }, [page]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = Array.from(
      sidebar?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href]",
      ) ?? [],
    ).filter((element) => getComputedStyle(element).display !== "none");
    controls[0]?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key === "Tab" && controls.length) {
        if (event.shiftKey && document.activeElement === controls[0]) {
          event.preventDefault();
          controls.at(-1)?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === controls.at(-1)
        ) {
          event.preventDefault();
          controls[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [menuOpen]);
  const notify = (value: string) => {
    setToast(value);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4200);
  };
  const openAiSettings = () => {
    if (user.role === "admin") { setAiSettingsTarget("primary"); setAiSettingsOpen(true); }
    else notify("AI 服务由管理员统一配置，请联系管理员启用或检查连接。");
  };
  const signOut = async () => {
    if (busyRef.current) { notify("请等本次答复完成后退出，确保咨询记录完整保存。"); return; }
    if (deletingOrderRef.current) { notify("请等工单删除完成后退出，确保记录保存到当前账号。"); return; }
    if (accountLeaving.current) return;
    accountLeaving.current = true;
    try {
      if (!(await workspace.flush())) { notify("还有记录未同步，请先导出备份或重试保存。"); return; }
      await api("/api/auth/logout", {}); onExit();
    }
    catch (e) { if (e instanceof ApiError && e.status === 401) onExit(); else notify("退出失败，请检查本机服务后重试。"); }
    finally { accountLeaving.current = false; }
  };
  const importLegacy = () => {
    try {
      const oldMessages: unknown = JSON.parse(localStorage.getItem("guardian:messages:v1") ?? "[]");
      const oldOrders: unknown = JSON.parse(localStorage.getItem("guardian:orders:v1") ?? "[]");
      const oldInspections: unknown = JSON.parse(localStorage.getItem("guardian:inspections:v1") ?? "[]");
      if (!isMessages(oldMessages) || !isOrders(oldOrders) || !isInspections(oldInspections)) throw new Error("旧版记录格式不完整，请先导出或核对原始数据。");
      if (!oldMessages.length && !oldOrders.length && !oldInspections.length) { notify("此浏览器没有可导入的旧版记录。"); return; }
      const merge = <T extends { id: string }>(current: T[], legacy: T[]) => [...new Map([...legacy, ...current].map((item) => [item.id, item])).values()];
      const next = { messages: merge(messages, oldMessages), orders: merge(personalOrders, oldOrders), inspections: merge(inspections, oldInspections) };
      if (!isMessages(next.messages) || !isOrders(next.orders) || !isInspections(next.inspections)) throw new Error("合并后记录超出容量，请先归档部分记录。");
      setMessages(next.messages); setOrders(next.orders); setInspections(next.inspections);
      notify("旧版记录已加入当前账号，正在同步；原始浏览器记录保留。");
    } catch (e) { notify(e instanceof Error ? e.message : "无法读取旧版记录。"); }
  };
  const applyRouteFilter = (next: WorkspaceRoute, force = false) => {
    const key = `${next.page}:${next.filter ?? ""}`;
    if (!force && appliedFilter.current === key) return;
    appliedFilter.current = key;
    // Old history links must not override filters the user has since edited.
    if ((next.page === "orders" || next.page === "safety") && next.filter) {
      if (!force && editedViews.current[next.page]) return;
      editedViews.current[next.page] = false;
    }
    if (next.page === "orders" && next.filter) {
      setOrdersView((previous) => ({ ...previous, search: "", filter: next.filter === "urgent" ? "open" : next.filter as OrdersViewState["filter"], priority: next.filter === "urgent" ? "urgent" : "all" }));
    }
    if (next.page === "safety" && next.filter) {
      setInspectionView((previous) => ({ ...previous, search: "", filter: next.filter as InspectionViewState["filter"] }));
    }
  };
  const rememberRoute = (next: WorkspaceRoute) => {
    window.history.replaceState({ ...window.history.state, guardianRoute: workspaceHash(next) }, "");
  };
  const navigate = (next: Page, options: { recordId?: string; filter?: string } = {}) => {
    if (next === "admin" && user.role !== "admin") return;
    const nextRoute = parseWorkspaceRoute(workspaceHash({ page: next, ...options }), user.role);
    setRoute(nextRoute);
    applyRouteFilter(nextRoute, true);
    window.location.hash = workspaceHash(nextRoute);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openRecord = (type: "order" | "inspection", id: string) => navigate(type === "order" ? "orders" : "safety", { recordId: id });
  const selectRecord = (id: string | null) => {
    const next = { ...route, recordId: id ?? undefined, filter: undefined };
    setRoute(next);
    window.location.hash = workspaceHash(next);
  };
  const clearRouteFilter = () => {
    if (!route.filter) return;
    const next = { ...route, filter: undefined };
    setRoute(next);
    appliedFilter.current = `${next.page}:`;
    window.history.replaceState({ ...window.history.state, guardianRoute: workspaceHash(next) }, "", workspaceHash(next));
  };
  const changeOrdersView = (next: OrdersViewState) => {
    editedViews.current.orders = true;
    setOrdersView(next);
    clearRouteFilter();
  };
  const changeInspectionView = (next: InspectionViewState) => {
    editedViews.current.safety = true;
    setInspectionView(next);
    clearRouteFilter();
  };
  const ask = async (input: string, identity?: Message["identity"], retryId?: string) => {
    const retry = retryId ? retryQuestion(messages, retryId) : null;
    if (retryId && !retry) return;
    const text = input.trim().slice(0, 2100);
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    navigate("chat");
    const identityLabels = {
      worker: "后勤劳动者",
      student: "勤工助学学生",
      other: "其他，具体用工关系待核实",
    };
    const contentWithIdentity = (message: {
      content: string;
      identity?: Message["identity"];
    }) =>
      message.identity
        ? `【当前自选身份：${identityLabels[message.identity]}】\n${message.content}`
        : message.content;
    const preceding = retry?.history ?? messages;
    const history = preceding
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content }));
    const aiHistory = preceding
      .filter((message) => message.mode !== "error")
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: contentWithIdentity(message).slice(0, 2500),
      }));
    const userMessage: Message = retry?.question ?? {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      identity,
    };
    setMessages((previous) => retryId ? previous.filter(message => message.id !== retryId) : [...previous, userMessage].slice(-80));
    const local = getLocalReply(text, history, identity);
    let answer = local.text;
    let answerMode: Message["mode"] = "local";
    let sources = retrieveEvidence(text);
    let replyModel = aiModel;
    let errorCode: number | undefined;
    try {
      if (mode === "ai") {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 50000);
        try {
          const response = await apiFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                ...aiHistory,
                { role: "user", content: contentWithIdentity(userMessage) },
              ],
            }),
            signal: controller.signal,
          });
          const data: unknown = await response.json().catch(() => null);
          if (!response.ok)
            throw new ApiError(
              isRecord(data) && typeof data.error === "string"
                ? data.error
                : "AI 服务暂不可用，请检查连接设置。",
              response.status,
            );
          if (
            !isRecord(data) ||
            typeof data.text !== "string" ||
            !data.text.trim()
          )
            throw new Error("Invalid response");
          answer = data.text.slice(0, 40000);
          if (typeof data.model === "string") replyModel = data.model;
          sources = isEvidenceSources(data.sources)
            ? data.sources.map((source) => knowledgeSources.find((known) => known.id === source.id)!).filter(Boolean)
            : [];
          answerMode = "ai";
        } catch (error) {
          answerMode = "error";
          sources = [];
          errorCode = error instanceof ApiError ? error.status : undefined;
          answer = user.role === "admin"
            ? `**本次咨询未完成。**\n\n${controller.signal.aborted ? "模型服务响应超时。" : error instanceof Error && error.message !== "Failed to fetch" ? error.message : "无法连接咨询服务。"}\n\n问题已保留，可重新发送；请在管理控制台查看 AI 服务状态。`
            : error instanceof ApiError && [401, 429].includes(error.status) ? error.message : "智能咨询服务暂时繁忙，问题已保留，请稍后重新发送。";
        } finally {
          window.clearTimeout(timer);
        }
      } else await new Promise((resolve) => window.setTimeout(resolve, 420));
      const reply: Message = {
        id: retryId ?? crypto.randomUUID(),
        role: "assistant",
        content: answer,
        mode: answerMode,
        ...(answerMode === "ai" ? { model: replyModel } : {}),
        ...(errorCode ? { errorCode } : {}),
        topic: local.topic,
        sources,
      };
      setMessages((previous) => [...previous, reply].slice(-80));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };
  const reset = () => {
    if (
      !busyRef.current &&
      window.confirm("开始新对话将清除当前账号的咨询记录。确定继续吗？")
    ) {
      setMessages([]);
      notify("已开始新对话");
    }
  };
  const saveOrder = (order: WorkOrder) => {
    setOrders((previous) => [order, ...previous].slice(0, 1000));
    setRepairDraft(emptyRepairDraft);
    navigate("orders", { recordId: order.id });
    notify("报修草稿已保存，请核对后点击“提交给学校”");
  };
  const actOnOrder = async (id: string, action: "submit" | "confirm" | "reopen", note?: string) => {
    if (deletingOrderRef.current || accountLeaving.current) return false;
    try {
      if (action === "submit") {
        if (!(await workspace.flush())) { notify("草稿尚未同步，请重试保存后再提交。"); return false; }
        await schoolOrders.submit(id);
      } else {
        const order = orders.find(item => item.id === id);
        if (!order) return false;
        await schoolOrders.act(order, action, { note });
      }
      notify(action === "submit" ? "工单已提交到学校，等待管理员受理" : action === "confirm" ? "已确认完成，处理记录已保存" : "反馈已发送给校方，工单继续处理");
      return true;
    } catch (e) { notify(e instanceof Error ? e.message : "工单操作失败，请重试。"); return false; }
  };
  const deleteOrder = async (id: string) => {
    if (deletingOrderRef.current || accountLeaving.current || schoolOrders.busy || schoolOrders.loading || schoolOrders.error) return false;
    const order = orders.find(item => item.id === id);
    if (!order) return false;
    deletingOrderRef.current = true; setDeletingOrder(true);
    try {
      if (order.school) await schoolOrders.remove(order);
      if (!accountMounted.current) return false;
      setOrders(previous => previous.filter(item => item.id !== id));
      const synced = await workspace.flush();
      if (!synced && !order.school) {
        setOrders(previous => previous.some(item => item.id === id) ? previous : [order, ...previous]);
        notify("删除尚未保存，请同步账号记录后重试。");
        return false;
      }
      notify(order.school ? "工单已从个人记录删除，校方仍保留处理记录" : "工单已从当前账号删除");
      return true;
    } catch (e) { notify(e instanceof Error ? e.message : "删除失败，请重试。"); return false; }
    finally { deletingOrderRef.current = false; setDeletingOrder(false); }
  };

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到主要内容
      </a>
      {menuOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMenuOpen(false)}
          aria-label="关闭导航菜单"
        />
      )}
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="校园智护，返回首页"
        >
          <span className="brand-mark">
            <Sprout size={29} strokeWidth={1.8} />
          </span>
          <span>
            <strong>
              校园智护<span>GUARDIAN</span>
            </strong>
            <small>让每一份劳动都被守护</small>
          </span>
        </button>
        <button
          className="mobile-menu-close icon-button"
          aria-label="关闭菜单"
          onClick={() => setMenuOpen(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-label">
          <span className="campus-dot" />
          <span>校园服务工作台</span>
          <span className="workspace-pill" title={deployment.description}>{deployment.label}</span>
        </div>
        <nav aria-label="主导航">
          {navGroups.filter((group) => group.label !== "管理" || user.role === "admin").map((group) => <div className="nav-group" key={group.label}>
          <span className="nav-caption">{group.label}</span>
          {group.pages.map((id) => navItems.find((item) => item.id === id)!).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.id === "chat" ? (
                <span className="ai-tag">AI</span>
              ) : item.id === "orders" && draftCount > 0 ? (
                <span className="nav-count">{draftCount}</span>
              ) : page === item.id ? (
                <span className="nav-active-dot" />
              ) : null}
            </button>
          ))}
          </div>)}
        </nav>
        <div className="sidebar-tools">
          <details className="nav-help" open={page === "research" ? true : undefined}>
          <summary>帮助与方法<ChevronDown size={14} /></summary>
          <button className={`nav-item ${page === "research" ? "active" : ""}`} aria-current={page === "research" ? "page" : undefined} onClick={() => navigate("research")}>
            <FlaskConical size={19} strokeWidth={1.7} /><span>方法与文献</span>
          </button>
          <button className="nav-item" onClick={() => setTool("help")}>
            <HeartHandshake size={19} strokeWidth={1.7} />
            <span>求助与联系</span>
            <ArrowUpRight size={14} />
          </button>
          <button className="nav-item" onClick={() => setTool("about")}>
            <CircleHelp size={19} strokeWidth={1.7} />
            <span>认识小护</span>
          </button>
          {user.role === "admin" && <button
            className="nav-item"
            onClick={() => {
              setMenuOpen(false);
              openAiSettings();
            }}
          >
            <PlugZap size={19} strokeWidth={1.7} />
            <span>AI 连接设置</span>
            {mode === "ai" && <span className="nav-active-dot" />}
          </button>}
          </details>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-care">
            <span className="care-overline">
              <Heart size={14} />
              劳动不平凡
            </span>
            <strong>
              守护每一个
              <br />
              认真生活的你。
            </strong>
            <div>
              <span>您的付出，值得被看见</span>
              <Sprout size={33} strokeWidth={1.2} />
            </div>
          </div>
          <button className="visitor" onClick={() => { setMenuOpen(false); setAccountOpen(true); }}>
            <span className="visitor-avatar">{user.name.slice(0, 1)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role === "admin" ? "管理员" : "普通用户"} · {workspace.status}</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航菜单"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>工作台</span>
            <ChevronRight size={13} />
            <strong>{navItems.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <ThemeControl />
            {user.role === "admin" && <button
              className={`ai-connect-button ${mode === "ai" ? "connected" : ""}`}
              onClick={openAiSettings}
              aria-label="打开 AI 连接设置"
            >
              <PlugZap size={15} />
              {mode === "ai" ? "AI 已启用" : "连接 AI"}
            </button>}
            <span className="header-separator" />
            <button
              className={`type-toggle ${largeType ? "on" : ""}`}
              onClick={() => setLargeType((previous) => !previous)}
              aria-pressed={largeType}
              aria-label="切换大字模式"
            >
              <Type size={18} />
              <span>大字模式</span>
            </button>
            <button
              className="notification-button icon-button"
              aria-label="查看服务提醒"
              onClick={() => setTool("notifications")}
            >
              <Bell size={19} />
              {draftCount > 0 && <span />}
            </button>
            <button className="header-avatar" aria-label="打开我的账号" onClick={() => setAccountOpen(true)}>{user.name.slice(0, 1)}</button>
          </div>
        </header>
        <main
          id="main-content"
          className={`main-content ${page === "chat" ? "chat-main" : ""}`}
          tabIndex={-1}
        >
          {workspace.error && (
            <div className="storage-warning" role="alert">
              <p>{workspace.error}</p><div className="sync-actions"><button onClick={() => void workspace.flush()}>重试保存</button><button onClick={() => workspace.download(orders)}>导出本页备份</button><button onClick={() => { if (window.confirm("重新载入将丢弃本页未保存修改。请先导出备份。确定继续？")) window.location.reload(); }}>重新载入 / 登录</button></div>
            </div>
          )}
          <Suspense fallback={<div className="page-loading" role="status">正在载入工作区…</div>}>
          {page === "home" && (
            <Home
              navigate={navigate}
              ask={(value) => void ask(value)}
              openTool={setTool}
              orders={orders}
              inspections={inspections}
              openRecord={openRecord}
            />
          )}
          {page === "operations" && <Operations orders={orders} inspections={inspections} navigate={navigate} openRecord={openRecord} period={operationsPeriod} onPeriodChange={setOperationsPeriod} />}
          {page === "safety" && <Safety inspections={inspections} onChange={setInspections} notify={notify} selectedId={route.recordId ?? null} onSelect={selectRecord} view={inspectionView} onViewChange={changeInspectionView} />}
          {page === "knowledge" && <Knowledge ask={(value) => void ask(value)} />}
          {page === "research" && <Research navigate={navigate} notify={notify} />}
          {page === "admin" && user.role === "admin" && <Admin onAiSettings={openAiSettings} onBackupSettings={() => { setAiSettingsTarget("backup"); setAiSettingsOpen(true); }} />}
          {page === "chat" && (
            <Chat
              admin={user.role === "admin"}
              onRetry={(errorId) => { const retry = retryQuestion(messages, errorId); if (retry) void ask(retry.question.content, retry.question.identity, errorId); }}
              onHelp={() => setTool("help")}
              messages={messages}
              loading={loading}
              mode={mode}
              model={aiModel}
              onAiSettings={openAiSettings}
              ask={(value, identity) => void ask(value, identity)}
              reset={reset}
              onRepair={() => navigate("repair")}
            />
          )}
          {page === "repair" && (
            <Repair draft={repairDraft} onDraftChange={setRepairDraft} onSave={saveOrder} onOrders={() => navigate("orders")} />
          )}
          {page === "orders" && (
            <Orders
              orders={orders}
              selectedId={route.recordId ?? null}
              onSelect={selectRecord}
              view={ordersView}
              onViewChange={changeOrdersView}
              onAction={actOnOrder}
              busy={schoolOrders.busy || deletingOrder}
              loading={schoolOrders.loading}
              error={schoolOrders.error}
              onRefresh={() => void schoolOrders.refresh()}
              onDelete={deleteOrder}
              onCreate={() => navigate("repair")}
              notify={notify}
            />
          )}
          {page === "library" && <Library ask={(value) => void ask(value)} />}
          </Suspense>
        </main>
        <footer className="site-footer">
          <span>
            <Sprout size={14} />
            科技有温度，劳动有尊严。
          </span>
          <div>
            <span>校园后勤保障与劳动权益智能管家</span>
            <i>·</i>
            <button onClick={() => setTool("privacy")}>隐私与数据</button>
          </div>
          <p>校园服务场景演示 · 非校方官方服务渠道</p>
        </footer>
      </div>
      {accountOpen && <AccountPanel user={user} onClose={() => setAccountOpen(false)} signOut={signOut} importLegacy={importLegacy} download={() => workspace.download(orders)} notify={notify} />}
      {aiSettingsOpen && user.role === "admin" && (
        <AiSettings
          key={aiSettingsTarget}
          target={aiSettingsTarget}
          onClose={() => {
            setAiSettingsOpen(false);
            const url = new URL(window.location.href);
            url.searchParams.delete("setup");
            window.history.replaceState(null, "", url);
          }}
          onChange={(nextMode, model) => {
            setMode(nextMode);
            setAiModel(model);
          }}
        />
      )}
      {tool && !aiSettingsOpen && (
        <Tools
          key={tool}
          tool={tool}
          onClose={() => setTool(null)}
          notify={notify}
          draftCount={draftCount}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button onClick={() => setToast("")} aria-label="关闭提示">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
