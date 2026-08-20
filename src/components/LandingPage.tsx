import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { DecisionApiHealth, DecisionApiResponse } from "../lib/api-client";
import type { Locale } from "../types/app";
import { appCopy } from "../i18n/view-copy";
import { connectionBadgeLabel } from "./WorkbenchShared";

gsap.registerPlugin(useGSAP);

export function LandingPage(props: {
  locale: Locale;
  health: DecisionApiHealth | null;
  sourceProviderMode: DecisionApiResponse["providerMode"] | undefined;
  onLocaleChange: (locale: Locale) => void;
  onEnterWorkbench: () => void;
  onTrySample: () => void;
}) {
  const { locale, health, sourceProviderMode, onLocaleChange, onEnterWorkbench, onTrySample } = props;
  const t = appCopy[locale];
  const landingRef = useRef<HTMLElement | null>(null);
  const featureCards = [
    {
      title: t.landingDecision,
      body: t.landingDecisionText,
      stat: locale === "zh" ? "问题" : "Question"
    },
    {
      title: t.landingBlueprint,
      body: t.landingBlueprintText,
      stat: locale === "zh" ? "蓝图" : "Blueprint"
    },
    {
      title: t.landingTrace,
      body: t.landingTraceText,
      stat: locale === "zh" ? "证据" : "Evidence"
    }
  ];
  const orbitNodes = [
    { className: "node-proposal", label: t.landingNodeProposal },
    { className: "node-critique", label: t.landingNodeCritique },
    { className: "node-revision", label: t.landingNodeRevision },
    { className: "node-score", label: t.landingNodeScore },
    { className: "node-risk", label: t.landingNodeRisk },
    { className: "node-export", label: t.landingNodeExport }
  ];

  useGSAP(
    () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return;
      }

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({ defaults: { duration: 0.62, ease: "power3.out" } });
        timeline
          .from(".landing-topbar", { y: -12 })
          .from(".landing-copy h1, .landing-copy p, .landing-actions, .landing-proof", {
            y: 18,
            stagger: 0.055
          }, "-=0.22")
          .from(".landing-stat, .landing-feature-grid article", {
            y: 14,
            stagger: 0.045
          }, "-=0.22")
          .from(".decision-orbit", { scale: 0.96, rotation: -4 }, "-=0.48");

        gsap.to(".orbit-ring", {
          rotation: 360,
          duration: 34,
          repeat: -1,
          ease: "none",
          transformOrigin: "50% 50%"
        });
        gsap.to(".network-node", {
          y: (index) => (index % 2 === 0 ? -7 : 7),
          duration: 2.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          stagger: 0.18
        });
        gsap.to(".flow-line", {
          backgroundPosition: "240px 0",
          duration: 5.4,
          repeat: -1,
          ease: "none"
        });
      });

      return () => mm.revert();
    },
    { scope: landingRef }
  );

  return (
    <main className="landing-shell" ref={landingRef}>
      <header className="landing-topbar">
        <div className="brand-lockup">
          <span className="brand-mark">QM</span>
          <div>
            <strong>{t.productName}</strong>
            <small>{t.productKind}</small>
          </div>
        </div>
        <nav className="landing-nav" aria-label={locale === "zh" ? "首页导航" : "Landing navigation"}>
          <a href="#landing-decision">{t.landingNavDecision}</a>
          <a href="#landing-blueprint">{t.landingNavBlueprint}</a>
          <a href="#landing-eval">{t.landingNavEval}</a>
          <a href="#landing-export">{t.landingNavExport}</a>
        </nav>
        <div className="topbar-actions">
          <span className="demo-badge">{connectionBadgeLabel(locale, health, sourceProviderMode)}</span>
          <div className="language-switch" aria-label={t.language}>
            <button className={locale === "en" ? "active" : ""} onClick={() => onLocaleChange("en")}>
              EN
            </button>
            <button className={locale === "zh" ? "active" : ""} onClick={() => onLocaleChange("zh")}>
              中文
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero" aria-label={locale === "zh" ? "产品首页" : "Product landing page"}>
        <div className="landing-copy">
          <h1>{t.landingHeadline}</h1>
          <p>{t.landingSublead}</p>
          <div className="landing-actions">
            <button className="primary-action landing-primary" onClick={onEnterWorkbench}>
              {t.enterWorkbench}
            </button>
            <button className="secondary-action landing-secondary" onClick={onTrySample}>
              {t.landingSecondary}
            </button>
          </div>
          <p className="landing-proof">{t.landingProof}</p>
          <dl className="landing-stats" aria-label={locale === "zh" ? "产品能力指标" : "Product capability metrics"}>
            <div className="landing-stat">
              <dt>{t.landingMetricAlgorithms}</dt>
              <dd>{t.landingMetricAlgorithmsLabel}</dd>
            </div>
            <div className="landing-stat">
              <dt>{t.landingMetricAgents}</dt>
              <dd>{t.landingMetricAgentsLabel}</dd>
            </div>
            <div className="landing-stat">
              <dt>{t.landingMetricThreshold}</dt>
              <dd>{t.landingMetricThresholdLabel}</dd>
            </div>
          </dl>
        </div>
        <div className="landing-visual" aria-label={t.landingVisualLabel}>
          <div className="decision-orbit" aria-hidden="true">
            <div className="orbit-ring ring-outer" />
            <div className="orbit-ring ring-inner" />
            <div className="flow-line line-input" />
            <div className="flow-line line-output" />
            <div className="decision-core">
              <span>{t.landingVisualCenter}</span>
              <strong>{t.landingMetricThreshold}</strong>
              <small>{t.landingVisualScoreLabel}</small>
            </div>
            <div className="flow-chip chip-input">{t.landingVisualInput}</div>
            <div className="flow-chip chip-output">{t.landingVisualOutput}</div>
            {orbitNodes.map((node) => (
              <div className={`network-node ${node.className}`} key={node.className}>
                <span>{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-feature-grid" id="landing-capabilities" aria-label={locale === "zh" ? "核心能力" : "Core capabilities"}>
        {featureCards.map((card, index) => (
          <article
            id={index === 0 ? "landing-decision" : index === 1 ? "landing-blueprint" : "landing-eval"}
            key={card.title}
          >
            <span>{card.stat}</span>
            <strong>{card.title}</strong>
            <p>{card.body}</p>
          </article>
        ))}
        <article id="landing-export">
          <span>{locale === "zh" ? "交付" : "Delivery"}</span>
          <strong>{locale === "zh" ? "面向交付的报告" : "Delivery-ready reports"}</strong>
          <p>
            {locale === "zh"
              ? "复杂审查报告和简版最终方案 PDF 并存，既能给专业人员复盘，也能给非技术用户直接阅读。"
              : "Full audit reports and simple final-plan PDFs coexist, so experts can review the trace while non-technical readers get the answer."}
          </p>
        </article>
      </section>
    </main>
  );
}
