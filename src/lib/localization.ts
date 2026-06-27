export type SupportedLocale = "en" | "zh";

const zhDecisionPhrases: Array<[string, string]> = [
  [
    "Use PostgreSQL shared tables with tenant_id for the MVP, enforce tenant-aware repositories, and keep a documented path to schema-level isolation for enterprise tenants.",
    "MVP 阶段使用 PostgreSQL 共享表加 tenant_id，强制通过租户感知的数据访问层读写，并为企业客户保留迁移到 schema 级隔离的书面路径。"
  ],
  [
    "Use schema-per-tenant for regulated or high-value tenants, but keep the MVP control plane and shared metadata simple.",
    "对受监管或高价值租户可使用 schema-per-tenant，但 MVP 的控制面和共享元数据应保持简单。"
  ],
  [
    "Avoid database-per-tenant or service-per-tenant at launch unless a signed enterprise requirement justifies the operational load.",
    "除非已有明确签约企业需求能证明运维成本合理，否则上线初期不要采用 database-per-tenant 或 service-per-tenant。"
  ],
  [
    "The revised plan adds explicit tenant-boundary tests, per-tenant metrics, and a written isolation upgrade trigger.",
    "修正后的方案增加了明确的租户边界测试、单租户指标和书面的隔离升级触发条件。"
  ],
  [
    "Do not split the current Node.js backend into full microservices yet.",
    "暂时不要把当前 Node.js 后端全面拆成微服务。"
  ],
  [
    "Keep the Node.js backend as a modular monolith with service extraction triggers",
    "保持 Node.js 后端为带拆分触发条件的模块化单体"
  ],
  [
    "For a 5-person team focused on shipping enterprise features in the next six months, keep one deployable modular monolith, enforce clear domain modules, add service-ready interfaces around the highest-change areas, and define measurable extraction triggers.",
    "对于未来 6 个月主要交付企业客户功能的 5 人团队，建议保持一个可部署的模块化单体，明确领域模块，在变化最高的区域加上可拆分接口，并定义可量化的服务拆分触发条件。"
  ],
  [
    "Extract only a narrow service later when a domain has independent scaling, release cadence, compliance boundary, or a dedicated owner.",
    "只有当某个领域出现独立扩缩容、独立发布节奏、合规边界或专门负责人时，再小范围抽取服务。"
  ],
  [
    "Avoid a broad microservice migration now because it would add CI/CD, observability, data consistency, incident response, and API-contract work before the team has enough capacity to operate it.",
    "现在避免大规模微服务迁移，因为它会在团队具备运维能力前引入 CI/CD、可观测性、数据一致性、事故响应和 API 契约成本。"
  ],
  [
    "The revised plan adds CI-enforced module boundaries, ownership rules, observability for extraction signals, and a written service-extraction trigger.",
    "修正后的方案增加了 CI 强制模块边界、责任归属规则、拆分信号观测和书面的服务拆分触发条件。"
  ],
  ["The team has about 5 engineers.", "团队大约 5 名工程师。"],
  ["The next six months prioritize fast enterprise feature delivery.", "未来 6 个月优先快速交付企业客户功能。"],
  ["The current monolith can still be refactored without a rewrite.", "当前单体仍可通过重构演进，不需要重写。"],
  [
    "Can we validate that modularizing the current backend preserves delivery speed better than a service split?",
    "能否验证：把当前后端模块化，比拆成服务更能保持交付速度？"
  ],
  [
    "Run a two-week modularization spike and measure delivery throughput, test friction, and operational complexity.",
    "运行一个为期两周的模块化 spike，衡量交付吞吐、测试摩擦和运维复杂度。"
  ],
  [
    "Next six months: one main Node.js backend supporting enterprise customer workflows.",
    "未来 6 个月：一个主 Node.js 后端支撑企业客户工作流。"
  ],
  [
    "Small full-stack Node.js team of 5 engineers focused on fast enterprise feature delivery.",
    "5 人 Node.js 全栈小团队，重点是快速交付企业功能。"
  ],
  [
    "The current monolith can still be modularized without a rewrite.",
    "当前单体仍可在不重写的前提下模块化。"
  ],
  [
    "No immediate compliance requirement mandates service-level isolation.",
    "当前没有立即要求服务级隔离的合规要求。"
  ],
  [
    "Independent scaling needs are not yet proven.",
    "独立扩缩容需求尚未被证明。"
  ],
  [
    "Keep enterprise feature delivery moving",
    "保持企业功能交付推进"
  ],
  [
    "Avoid platform work that a 5-person team cannot operate",
    "避免 5 人团队难以运维的平台工程"
  ],
  [
    "Splitting a small-team Node.js backend into services adds distributed debugging, deployment, and contract-management overhead.",
    "小团队把 Node.js 后端拆成多个服务，会增加分布式调试、部署和接口契约管理成本。"
  ],
  [
    "Keep a modular monolith first, isolate bounded contexts in code, and extract only after ownership and scaling pressure are proven.",
    "先保持模块化单体，在代码中隔离边界上下文，只有在责任归属和扩展压力明确后再拆服务。"
  ],
  [
    "Microservice infrastructure can consume the next six months of delivery capacity before customer-facing work ships.",
    "微服务基础设施可能在客户功能交付前消耗未来 6 个月的研发产能。"
  ],
  [
    "Use one deployable with strong module boundaries, CI checks, and explicit extraction triggers.",
    "保持单一部署单元，同时建立清晰模块边界、CI 检查和明确拆分触发条件。"
  ],
  [
    "Network calls, partial failures, and version skew introduce reliability modes the current team may not be staffed to operate.",
    "网络调用、局部失败和版本不一致会引入当前团队未必有能力运维的可靠性问题。"
  ],
  [
    "Add observability and background-job boundaries inside the monolith before introducing independent services.",
    "在引入独立服务前，先在单体内补齐可观测性和后台任务边界。"
  ],
  [
    "Security boundaries do not automatically improve because code is split into services. A small team will get more benefit from explicit authorization checks, ownership boundaries, audit logging, and contract tests inside the existing Node.js backend.",
    "把代码拆成服务并不会自动提升安全边界。对小团队来说，在现有 Node.js 后端内补明确授权检查、责任边界、审计日志和契约测试，收益更直接。"
  ],
  [
    "Microservices multiply deployment units, alerts, dashboards, retries, timeouts, and incident paths. The SRE-safe path is to improve observability and reliability in one runtime before extracting a service.",
    "微服务会成倍增加部署单元、告警、仪表盘、重试、超时和事故路径。更稳妥的 SRE 路径，是先在一个运行时内提升可观测性和可靠性，再抽取服务。"
  ],
  [
    "For a 5-person team, the migration cost of full microservices competes directly with enterprise roadmap delivery. The cheapest reversible move is modularization plus extraction criteria.",
    "对 5 人团队来说，全面微服务迁移成本会直接挤占企业功能路线图。成本最低且可逆的动作，是模块化加明确拆分标准。"
  ],
  [
    "The team needs fewer coordination points, not more. Modularizing the Node.js backend gives most of the design benefit while keeping local development, testing, and release flow fast.",
    "团队现在需要更少协作点，而不是更多。把 Node.js 后端模块化能获得大部分设计收益，同时保持本地开发、测试和发布流程快速。"
  ],
  [
    "The architecture should optimize for the team's actual constraint: fast enterprise feature delivery with only 5 engineers. A modular monolith preserves speed while creating a credible path to microservices if scale or ownership pressure becomes real.",
    "架构应该围绕团队真实约束优化：只有 5 名工程师，还要快速交付企业功能。模块化单体能保留速度，同时在规模或责任边界压力出现时提供可信的微服务演进路径。"
  ],
  ["Lower operational attack surface", "更低的运维攻击面"],
  ["Clearer access-control rollout", "访问控制落地更清晰"],
  ["Security work stays close to product delivery", "安全工作贴近产品交付"],
  ["Simpler incidents", "事故处理更简单"],
  ["Fewer deployment moving parts", "部署活动部件更少"],
  ["Better fit for current staffing", "更适配当前人力"],
  ["Lowest migration cost", "迁移成本最低"],
  ["Preserves roadmap capacity", "保留路线图产能"],
  ["Avoids premature platform investment", "避免过早平台投入"],
  ["Fastest path to product work", "最快回到产品工作"],
  ["Improves code ownership immediately", "立即改善代码责任归属"],
  ["Keeps deployment simple", "保持部署简单"],
  ["Balances delivery speed and future optionality", "平衡交付速度和未来可选性"],
  ["Keeps architecture understandable", "保持架构可理解"],
  ["Creates measurable migration gates", "形成可量化迁移门禁"],
  ["Requires intentional module governance", "需要有意识的模块治理"],
  ["May defer some scaling isolation", "可能推迟部分扩展隔离"],
  ["complianceBoundary", "合规边界"],
  ["Modular monolith", "模块化单体"],
  ["Selective service extraction", "选择性服务拆分"],
  ["Full microservices now", "立即全面微服务化"],
  [
    "Start by separating domains, background jobs, and integration adapters inside the repo before creating network services.",
    "先在仓库内部拆分领域、后台任务和集成适配器，再创建网络服务。"
  ],
  [
    "Responds to cross-agent critique with concrete guardrails",
    "用具体护栏回应跨智能体质询"
  ],
  [
    "It assumes in-process module boundaries and authorization checks will be enforced as rigorously as service boundaries.",
    "它假设进程内模块边界和授权检查能像服务边界一样被严格执行。"
  ],
  [
    "It assumes the current monolith can be modularized faster than a service split can be safely operated.",
    "它假设当前单体模块化的速度，会快于安全运维服务拆分的速度。"
  ],
  [
    "Define explicit triggers for extracting a service from the modular monolith.",
    "定义从模块化单体中抽取服务的明确触发条件。"
  ],
  [
    "Add ownership, dependency, and API-contract rules before any split.",
    "任何拆分前先补责任归属、依赖和 API 契约规则。"
  ],
  ["Add module boundary checks in CI.", "在 CI 中加入模块边界检查。"],
  [
    "Track deployment frequency, incident load, and domain-level scaling pressure.",
    "跟踪部署频率、事故负载和领域级扩展压力。"
  ],
  [
    "Document rollback and service-extraction criteria in the ADR.",
    "在 ADR 中记录回滚和服务抽取标准。"
  ],
  [
    "The team spends the next quarter building CI/CD, tracing, and service contracts instead of enterprise features.",
    "团队下个季度可能会把时间花在 CI/CD、链路追踪和服务契约上，而不是企业功能。"
  ],
  [
    "A service boundary is drawn around the wrong domain, creating cross-service changes for every customer request.",
    "如果服务边界画错，每个客户需求都会变成跨服务修改。"
  ],
  [
    "Partial failures and version skew create incidents the 5-person team cannot comfortably operate.",
    "局部失败和版本不一致会制造 5 人团队难以从容处理的事故。"
  ],
  [
    "The 5-person team keeps one deployable while improving module ownership and dependency boundaries.",
    "5 人团队保留一个部署单元，同时改善模块责任归属和依赖边界。"
  ],
  [
    "Enterprise feature delivery remains the near-term priority instead of a broad platform migration.",
    "近期优先级仍是企业功能交付，而不是大规模平台迁移。"
  ],
  [
    "Microservice extraction remains available later through explicit triggers, metrics, and contract tests.",
    "后续仍可通过明确触发条件、指标和契约测试来抽取微服务。"
  ],
  [
    "Stop service extraction work if delivery throughput drops for two consecutive iterations.",
    "如果连续两个迭代交付吞吐下降，停止服务抽取工作。"
  ],
  [
    "Move any prematurely split capability back behind the monolith interface if incidents or coordination cost rise.",
    "如果事故或协作成本上升，把过早拆出的能力移回单体接口之后。"
  ],
  [
    "Revisit extraction only when one domain has clear ownership, scaling pressure, and independent release needs.",
    "只有当某个领域具备清晰负责人、扩展压力和独立发布需求时，再重新评估拆分。"
  ],
  [
    "Use Conservative reversible path as the default path for now, but treat it as a staged decision with explicit validation gates.",
    "当前默认选择保守且可逆的路径，但把它作为带明确验证关口的阶段性决策。"
  ],
  [
    "Do not commit deeply to Balanced staged path until the team has evidence that the added cost is justified.",
    "在团队拿到额外成本确实合理的证据前，不要深度投入更重的阶段性方案。"
  ],
  [
    "The revised plan adds explicit validation gates, review ownership, rollback signals, and a small spike before deeper commitment.",
    "修正后的方案增加了明确验证关口、评审负责人、回滚信号，并要求在深度投入前先做一个小型 spike。"
  ],
  ["Shared tenancy with strict access guardrails", "带严格访问护栏的共享租户方案"],
  ["Operate one database first, isolate later", "先运营一个数据库，后续再隔离"],
  ["Optimize for learning cost and migration optionality", "优化学习成本和迁移可选性"],
  ["Ship shared tables, test tenant boundaries hard", "先交付共享表，严格测试租户边界"],
  ["Shared core with explicit isolation evolution path", "共享核心加明确隔离演进路径"],
  ["Keep one deployable, harden module and access boundaries", "保持单一部署单元，强化模块和访问边界"],
  ["Stabilize operations before adding distributed systems", "先稳定运维，再引入分布式系统"],
  ["Spend engineering budget on features, not platform split", "把工程预算投入功能，而不是平台拆分"],
  ["Refactor the monolith into clear modules now", "先把单体重构为清晰模块"],
  ["Modular monolith with explicit service extraction triggers", "带明确拆分触发条件的模块化单体"],
  ["Staged architecture decision with validation gates", "带验证关口的阶段性架构决策"],
  ["Choose the option with clear control boundaries", "选择控制边界清晰的方案"],
  ["Prefer the path the team can operate", "优先选择团队能运维的路径"],
  ["Optimize for low regret and learning speed", "优化低后悔值和学习速度"],
  ["Ship the smallest reversible slice", "先交付最小可逆切片"],
  ["Principal Architect", "首席架构师"],
  ["Sre Reviewer", "SRE 评审"],
  ["SRE Reviewer", "SRE 评审"],
  ["Security Reviewer", "安全评审"],
  ["Cost Engineer", "成本工程师"],
  ["Pragmatic Builder", "务实构建者"],
  ["Small full-stack team with strong PostgreSQL experience.", "熟悉 PostgreSQL 的小型全栈团队。"],
  ["Shared tables with tenant_id", "共享表加 tenant_id"],
  ["Schema per tenant", "每租户独立 schema"],
  ["Database per tenant", "每租户独立数据库"],
  ["Fastest to build", "最快交付"],
  ["Best match for team size", "最适配当前团队规模"],
  ["Avoids over-engineering", "避免过度工程化"],
  [
    "The product should not pay microservice or tenant-automation tax before it has customers. Build the narrow path well and make the escape hatch visible.",
    "产品还没有足够客户验证前，不应提前支付微服务或租户自动化的复杂度成本。先把最窄路径做好，并保留清晰的退出通道。"
  ],
  [
    "A tenant boundary bug exposes data because data access helpers were bypassed.",
    "如果绕过租户感知的数据访问层，租户边界漏洞可能导致数据暴露。"
  ],
  [
    "A high-value tenant demands stronger isolation before the migration playbook is ready.",
    "高价值租户可能在迁移手册准备好之前要求更强隔离。"
  ],
  [
    "Noisy tenant growth causes shared indexes and connection pools to degrade.",
    "噪声租户增长可能导致共享索引和连接池退化。"
  ],
  [
    "A missing tenant boundary can expose cross-tenant data.",
    "缺失租户边界可能暴露跨租户数据。"
  ],
  [
    "Centralize tenant-scoped data access and add authorization boundary tests.",
    "集中封装租户范围的数据访问，并加入授权边界测试。"
  ],
  [
    "More isolated tenancy models increase migration, backup, and support operations.",
    "更强隔离的租户模型会增加迁移、备份和支持运维成本。"
  ],
  [
    "Automate tenant lifecycle tasks before moving beyond shared tables.",
    "在超出共享表模式前，先自动化租户生命周期任务。"
  ],
  [
    "Noisy tenants can stress shared indexes and connection pools.",
    "噪声租户会给共享索引和连接池带来压力。"
  ],
  [
    "Track per-tenant usage and add partitioning or premium isolation when needed.",
    "跟踪单租户用量，并在需要时加入分区或高级隔离。"
  ],
  ["strictSecurity", "严格安全要求"],
  ["budgetPressure", "预算压力"],
  ["teamTurnover", "团队人员变动"],
  ["scaleSpike", "规模突增"],
  ["securityIncident", "安全事件"],
  ["enterpriseFeatureRush", "企业功能交付冲刺"],
  ["trafficSpike", "流量突增"],
  ["Proposal Round", "提案轮"],
  ["Blind Review", "匿名评审"],
  ["Cross-Examination", "交叉质询"],
  ["Revision Round", "修订轮"],
  ["Consensus Engine", "共识引擎"],
  ["Final Verdict", "最终裁决"],
  [
    "Agents independently generated candidate decision paths before seeing peer arguments.",
    "智能体在看到同伴论点前独立生成候选决策路径。"
  ],
  [
    "Proposal authorship was hidden so reviewers evaluated Proposal A/B/C-style content instead of model identity.",
    "提案作者身份被隐藏，评审只基于 Proposal A/B/C 的内容进行判断。"
  ],
  [
    "Agents challenged assumptions, hidden risks, and missing considerations in rival proposals.",
    "智能体质询了其他方案中的假设、隐藏风险和遗漏因素。"
  ],
  [
    "Each proposal was revised after absorbing the strongest cross-agent objections.",
    "每个方案都吸收了最强的跨智能体反对意见后进行修订。"
  ],
  [
    "Borda ranking, Bayesian vote weights, weighted utility, dissent, and regret were aggregated into a final score.",
    "系统把 Borda 排序、贝叶斯投票权重、加权效用、分歧和后悔值聚合为最终得分。"
  ],
  [
    "The decision room selected pragmatic-builder-proposal-revised and generated an ADR-ready recommendation.",
    "决策室选择了务实构建者修订方案，并生成可写入 ADR 的建议。"
  ],
  [
    "The decision room selected principal-architect-proposal-revised and generated an ADR-ready recommendation.",
    "决策室选择了首席架构师修订方案，并生成可写入 ADR 的建议。"
  ],
  [
    "The decision room selected sre-reviewer-proposal-revised and generated an ADR-ready recommendation.",
    "决策室选择了 SRE 评审修订方案，并生成可写入 ADR 的建议。"
  ],
  [
    "The decision room selected security-reviewer-proposal-revised and generated an ADR-ready recommendation.",
    "决策室选择了安全评审修订方案，并生成可写入 ADR 的建议。"
  ],
  [
    "The decision room selected cost-engineer-proposal-revised and generated an ADR-ready recommendation.",
    "决策室选择了成本工程师修订方案，并生成可写入 ADR 的建议。"
  ],
  ["No hard regulatory tenant isolation requirement at launch", "上线初期没有强监管租户隔离要求"],
  [
    "Can we confirm the launch requirements do not mandate stronger isolation?",
    "能否确认上线要求没有强制更强隔离？"
  ],
  [
    "Review launch requirements with product and legal before implementation.",
    "实施前与产品和法务复核上线要求。"
  ],
  ["Security-first", "安全优先"],
  ["Speed-first", "速度优先"],
  ["Cost-first", "成本优先"],
  ["Reliability-first", "可靠性优先"],
  ["winner stable", "赢家稳定"],
  ["stable winner rate", "赢家稳定率"],
  ["accepted", "已接受"],
  ["(complete, open)", "(已完成, 公开)"],
  ["(complete, blind)", "(已完成, 匿名)"],
  ["(complete, n/a)", "(已完成, 不适用)"],
  ["Status", "状态"],
  ["Review Date", "复审日期"],
  ["Context", "背景"],
  ["Team", "团队"],
  ["Decision", "决策"],
  ["Alternatives Considered", "考虑过的替代方案"],
  ["Consequences", "影响"],
  ["Delphi Consensus Protocol", "德尔菲共识协议"],
  ["Assumption Ledger", "假设账本"],
  ["Regret Map", "后悔地图"],
  ["TOPSIS Decision Lens", "TOPSIS 决策视角"],
  ["Monte Carlo Stress Lens", "蒙特卡洛压力测试"],
  ["AHP Sensitivity Analysis", "AHP 敏感性分析"],
  ["Risks", "风险"],
  ["Rollback Plan", "回滚计划"],
  ["Inputs", "输入"],
  ["outputs", "输出"],
  ["Mitigation", "缓解措施"],
  ["Consistency ratio", "一致性比率"],
  ["selected", "选择"],
  ["with Quorum", "裁决综合分"],
  ["worst-case regret", "最坏后悔值"],
  ["average regret", "平均后悔值"],
  ["closeness", "贴近度"],
  ["distance to ideal", "到理想解距离"],
  ["distance to anti-ideal", "到负理想解距离"],
  ["win rate", "胜率"],
  ["average simulated score", "平均模拟分"],
  ["downside P10", "下行 P10"],
  ["worst simulated score", "最差模拟分"],
  ["Strong architecture coherence", "架构一致性强"],
  ["Good product and team feasibility synthesis", "产品和团队可行性综合较好"],
  ["Strong cost and risk critique", "成本和风险质询较强"],
  ["Good implementation complexity sensitivity", "对实现复杂度较敏感"],
  ["Strong long-term strategy view", "长期策略视角较强"],
  ["Good reliability and migration framing", "可靠性和迁移框架较好"],
  [
    "First six months: 50 tenants and fewer than 10,000 daily active users.",
    "未来 6 个月：50 个租户，日活少于 10,000。"
  ],
  [
    "The MVP can ship with one PostgreSQL operational surface.",
    "MVP 可以先保持一个 PostgreSQL 运维面。"
  ],
  [
    "Tenant-boundary tests and tenant-aware data access become launch blockers.",
    "租户边界测试和租户感知数据访问应成为上线门禁。"
  ],
  [
    "Enterprise isolation remains a documented migration path, not an upfront default.",
    "企业级隔离保留为文档化迁移路径，而不是默认前置建设。"
  ],
  ["Validation question", "验证问题"],
  ["Validation action", "验证动作"],
  ["acceptable", "可接受"],
  ["principal-architect-proposal-revised", "首席架构师修订方案"],
  ["security-reviewer-proposal-revised", "安全评审修订方案"],
  ["pragmatic-builder-proposal-revised", "务实构建者修订方案"],
  ["sre-reviewer-proposal-revised", "SRE 评审修订方案"],
  ["cost-engineer-proposal-revised", "成本工程师修订方案"],
  ["[high]", "[高]"],
  ["security (high)", "安全（高）"],
  ["complexity (medium)", "复杂度（中）"],
  ["performance (medium)", "性能（中）"],
  [
    "Freeze new tenant onboarding if a tenant-isolation incident occurs.",
    "如果发生租户隔离事件，冻结新租户接入。"
  ],
  [
    "Move affected tenants to schema-per-tenant isolation.",
    "将受影响租户迁移到每租户独立 schema 隔离。"
  ],
  [
    "Run authorization boundary tests before reopening onboarding.",
    "重新开放接入前运行授权边界测试。"
  ]
];

export function localizeKnownDecisionText(value: string, locale: SupportedLocale): string {
  if (locale !== "zh" || !value) {
    return value;
  }

  return zhDecisionPhrases.reduce((text, [source, replacement]) => text.replaceAll(source, replacement), value);
}
