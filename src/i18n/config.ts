import type { Locale } from "./translations";
import type { Agent } from "../lib/domain";

export const roleLabels: Record<Locale, Record<Agent["role"], string>> = {
  en: {
    principal_architect: "Principal Architect",
    sre_reviewer: "SRE Reviewer",
    security_reviewer: "Security Reviewer",
    cost_engineer: "Cost Engineer",
    pragmatic_builder: "Pragmatic Builder"
  },
  zh: {
    principal_architect: "首席架构师",
    sre_reviewer: "SRE 评审",
    security_reviewer: "安全评审",
    cost_engineer: "成本工程师",
    pragmatic_builder: "务实构建者"
  }
};
