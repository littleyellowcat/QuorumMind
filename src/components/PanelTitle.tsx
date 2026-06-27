import { useCallback, useId, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";

export function PanelTitle({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div className="panel-title">
      <span>{kicker}</span>
      <h2>{title}</h2>
    </div>
  );
}

export function PanelHeading({ title, kicker, help }: { title: string; kicker?: string; help?: ReactNode }) {
  return (
    <div className="panel-heading">
      {kicker && <span>{kicker}</span>}
      <div className="panel-heading-title">
        <h2>{title}</h2>
        {help && <HelpTooltip label={title}>{help}</HelpTooltip>}
      </div>
    </div>
  );
}

export function HelpTooltip({ label, children }: { label: string; children: ReactNode }) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});

  const updatePosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(280, Math.max(220, window.innerWidth - 24));
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - width / 2),
      Math.max(12, window.innerWidth - width - 12)
    );
    const belowTop = rect.bottom + 8;
    const preferredTop = belowTop + 96 <= window.innerHeight ? belowTop : Math.max(12, rect.top - 156);
    const maxHeight = Math.max(96, Math.min(240, window.innerHeight - preferredTop - 12));

    setPosition({
      left,
      maxHeight,
      top: preferredTop,
      width
    });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      hide();
    }
  };

  return (
    <span className={`help-tooltip ${open ? "is-open" : ""}`} onBlur={handleBlur} onFocus={show} onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        aria-label={`解释这个指标：${label}`}
        onMouseEnter={show}
        onFocus={show}
        onClick={(event) => {
          event.preventDefault();
          if (open) {
            hide();
          } else {
            show();
          }
        }}
      >
        ?
      </button>
      <span id={tooltipId} className="help-tooltip-content" role="tooltip" style={position}>
        {children}
      </span>
    </span>
  );
}

export function CollapsibleSidePanel({
  title,
  kicker,
  children,
  defaultOpen = false
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="side-panel collapsible-side-panel" open={defaultOpen}>
      <summary>
        {kicker && <span>{kicker}</span>}
        <strong>{title}</strong>
      </summary>
      <div className="collapsible-side-panel-body">{children}</div>
    </details>
  );
}

export function BlueprintCollapsiblePanel({
  index,
  title,
  summary,
  children,
  defaultOpen = false
}: {
  index: number;
  title: string;
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="panel-block blueprint-collapsible-panel" open={defaultOpen}>
      <summary>
        <span>{String(index).padStart(2, "0")}</span>
        <div>
          <strong>{title}</strong>
          <small>{summary}</small>
        </div>
      </summary>
      <div className="blueprint-collapsible-body">{children}</div>
    </details>
  );
}
