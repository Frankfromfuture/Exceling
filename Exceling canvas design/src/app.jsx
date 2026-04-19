// Main App — composes top bar, scenario picker, view panes, narration, tweaks.

const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useCallback: useCallbackA } = React;

function App() {
  const [scenarioKey, setScenarioKey] = useStateA("revenue");
  const scenario = SCENARIOS[scenarioKey];

  const [overrides, setOverrides] = useStateA({});
  const values = useMemoA(() => computeAll(scenario.nodes, overrides), [scenario, overrides]);

  const [tweaks, setTweaks] = useStateA(() => ({ ...(window.TWEAK_DEFAULTS || {}) }));
  const [tweaksOpen, setTweaksOpen] = useStateA(false);
  const [editModeActive, setEditModeActive] = useStateA(false);

  const [highlightPath, setHighlightPath] = useStateA(null);
  const [detailNodeId, setDetailNodeId] = useStateA(null);
  const [promoting, setPromoting] = useStateA(false);
  const [justPromoted, setJustPromoted] = useStateA(false);

  // reset overrides when switching scenario
  useEffectA(() => {
    setOverrides({});
    setHighlightPath(null);
    setDetailNodeId(null);
  }, [scenarioKey]);

  // Edit-mode host protocol
  useEffectA(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "__activate_edit_mode") {
        setEditModeActive(true);
        setTweaksOpen(true);
      } else if (e.data.type === "__deactivate_edit_mode") {
        setEditModeActive(false);
        setTweaksOpen(false);
      }
    };
    window.addEventListener("message", handler);
    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch {}
    return () => window.removeEventListener("message", handler);
  }, []);

  // persist tweak changes up to host
  const updateTweaks = useCallbackA((updater) => {
    setTweaks(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        window.parent.postMessage({ type: "__edit_mode_set_keys", edits: next }, "*");
      } catch {}
      return next;
    });
  }, []);

  const setOverride = (id, value) => setOverrides(o => ({ ...o, [id]: value }));

  const primaryView = tweaks.primaryView || "split";

  const doPromote = () => {
    setPromoting(true);
    setTimeout(() => {
      setPromoting(false);
      setJustPromoted(true);
      setTimeout(() => setJustPromoted(false), 2400);
    }, 900);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ink-50)" }}>
      <TopBar
        scenarioKey={scenarioKey}
        onScenario={setScenarioKey}
        scenario={scenario}
        primaryView={primaryView}
        setPrimaryView={(v) => updateTweaks(t => ({ ...t, primaryView: v }))}
        tweaksOpen={tweaksOpen}
        onToggleTweaks={() => setTweaksOpen(v => !v)}
      />

      <FormulaBar scenario={scenario} values={values} detailNodeId={detailNodeId} />

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <SidePalette scenario={scenario} values={values} setDetailNodeId={setDetailNodeId} setHighlightPath={setHighlightPath} />

        <div style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column" }}>
          {(primaryView === "split" || primaryView === "sketch" || primaryView === "workflow") && (
            <UnifiedCanvas
              scenario={scenario} values={values}
              overrides={overrides} onOverride={setOverride}
              density={tweaks.nodeDensity}
              colorScheme={tweaks.colorScheme}
              highlightPath={highlightPath} setHighlightPath={setHighlightPath}
              detailNodeId={detailNodeId} setDetailNodeId={setDetailNodeId}
            />
          )}
          {primaryView === "excel" && (
            <ExcelView
              scenario={scenario} values={values}
              overrides={overrides} onOverride={setOverride}
              colorScheme={tweaks.colorScheme}
            />
          )}

          {tweaks.showNarration && primaryView !== "excel" && (
            <NarrationBubble scenario={scenario} values={values} detailNodeId={detailNodeId} overrides={overrides} />
          )}
        </div>

        <InspectorPanel
          scenario={scenario} values={values}
          overrides={overrides} onOverride={setOverride}
          detailNodeId={detailNodeId}
        />
      </div>

      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} tweaks={tweaks} setTweaks={updateTweaks} />
    </div>
  );
}

// ---------- Top bar ----------
function TopBar({ scenarioKey, onScenario, scenario, primaryView, setPrimaryView, onToggleTweaks }) {
  return (
    <div style={{
      height: 56, display: "flex", alignItems: "center",
      padding: "0 16px", gap: 16,
      background: "var(--ink-0)", borderBottom: "1px solid var(--ink-200)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark />
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)", letterSpacing: "-0.01em" }}>Exceling</span>
        <span style={{ fontSize: 11, color: "var(--ink-400)", fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>sketch ↔ workflow ↔ excel</span>
      </div>

      <div style={{ width: 1, height: 20, background: "var(--ink-200)" }} />

      {/* scenario switcher */}
      <select
        value={scenarioKey}
        onChange={(e) => onScenario(e.target.value)}
        style={{
          height: 32, padding: "0 10px", background: "var(--ink-0)",
          border: "1px solid var(--ink-300)", borderRadius: 4,
          fontSize: 13, fontWeight: 500, color: "var(--ink-900)",
          fontFamily: "var(--sans)", cursor: "pointer", outline: "none",
        }}
      >
        {Object.entries(SCENARIOS).map(([k, s]) => (
          <option key={k} value={k}>{s.title}</option>
        ))}
      </select>

      <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{scenario.subtitle}</span>

      <div style={{ flex: 1 }} />

      {/* view switcher */}
      <div style={{
        display: "flex", background: "var(--ink-100)",
        borderRadius: 6, padding: 2, border: "1px solid var(--ink-200)",
      }}>
        {[
          { k: "sketch", label: "Canvas" },
          { k: "excel", label: "Excel" },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setPrimaryView(t.k)}
            style={{
              height: 26, padding: "0 12px", border: "none", borderRadius: 4,
              background: primaryView === t.k ? "var(--ink-0)" : "transparent",
              color: primaryView === t.k ? "var(--ink-900)" : "var(--ink-500)",
              fontSize: 12, fontWeight: 500,
              boxShadow: primaryView === t.k ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => alert("Import .xlsx — in the live app this opens a file picker and parses with SheetJS.")}
        style={{
          height: 32, padding: "0 12px", background: "var(--ink-0)", color: "var(--ink-900)",
          border: "1px solid var(--ink-300)", borderRadius: 4, fontSize: 12, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        Import .xlsx
      </button>
      <button
        onClick={() => alert("Export to .xlsx — writes nodes back as a spreadsheet with formulas intact.")}
        style={{
          height: 32, padding: "0 14px", background: "var(--ink-900)", color: "var(--ink-0)",
          border: "none", borderRadius: 4, fontSize: 12, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 21V9M7 14l5-5 5 5M5 3h14" /></svg>
        Export .xlsx
      </button>
    </div>
  );
}

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <rect x="2" y="2" width="7" height="7" rx="1" fill="none" stroke="var(--ink-900)" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1" fill="var(--ink-900)" />
      <rect x="2" y="11" width="7" height="7" rx="1" fill="var(--ink-900)" />
      <rect x="11" y="11" width="7" height="7" rx="1" fill="none" stroke="var(--ink-900)" strokeWidth="1.5" />
    </svg>
  );
}

// ---------- Formula bar (per design.md 8.5) ----------
function FormulaBar({ scenario, values, detailNodeId }) {
  const focus = detailNodeId
    ? scenario.nodes.find(n => n.id === detailNodeId)
    : scenario.nodes.find(n => n.kind === "output");
  if (!focus) return null;
  const v = values[focus.id];
  const formula = focus.formula;
  // substitute numeric values
  const substituted = formula
    ? formula.replace(/[a-z_][a-z0-9_]*/gi, (m) => {
        const n = scenario.nodes.find(x => x.id === m);
        if (!n) return m;
        return fmt(values[n.id]);
      })
    : null;

  return (
    <div style={{
      padding: "14px 20px", background: "var(--ink-50)",
      borderBottom: "1px solid var(--ink-200)",
      display: "flex", alignItems: "baseline", gap: 24,
    }}>
      <div style={{ minWidth: 200 }}>
        <div style={{
          fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em",
          textTransform: "uppercase", fontWeight: 600,
        }}>{kindLabel(focus.kind)} · {focus.cell}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)", marginTop: 2 }}>{focus.label}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {formula ? (
          <>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-700)" }}>
              {formula}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-500)", marginTop: 2 }}>
              {substituted}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-400)" }}>
            — raw {focus.kind === "const" ? "constant" : "input"} —
          </div>
        )}
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>result</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: "var(--ink-1000)", lineHeight: 1.1, marginTop: 2 }}>
          = {fmt(v)}
        </div>
      </div>
    </div>
  );
}

// ---------- Side palette (draggable node library) ----------
function SidePalette({ scenario, values, setDetailNodeId, setHighlightPath }) {
  const kinds = [
    { k: "input", label: "Input", desc: "User value" },
    { k: "const", label: "Constant", desc: "Fixed number" },
    { k: "computed", label: "Computed", desc: "Formula" },
    { k: "output", label: "Output", desc: "Final result" },
  ];

  return (
    <aside style={{
      width: 200, background: "var(--ink-0)", borderRight: "1px solid var(--ink-200)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--ink-200)",
        fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600,
      }}>Node Library</div>
      <div style={{ padding: "8px 12px", display: "grid", gap: 6 }}>
        {kinds.map(k => (
          <PaletteTile key={k.k} kind={k.k} label={k.label} desc={k.desc} />
        ))}
      </div>

      <div style={{
        padding: "12px 16px", borderTop: "1px solid var(--ink-200)", borderBottom: "1px solid var(--ink-200)",
        fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600,
        marginTop: "auto",
      }}>Nodes in model</div>
      <div style={{ flex: 1, overflow: "auto", padding: "6px 8px" }}>
        {scenario.nodes.map(n => (
          <button
            key={n.id}
            onClick={() => { setDetailNodeId(n.id); setHighlightPath(n.id); }}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "6px 10px", background: "transparent", border: "none",
              borderRadius: 4, cursor: "pointer", marginBottom: 2,
              borderLeft: `3px solid ${kindColor(n.kind)}`,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--ink-100)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--ink-800)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label}</span>
              <span style={{ fontSize: 10, color: "var(--ink-400)", fontFamily: "var(--mono)" }}>{n.cell}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-500)", fontFamily: "var(--mono)", marginTop: 2 }}>
              {fmt(values[n.id])}{n.unit ? " " + n.unit : ""}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function PaletteTile({ kind, label, desc }) {
  return (
    <div style={{
      padding: 10, background: "var(--ink-0)", border: "1px solid var(--ink-200)",
      borderRadius: 4, cursor: "grab",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: kindColor(kind) }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-800)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 10, color: "var(--ink-500)", marginTop: 4 }}>{desc}</div>
    </div>
  );
}

// ---------- Inspector panel (right) ----------
function InspectorPanel({ scenario, values, overrides, onOverride, detailNodeId }) {
  const node = detailNodeId ? scenario.nodes.find(n => n.id === detailNodeId) : null;
  if (!node) {
    return (
      <aside style={{
        width: 280, background: "var(--ink-0)", borderLeft: "1px solid var(--ink-200)",
        padding: 20, color: "var(--ink-500)", fontSize: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Inspector</div>
        <div style={{ color: "var(--ink-400)" }}>Click any node to inspect & simulate.</div>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Quick What-if</div>
          <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
            Drag any INPUT slider to see how it ripples through the whole workflow in real time.
          </div>
        </div>

        {scenario.nodes.filter(n => n.kind === "input").map(n => (
          <WhatIfSlider key={n.id} node={n} values={values} overrides={overrides} onOverride={onOverride} />
        ))}
      </aside>
    );
  }

  const isInput = node.kind === "input";
  const v = values[node.id];
  const deps = node.formula ? extractDeps(node.formula).map(id => scenario.nodes.find(x => x.id === id)).filter(Boolean) : [];

  return (
    <aside style={{
      width: 280, background: "var(--ink-0)", borderLeft: "1px solid var(--ink-200)",
      padding: 20, overflow: "auto",
    }}>
      <div style={{
        fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4,
      }}>Inspector · {node.cell}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-900)", marginBottom: 16 }}>{node.label}</div>

      <div style={{
        padding: 12, background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 6, marginBottom: 16,
      }}>
        <div style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Value</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: "var(--ink-1000)", marginTop: 2 }}>{fmt(v)}</div>
        {node.unit && <div style={{ fontSize: 11, color: "var(--ink-500)", fontFamily: "var(--mono)" }}>{node.unit}</div>}
      </div>

      {isInput && (
        <WhatIfSlider node={node} values={values} overrides={overrides} onOverride={onOverride} big />
      )}

      {node.formula && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Formula</div>
          <div style={{ padding: 10, background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-800)" }}>
            = {node.formula}
          </div>
          <div style={{ padding: "8px 10px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-500)" }}>
            Excel: <span style={{ color: "var(--ink-700)" }}>= {formulaToExcel(node.formula, scenario.nodes)}</span>
          </div>
        </div>
      )}

      {deps.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Upstream ({deps.length})</div>
          {deps.map(d => (
            <div key={d.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              padding: "6px 10px", borderBottom: "1px solid var(--ink-100)",
              borderLeft: `3px solid ${kindColor(d.kind)}`,
            }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-800)", fontWeight: 500 }}>{d.label}</div>
                <div style={{ fontSize: 10, color: "var(--ink-400)", fontFamily: "var(--mono)" }}>{d.cell}</div>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-800)" }}>{fmt(values[d.id])}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function WhatIfSlider({ node, values, overrides, onOverride, big }) {
  const cur = overrides[node.id] ?? node.value;
  const min = Math.max(0, cur * 0.2);
  const max = cur === 0 ? 100 : cur * 2.5;
  const step = cur > 100 ? Math.max(1, Math.round(cur / 200)) : cur > 1 ? 0.5 : 0.01;
  const baseline = node.value;
  const deltaPct = baseline ? ((cur - baseline) / baseline) * 100 : 0;

  return (
    <div style={{
      padding: big ? 12 : "10px 0", marginBottom: big ? 16 : 8,
      borderTop: big ? "none" : "1px solid var(--ink-100)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-700)" }}>{node.label}</div>
          <div style={{ fontSize: 10, color: "var(--ink-400)", fontFamily: "var(--mono)" }}>{node.cell}</div>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}>{fmt(cur)}</div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={cur}
        onChange={(e) => onOverride(node.id, parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "var(--ink-900)" }}
      />
      {Math.abs(deltaPct) > 0.5 && (
        <div style={{
          fontSize: 10, fontFamily: "var(--mono)",
          color: deltaPct > 0 ? "var(--ok)" : "var(--err)",
          marginTop: 2,
        }}>
          {deltaPct > 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% vs baseline {fmt(baseline)}
        </div>
      )}
    </div>
  );
}

// ---------- Split view with "promote" transform ----------
function SplitPanes({ scenario, values, overrides, onOverride, tweaks, promoting, onPromote, highlightPath, setHighlightPath, detailNodeId, setDetailNodeId }) {
  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, position: "relative", borderRight: "1px solid var(--ink-200)" }}>
        <SketchCanvas
          scenario={scenario} values={values} onPromote={onPromote}
          density={tweaks.nodeDensity} showNarration={tweaks.showNarration}
          colorScheme={tweaks.colorScheme} operatorDisplay={tweaks.operatorDisplay}
        />
      </div>
      <div style={{ width: 40, background: "var(--ink-50)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--ink-500)" strokeWidth="1.5">
          <path d="M3 8 L13 8 M9 4 L13 8 L9 12" />
        </svg>
        <div style={{ fontSize: 9, color: "var(--ink-500)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, writingMode: "vertical-rl" }}>
          auto-promote
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <WorkflowCanvas
          scenario={scenario} values={values}
          overrides={overrides} onOverride={onOverride}
          density={tweaks.nodeDensity} showNarration={tweaks.showNarration}
          colorScheme={tweaks.colorScheme} operatorDisplay={tweaks.operatorDisplay}
          highlightPath={highlightPath} setHighlightPath={setHighlightPath}
          detailNodeId={detailNodeId} setDetailNodeId={setDetailNodeId}
        />
      </div>
    </div>
  );
}

// ---------- Narration bubble ----------
function NarrationBubble({ scenario, values, detailNodeId, overrides }) {
  const output = scenario.nodes.find(n => n.kind === "output");
  const node = detailNodeId ? scenario.nodes.find(n => n.id === detailNodeId) : output;
  if (!node) return null;
  const lines = buildNarration(scenario.nodes, values);
  const v = values[node.id];
  const hasOverride = Object.keys(overrides).length > 0;

  return (
    <div style={{
      position: "absolute", left: 20, bottom: 20, maxWidth: 440,
      background: "var(--ink-1000)", color: "var(--ink-0)",
      borderRadius: 8, padding: "14px 16px",
      fontFamily: "var(--sans)", fontSize: 12, lineHeight: 1.5,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      pointerEvents: "auto",
    }}>
      <div style={{
        fontSize: 9, color: "var(--ink-400)", letterSpacing: "0.1em",
        textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
      }}>
        Narration {hasOverride && <span style={{ color: "var(--warn)", marginLeft: 6 }}>· what-if active</span>}
      </div>
      <div style={{ color: "var(--ink-0)", fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        {node.label} evaluates to <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{fmt(v)}</span>
        {node.unit ? <span style={{ fontFamily: "var(--mono)", color: "var(--ink-400)" }}> {node.unit}</span> : null}.
      </div>
      <div style={{ color: "var(--ink-300)", fontFamily: "var(--mono)", fontSize: 11 }}>
        {lines.slice(0, 4).join("  →  ")}
      </div>
    </div>
  );
}

// ---------- Promotion overlay ----------
function PromotionOverlay() {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(250,250,250,0.7)",
    }}>
      <div style={{
        padding: "14px 20px", background: "var(--ink-1000)", color: "var(--ink-0)",
        borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: "var(--sans)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Spinner />
        Promoting sketch to structured workflow…
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--ink-600)" strokeWidth="2" />
      <path d="M 8 2 A 6 6 0 0 1 14 8" fill="none" stroke="var(--ink-0)" strokeWidth="2" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

function Toast({ text }) {
  return (
    <div style={{
      position: "absolute", left: "50%", bottom: 20, transform: "translateX(-50%)",
      padding: "10px 14px", background: "var(--ink-1000)", color: "var(--ink-0)",
      borderRadius: 4, fontSize: 12, fontWeight: 500, zIndex: 50,
      borderLeft: "3px solid var(--ok)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      {text}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
