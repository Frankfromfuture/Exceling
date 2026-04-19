package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	excelize "github.com/xuri/excelize/v2"
)

type GenerateRequest struct {
	Nodes          []GenerateNode     `json:"nodes"`
	Edges          []GenerateEdge     `json:"edges"`
	CellAddressMap map[string]string  `json:"cellAddressMap"`
	Formulas       map[string]string  `json:"formulas"`
	Options        GenerateOptions    `json:"options"`
}

type GenerateOptions struct {
	SheetName     string `json:"sheetName"`
	IncludeLabels bool   `json:"includeLabels"`
}

type GenerateNode struct {
	ID   string                 `json:"id"`
	Type string                 `json:"type"`
	Data map[string]interface{} `json:"data"`
}

type GenerateEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}

func handleGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonErr(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req GenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "invalid request payload: "+err.Error(), http.StatusBadRequest)
		return
	}

	buffer, err := buildWorkbookBuffer(req)
	if err != nil {
		jsonErr(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="exceling-model.xlsx"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buffer.Bytes())
}

func buildWorkbookBuffer(req GenerateRequest) (*bytes.Buffer, error) {
	file := excelize.NewFile()
	sheetName := sanitizeSheetName(req.Options.SheetName)
	defaultSheet := file.GetSheetName(file.GetActiveSheetIndex())

	if sheetName == "" {
		sheetName = "Model"
	}
	if defaultSheet != sheetName {
		file.SetSheetName(defaultSheet, sheetName)
	}

	labelStyle, _ := file.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
	})

	nodeMap := make(map[string]GenerateNode, len(req.Nodes))
	for _, node := range req.Nodes {
		nodeMap[node.ID] = node
	}

	addresses := make([]string, 0, len(req.CellAddressMap))
	for _, address := range req.CellAddressMap {
		addresses = append(addresses, address)
	}
	sort.Strings(addresses)

	seen := make(map[string]bool, len(addresses))
	for _, address := range addresses {
		seen[address] = true
	}

	for _, node := range req.Nodes {
		address, ok := req.CellAddressMap[node.ID]
		if !ok || address == "" {
			continue
		}

		if formula, ok := req.Formulas[node.ID]; ok && formula != "" {
			if err := file.SetCellFormula(sheetName, address, strings.TrimPrefix(formula, "=")); err != nil {
				return nil, fmt.Errorf("set formula for %s: %w", node.ID, err)
			}
		} else {
			if err := writeNodeValue(file, sheetName, address, node); err != nil {
				return nil, err
			}
		}

		if req.Options.IncludeLabels {
			label := extractLabel(node)
			if label == "" {
				continue
			}
			labelAddress, err := nextColumnAddress(address)
			if err != nil {
				return nil, err
			}
			if err := file.SetCellValue(sheetName, labelAddress, label); err != nil {
				return nil, fmt.Errorf("set label for %s: %w", node.ID, err)
			}
			_ = file.SetCellStyle(sheetName, labelAddress, labelAddress, labelStyle)
		}
	}

	buffer, err := file.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write workbook: %w", err)
	}
	return buffer, nil
}

func writeNodeValue(file *excelize.File, sheetName, address string, node GenerateNode) error {
	switch node.Type {
	case "constantNode":
		return file.SetCellValue(sheetName, address, extractNumericValue(node.Data, "value"))
	case "cellNode":
		value, ok := node.Data["value"]
		if !ok {
			return nil
		}
		return file.SetCellValue(sheetName, address, normalizeValue(value))
	case "operatorNode":
		return nil
	case "branchNode":
		return file.SetCellValue(sheetName, address, extractStringValue(node.Data, "condition"))
	default:
		return nil
	}
}

func extractLabel(node GenerateNode) string {
	if node.Type == "constantNode" {
		if label := extractStringValue(node.Data, "label"); label != "" {
			return label
		}
		return "Constant"
	}
	if label := extractStringValue(node.Data, "label"); label != "" {
		return label
	}
	if address := extractStringValue(node.Data, "address"); address != "" {
		return address
	}
	return ""
}

func extractStringValue(data map[string]interface{}, key string) string {
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

func extractNumericValue(data map[string]interface{}, key string) interface{} {
	value, ok := data[key]
	if !ok || value == nil {
		return 0
	}
	return normalizeValue(value)
}

func normalizeValue(value interface{}) interface{} {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return typed
	case int64:
		return typed
	case json.Number:
		if n, err := typed.Float64(); err == nil {
			return n
		}
		return typed.String()
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return ""
		}
		if number, err := strconv.ParseFloat(trimmed, 64); err == nil {
			return number
		}
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

func nextColumnAddress(address string) (string, error) {
	col, row, err := excelize.CellNameToCoordinates(address)
	if err != nil {
		return "", fmt.Errorf("parse address %s: %w", address, err)
	}
	nextAddress, err := excelize.CoordinatesToCellName(col+1, row)
	if err != nil {
		return "", fmt.Errorf("build next address for %s: %w", address, err)
	}
	return nextAddress, nil
}

func sanitizeSheetName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "Model"
	}
	cleaned := strings.NewReplacer("\\", "-", "/", "-", "*", "-", "[", "(", "]", ")", ":", "-", "?", "-").Replace(trimmed)
	if len(cleaned) > 31 {
		return cleaned[:31]
	}
	return cleaned
}
