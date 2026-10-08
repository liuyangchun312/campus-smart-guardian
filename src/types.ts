import type { EvidenceSource } from "../shared/knowledge.mjs";

export type Page = "home" | "chat" | "repair" | "library" | "orders" | "operations" | "safety" | "knowledge" | "research" | "admin";
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: "local" | "ai" | "fallback" | "error";
  model?: string;
  topic?: "rights" | "repair" | "safety" | "general";
  identity?: "worker" | "student" | "other";
  sources?: EvidenceSource[];
};
export type OrderStatus = "draft" | "submitted" | "accepted" | "processing" | "awaiting_confirmation" | "resolved";
export type SchoolOrderAction = "accept" | "start" | "complete" | "confirm" | "reopen";
export type WorkOrder = {
  id: string;
  category: string;
  location: string;
  description: string;
  priority: "普通" | "紧急" | "特急";
  safety: string;
  status: OrderStatus;
  createdAt: string;
  school?: { ownerId: string; ownerName: string; ownerUsername: string; submittedAt: string; revision: number; assignee: string };
  history: { status: OrderStatus; at: string; actorName?: string; actorRole?: "user" | "admin"; note?: string }[];
};
export type Article = {
  id: string;
  title: string;
  category: "劳动权益" | "勤工助学" | "劳动安全";
  tag: string;
  description: string;
  content: string;
  source: string;
  url: string;
};
