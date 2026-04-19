// Excel Table View — classic grid with rows of cells that map to model nodes
// Shows formula in cell when focused, supports editing input cells.

const { useState: useStateE, useMemo: useMemoE } = React;

function ExcelView({ scenario, values, overrides, onOverride, colorScheme }) {
  const nodes = scenario.nodes;
  const [focus, setFocus] = useStateE(nodes[0]?.id || null);

  // Arrange into rows based on cell (B2, B3…); show column A as labels
  const rows = useMemoE(() => {
    const out = [];
    nodes.forEach(n => {
      const m = n.cell.match(/([A-Z]+)(\d+)/);
      if (!m) return;
      out.push({ id: n.id, col: m[1], row: parseInt(m[2], 10), node: n });
    });
    out.sort((a, b) => a.row - b.row);
    return out;
  }, [nodes]);

  const maxRow = Math.max(...rows.map(r => r.row)) + 1;
  const rowNumbers = Array.from({ length: Math.max(maxRow + 2, 14) }, (_, i) => i + 1);

  const focusNode = nodes.find(n => n.id === focus);
  const focusValue = focusNode ? values[focusNode.id] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ink-0)" }}>
      {/* formula bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px", borderBottom: "1px solid var(--ink-200)", background: "var(--ink-50)",
      }}>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
          padding: "4px 10px", background: "var(--ink-0)", border: "1px solid var(--ink-200)", borderRadius: 4,
          minWidth: 56, textAlign: "center",
        }}>{focusNode?.cell || ""}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-400)" }}>ƒ</span>
        <div style={{
          flex: 1, fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-800)",
          padding: "4px 10px", background: "var(--ink-0)", border: "1px solid var(--ink-200)", borderRadius: 4,
          minHeight: 28, display: "flex", alignItems: "center",
        }}>
          {focusNode?.formula
            ? `= ${formulaToExcel(focusNode.formula, nodes)}`
            : focusNode ? fmt(focusValue) : ""}
        </div>
      </div>

      {/* grid */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontFamily: "var(--sans)", fontSize: 13, width: "100%" }}>
          <thead>
            <tr>
              <th style={headerCellStyle(48)}></th>
              {["A", "B", "C", "D"].map(c => (
                <th key={c} style={headerCellStyle(c === "A" ? 220 : 160)}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowNumbers.map(rn => (
              <tr key={rn}>
                <td style={rowHeaderStyle}>{rn}</td>
                {["A", "B", "C", "D"].map(col => {
                  const r = rows.find(x => x.row === rn && x.col === col);
                  const labelCellNode = (col === "A") && nodes.find(n => {
                    const m = n.cell.match(/([A-Z]+)(\d+)/);
                    return m && parseInt(m[2], 10) === rn;
                  });
                  if (col === "A" && labelCellNode) {
                    return (
                      <td key={col} style={{...dataCellStyle, color: "var(--ink-500)"}}>
                        <span style={{ fontWeight: 500, color: "var(--ink-700)" }}>{labelCellNode.label}</span>
                        {labelCellNode.unit && <span style={{ marginLeft: 6, fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-400)" }}>({labelCellNode.unit})</span>}
                      </td>
                    );
                  }
                  if (!r) return <td key={col} style={dataCellStyle}></td>;
                  const isFocus = focus === r.id;
                  const isInput = r.node.kind === "input";
                  const v = values[r.id];
                  const accent = colorScheme === "mono" ? "var(--ink-300)" : kindColor(r.node.kind);
                  return (
                    <td
                      key={col}
                      style={{
                        ...dataCellStyle,
                        borderColor: isFocus ? "var(--ink-900)" : "var(--ink-200)",
                        borderWidth: isFocus ? 2 : 1,
                        background: isFocus ? "var(--ink-50)" : "var(--ink-0)",
                        position: "relative",
                        cursor: "cell",
                      }}
                      onClick={() => setFocus(r.id)}
                    >
                      <span style={{
                        position: "absolute", left: 0, top: 0, width: 3, height: "100%", background: accent,
                      }} />
                      {isInput && isFocus ? (
                        <input
                          type="number"
                          value={overrides[r.id] ?? r.node.value}
                          onChange={(e) => onOverride(r.id, parseFloat(e.target.value) || 0)}
                          style={{
                            width: "100%", border: "none", outline: "none", background: "transparent",
                            fontFamily: "var(--mono)", fontSize: 13, fontWeight: 500, color: "var(--ink-900)",
                            padding: 0,
                          }}
                          autoFocus
                        />
                      ) : (
                        <span style={{
                          fontFamily: "var(--mono)",
                          fontWeight: r.node.kind === "output" ? 700 : 500,
                          color: r.node.kind === "output" ? "var(--ink-1000)" : "var(--ink-800)",
                        }}>
                          {fmt(v)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* sheet tabs */}
      <div style={{
        display: "flex", borderTop: "1px solid var(--ink-200)", background: "var(--ink-50)",
        padding: "6px 16px", gap: 4,
      }}>
        <div style={{
          padding: "4px 12px", background: "var(--ink-0)", border: "1px solid var(--ink-200)",
          borderBottom: "1px solid var(--ink-0)", marginBottom: -1, borderRadius: "4px 4px 0 0",
          fontSize: 11, color: "var(--ink-700)", fontWeight: 500,
        }}>
          Sheet1
        </div>
        <div style={{
          padding: "4px 12px", fontSize: 11, color: "var(--ink-400)",
        }}>
          +
        </div>
      </div>
    </div>
  );
}

function headerCellStyle(width) {
  return {
    width,
    minWidth: width,
    padding: "4px 8px",
    background: "var(--ink-100)",
    border: "1px solid var(--ink-200)",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--ink-500)",
    letterSpacing: "0.04em",
    textAlign: "center",
  };
}

const rowHeaderStyle = {
  padding: "4px 8px",
  background: "var(--ink-100)",
  border: "1px solid var(--ink-200)",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--ink-500)",
  textAlign: "center",
  width: 48,
};

const dataCellStyle = {
  padding: "6px 12px",
  border: "1px solid var(--ink-200)",
  fontSize: 13,
  color: "var(--ink-800)",
  height: 30,
  verticalAlign: "middle",
};

window.ExcelView = ExcelView;
