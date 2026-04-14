// exceling backend — Excel parsing via excelize
// Handles: purple fill detection (theme colors), formula value calculation, cell dependency extraction
//
// Run: go run main.go  (listens on :8080)
// Frontend proxies /api/* here via Vite.

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	excelize "github.com/xuri/excelize/v2"
)

// ── Response types (mirror src/types/index.ts ParsedCell) ────────────────────

type CellData struct {
	Address   string      `json:"address"`
	Col       int         `json:"col"`      // 0-indexed
	Row       int         `json:"row"`      // 0-indexed
	Value     interface{} `json:"value"`    // float64 | string | bool | nil
	RawValue  *string     `json:"rawValue"` // formatted display string
	Formula   *string     `json:"formula,omitempty"`
	Label     *string     `json:"label,omitempty"`
	Comment   *string     `json:"comment,omitempty"`
	IsMarked  bool        `json:"isMarked"`
	IsPercent bool        `json:"isPercent"`
	Deps      []string    `json:"deps"` // cell addresses referenced in formula
}

type ParseResult struct {
	SheetName string     `json:"sheetName"`
	Cells     []CellData `json:"cells"`
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/parse", cors(handleParse))
	mux.HandleFunc("/api/health", cors(handleHealth))

	addr := ":8080"
	log.Printf("[exceling] backend listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func cors(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		h(w, r)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleParse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonErr(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		jsonErr(w, "failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, "missing 'file' field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	f, err := excelize.OpenReader(file)
	if err != nil {
		jsonErr(w, "cannot open xlsx: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}
	defer f.Close()

	result, err := parseWorkbook(f)
	if err != nil {
		jsonErr(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func jsonErr(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ── Workbook parser ───────────────────────────────────────────────────────────

func parseWorkbook(f *excelize.File) (*ParseResult, error) {
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("workbook contains no sheets")
	}
	sheet := sheets[0]

	// 1. Detect purple-filled cells (uses excelize GetStyle — resolves theme colors)
	marked := findPurpleCells(f, sheet)
	log.Printf("[exceling] marked cells: %v", keysOf(marked))

	// 2. Get all cell addresses in the used range
	dim, _ := f.GetSheetDimension(sheet)
	availAddrs := buildAddrSet(dim)

	// 3. Iterate rows
	rows, err := f.GetRows(sheet, excelize.Options{RawCellValue: false})
	if err != nil {
		return nil, fmt.Errorf("GetRows: %w", err)
	}

	var cells []CellData

	for rowIdx, row := range rows {
		for colIdx := range row {
			cellName, err := excelize.CoordinatesToCellName(colIdx+1, rowIdx+1)
			if err != nil {
				continue
			}

			formula, _ := f.GetCellFormula(sheet, cellName)
			// Formatted display value (respects number formats like %, date, etc.)
			formatted, _ := f.GetCellValue(sheet, cellName, excelize.Options{RawCellValue: false})

			// Computed / underlying value
			computedValue := resolveValue(f, sheet, cellName, formula, formatted)
			if computedValue == nil && formatted == "" && formula == "" {
				continue // completely empty cell
			}

			isPercent := isPercentFormat(f, sheet, cellName)

			var deps []string
			if formula != "" {
				deps = extractDeps(formula, availAddrs)
			}
			if deps == nil {
				deps = []string{} // ensure non-null JSON array
			}

			var formulaPtr *string
			if formula != "" {
				s := "=" + formula
				formulaPtr = &s
			}
			var rawPtr *string
			if formatted != "" {
				rawPtr = &formatted
			}

			cells = append(cells, CellData{
				Address:   cellName,
				Col:       colIdx,
				Row:       rowIdx,
				Value:     computedValue,
				RawValue:  rawPtr,
				Formula:   formulaPtr,
				IsMarked:  marked[cellName],
				IsPercent: isPercent,
				Deps:      deps,
			})
		}
	}

	// 4. Label assignment: text-only cells become labels for numeric cells to their right
	assignLabels(cells)

	log.Printf("[exceling] parsed %d cells from sheet %q", len(cells), sheet)
	return &ParseResult{SheetName: sheet, Cells: cells}, nil
}

// resolveValue returns the best numeric/string value for a cell.
func resolveValue(f *excelize.File, sheet, cellName, formula, formatted string) interface{} {
	if formula != "" {
		// CalcCellValue computes IF/VLOOKUP/SUM/etc.
		if calc, err := f.CalcCellValue(sheet, cellName); err == nil && calc != "" {
			if num, e := strconv.ParseFloat(calc, 64); e == nil {
				return num
			}
			return calc
		}
		// Fallback to formatted string
		if formatted != "" {
			if num, e := strconv.ParseFloat(strings.ReplaceAll(formatted, ",", ""), 64); e == nil {
				return num
			}
			return formatted
		}
		return nil
	}

	// Non-formula cell: determine type
	cellType, _ := f.GetCellType(sheet, cellName)
	switch cellType {
	case excelize.CellTypeNumber:
		raw, _ := f.GetCellValue(sheet, cellName, excelize.Options{RawCellValue: true})
		if num, e := strconv.ParseFloat(raw, 64); e == nil {
			return num
		}
	case excelize.CellTypeBool:
		raw, _ := f.GetCellValue(sheet, cellName, excelize.Options{RawCellValue: true})
		return raw == "1" || strings.EqualFold(raw, "true")
	case excelize.CellTypeString, excelize.CellTypeInlineString:
		if formatted != "" {
			return formatted
		}
	default:
		if formatted != "" {
			if num, e := strconv.ParseFloat(strings.ReplaceAll(formatted, ",", ""), 64); e == nil {
				return num
			}
			return formatted
		}
	}
	return nil
}

// ── Purple fill detection ─────────────────────────────────────────────────────

func findPurpleCells(f *excelize.File, sheet string) map[string]bool {
	result := make(map[string]bool)

	dim, err := f.GetSheetDimension(sheet)
	if err != nil || dim == "" {
		return result
	}

	startCell, endCell := dim, dim
	if parts := strings.SplitN(dim, ":", 2); len(parts) == 2 {
		startCell, endCell = parts[0], parts[1]
	}

	startCol, startRow, err := excelize.CellNameToCoordinates(startCell)
	if err != nil {
		return result
	}
	endCol, endRow, err := excelize.CellNameToCoordinates(endCell)
	if err != nil {
		return result
	}

	for row := startRow; row <= endRow; row++ {
		for col := startCol; col <= endCol; col++ {
			cellName, _ := excelize.CoordinatesToCellName(col, row)

			styleIdx, err := f.GetCellStyle(sheet, cellName)
			if err != nil {
				continue
			}
			style, err := f.GetStyle(styleIdx)
			if err != nil {
				continue
			}

			fill := style.Fill
			// Solid pattern fill (Pattern == 1)
			if fill.Type == "pattern" && fill.Pattern == 1 {
				for _, color := range fill.Color {
					if isPurpleHex(color) {
						result[cellName] = true
						break
					}
				}
			}
		}
	}

	return result
}

// isPurpleHex checks RRGGBB or AARRGGBB hex for purple/violet/magenta.
// Mirrors the JS isPurple() in detectPurpleFrame.ts.
func isPurpleHex(hex string) bool {
	hex = strings.TrimPrefix(hex, "#")
	switch len(hex) {
	case 8: // AARRGGBB
		hex = hex[2:]
	case 6:
		// ok
	default:
		return false
	}

	r, _ := strconv.ParseInt(hex[0:2], 16, 64)
	g, _ := strconv.ParseInt(hex[2:4], 16, 64)
	b, _ := strconv.ParseInt(hex[4:6], 16, 64)

	// Direct channel check
	if r > g+12 && b > g+12 && r+b > 60 {
		return true
	}
	// HSL hue 200°–360°
	h, s, l := rgbToHsl(r, g, b)
	return h >= 200 && h <= 360 && s >= 0.08 && l >= 0.04 && l <= 0.92
}

func rgbToHsl(ri, gi, bi int64) (h, s, l float64) {
	r := float64(ri) / 255
	g := float64(gi) / 255
	b := float64(bi) / 255

	max := math.Max(r, math.Max(g, b))
	min := math.Min(r, math.Min(g, b))
	l = (max + min) / 2

	if max == min {
		return 0, 0, l
	}
	d := max - min
	if l > 0.5 {
		s = d / (2 - max - min)
	} else {
		s = d / (max + min)
	}
	switch max {
	case r:
		h = (g - b) / d
		if g < b {
			h += 6
		}
	case g:
		h = (b-r)/d + 2
	default:
		h = (r-g)/d + 4
	}
	h = h / 6 * 360
	return
}

// ── Percent format detection ──────────────────────────────────────────────────

func isPercentFormat(f *excelize.File, sheet, cell string) bool {
	styleIdx, err := f.GetCellStyle(sheet, cell)
	if err != nil {
		return false
	}
	style, err := f.GetStyle(styleIdx)
	if err != nil {
		return false
	}
	// Built-in: 9 = "0%", 10 = "0.00%"
	if style.NumFmt == 9 || style.NumFmt == 10 {
		return true
	}
	if style.CustomNumFmt != nil && strings.Contains(*style.CustomNumFmt, "%") {
		return true
	}
	return false
}

// ── Formula dependency extraction ─────────────────────────────────────────────

// rangeRe matches A1:B10 style ranges (with optional $)
var rangeRe = regexp.MustCompile(`(?i)\$?([A-Z]{1,3})\$?(\d{1,7}):\$?([A-Z]{1,3})\$?(\d{1,7})`)

// singleRe matches individual A1-style refs (with optional $)
var singleRe = regexp.MustCompile(`(?i)\$?([A-Z]{1,3})\$?(\d{1,7})`)

// extractDeps returns all cell addresses referenced by a formula.
// Expands ranges like A1:A10 to individual cell addresses.
// Filters to only cells present in availAddrs (the used range).
func extractDeps(formula string, availAddrs map[string]bool) []string {
	seen := make(map[string]bool)

	// 1. Expand ranges first
	for _, m := range rangeRe.FindAllStringSubmatch(formula, -1) {
		startCol, _ := excelize.ColumnNameToNumber(strings.ToUpper(m[1]))
		startRow, _ := strconv.Atoi(m[2])
		endCol, _ := excelize.ColumnNameToNumber(strings.ToUpper(m[3]))
		endRow, _ := strconv.Atoi(m[4])

		for row := startRow; row <= endRow; row++ {
			for col := startCol; col <= endCol; col++ {
				colName, _ := excelize.ColumnNumberToName(col)
				addr := fmt.Sprintf("%s%d", colName, row)
				if availAddrs[addr] {
					seen[addr] = true
				}
			}
		}
	}

	// 2. Remove range strings so singleRe doesn't re-match their endpoints
	cleaned := rangeRe.ReplaceAllString(formula, "")

	// 3. Match individual refs
	for _, m := range singleRe.FindAllStringSubmatch(cleaned, -1) {
		addr := strings.ToUpper(m[1]) + m[2]
		if availAddrs[addr] {
			seen[addr] = true
		}
	}

	refs := make([]string, 0, len(seen))
	for addr := range seen {
		refs = append(refs, addr)
	}
	sort.Strings(refs)
	return refs
}

// ── Label assignment ──────────────────────────────────────────────────────────

// assignLabels mirrors extractCellData.ts: text-only cells become labels for
// the nearest numeric/formula cell to their right on the same row.
func assignLabels(cells []CellData) {
	type labelEntry struct{ col int; text string }
	labelsByRow := make(map[int][]labelEntry)

	for i := range cells {
		c := &cells[i]
		s, isStr := c.Value.(string)
		if isStr && c.Formula == nil && strings.TrimSpace(s) != "" {
			labelsByRow[c.Row] = append(labelsByRow[c.Row], labelEntry{c.Col, strings.TrimSpace(s)})
		}
	}

	for i := range cells {
		c := &cells[i]
		if s, ok := c.Value.(string); ok && c.Formula == nil && strings.TrimSpace(s) != "" {
			continue // skip text-only cells themselves
		}
		rowLabels := labelsByRow[c.Row]
		bestCol, bestText := -1, ""
		for _, l := range rowLabels {
			if l.col < c.Col && l.col > bestCol {
				bestCol, bestText = l.col, l.text
			}
		}
		if bestText != "" {
			t := bestText
			c.Label = &t
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildAddrSet returns a set of all cell addresses within the sheet dimension string (e.g. "A1:Z100").
func buildAddrSet(dim string) map[string]bool {
	addrs := make(map[string]bool)
	if dim == "" {
		return addrs
	}
	parts := strings.SplitN(dim, ":", 2)
	startCell := parts[0]
	endCell := parts[0]
	if len(parts) == 2 {
		endCell = parts[1]
	}
	startCol, startRow, err1 := excelize.CellNameToCoordinates(startCell)
	endCol, endRow, err2 := excelize.CellNameToCoordinates(endCell)
	if err1 != nil || err2 != nil {
		return addrs
	}
	for row := startRow; row <= endRow; row++ {
		for col := startCol; col <= endCol; col++ {
			name, _ := excelize.CoordinatesToCellName(col, row)
			addrs[name] = true
		}
	}
	return addrs
}

func keysOf(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m { keys = append(keys, k) }
	sort.Strings(keys)
	return keys
}
