import type { ParsedPrd } from "./parser.js";

export type UnknownImpact = "low" | "medium" | "high";

export interface UnknownItem {
  category: string;
  impact: UnknownImpact;
  assumption: string;
  question: string;
}

const DETECTORS: Array<{ category: string; keywords: string[]; question: string; assumption: string; impact: UnknownImpact }> = [
  {
    category: "auth",
    keywords: ["auth", "login", "signin", "oauth", "mfa"],
    question: "Auth strategy nedir (passwordless, oauth, mfa)?",
    assumption: "Email+password + optional MFA",
    impact: "high",
  },
  {
    category: "rbac",
    keywords: ["role", "rbac", "permission"],
    question: "Rol seti ve izin sinirlari nasil olacak?",
    assumption: "admin/editor/viewer",
    impact: "high",
  },
  {
    category: "retention_pii",
    keywords: ["retention", "pii", "gdpr", "privacy"],
    question: "PII ve retention policy ne olacak?",
    assumption: "PII minimize + 30 day audit retention",
    impact: "medium",
  },
  {
    category: "billing",
    keywords: ["billing", "payment", "subscription", "invoice", "pricing"],
    question: "Billing modeli ve odeme saglayicisi nedir?",
    assumption: "No billing in MVP; add usage-ready abstraction",
    impact: "medium",
  },
  {
    category: "realtime",
    keywords: ["realtime", "real-time", "websocket", "socket", "event stream", "push"],
    question: "Realtime ihtiyaci var mi? Varsa kanal ve SLA nedir?",
    assumption: "Polling-first, realtime optional in next phase",
    impact: "medium",
  },
  {
    category: "deploy_target",
    keywords: ["deploy", "hosting", "infra", "cloud"],
    question: "Hedef deploy ortami nedir?",
    assumption: "local-first with cloud-ready packaging",
    impact: "medium",
  },
  {
    category: "test_strategy",
    keywords: ["test", "qa", "coverage"],
    question: "Kritik acceptance test kapsami nedir?",
    assumption: "unit+integration+contract minimum",
    impact: "high",
  },
];

export function detectUnknowns(prd: ParsedPrd): UnknownItem[] {
  const text = prd.raw.toLowerCase();

  return DETECTORS.filter((detector) => !detector.keywords.some((kw) => text.includes(kw))).map((detector) => ({
    category: detector.category,
    impact: detector.impact,
    question: detector.question,
    assumption: detector.assumption,
  }));
}

export function interviewCandidates(unknowns: UnknownItem[]): UnknownItem[] {
  return unknowns.filter((item) => item.impact === "high" || item.impact === "medium");
}
