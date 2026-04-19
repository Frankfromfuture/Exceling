// Tweaks panel — in-page controls, also supports host edit mode messaging.

const { useState: useStateT, useEffect: useEffectT } = React;

function TweaksPanel({ open, onClose, tweaks, setTweaks }) {
  if (!open) return null;
  const set = (k, v) => setTweaks(prev => ({ ...prev, [k]: v }));

  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, width: 280,
      background: "var(--ink-0)", border: "1px solid var(--ink-200)", borderRadius: 8,
      padding: 16, zIndex: 100,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
      fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-700)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}>Tweaks</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-500)", fontSize: 16, padding: 0, cursor: "pointer" }}>×</button>
      </div>

      <TweakGroup label="View">
        <Radio label="Canvas" checked={tweaks.primaryView !== "excel"} onChange={() => set("primaryView", "sketch")} />
        <Radio label="Excel"  checked={tweaks.primaryView === "excel"} onChange={() => set("primaryView", "excel")} />
      </TweakGroup>

      <TweakGroup label="Operator display">
        <Radio label="Node color + line weight" checked={tweaks.operatorDisplay === "node"} onChange={() => set("operatorDisplay", "node")} />
        <Radio label="Edge label badge"         checked={tweaks.operatorDisplay === "edge-label"} onChange={() => set("operatorDisplay", "edge-label")} />
      </TweakGroup>

      <TweakGroup label="Color scheme">
        <Radio label="Functional (sage / mauve / slate / sand)" checked={tweaks.colorScheme === "functional"} onChange={() => set("colorScheme", "functional")} />
        <Radio label="Monochrome" checked={tweaks.colorScheme === "mono"} onChange={() => set("colorScheme", "mono")} />
      </TweakGroup>

      <TweakGroup label="Node density">
        <Radio label="Compact"     checked={tweaks.nodeDensity === "compact"} onChange={() => set("nodeDensity", "compact")} />
        <Radio label="Comfortable" checked={tweaks.nodeDensity === "comfortable"} onChange={() => set("nodeDensity", "comfortable")} />
        <Radio label="Spacious"    checked={tweaks.nodeDensity === "spacious"} onChange={() => set("nodeDensity", "spacious")} />
      </TweakGroup>

      <TweakGroup label="Narration bubble">
        <Radio label="Show" checked={tweaks.showNarration} onChange={() => set("showNarration", true)} />
        <Radio label="Hide" checked={!tweaks.showNarration} onChange={() => set("showNarration", false)} />
      </TweakGroup>
    </div>
  );
}

function TweakGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, color: "var(--ink-500)", letterSpacing: "0.08em",
        textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
      }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function Radio({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "2px 0" }}>
      <span style={{
        width: 12, height: 12, borderRadius: "50%",
        border: "1px solid " + (checked ? "var(--ink-900)" : "var(--ink-300)"),
        background: checked ? "var(--ink-900)" : "transparent",
        display: "inline-block", position: "relative", flexShrink: 0,
      }}>
        {checked && <span style={{
          position: "absolute", left: 3, top: 3, width: 4, height: 4, borderRadius: "50%",
          background: "var(--ink-0)",
        }} />}
      </span>
      <span style={{ fontSize: 12, color: "var(--ink-700)" }}>{label}</span>
      <input type="radio" checked={checked} onChange={onChange} style={{ display: "none" }} />
    </label>
  );
}

window.TweaksPanel = TweaksPanel;
