package main

import (
	"fmt"
	"github.com/xuri/excelize/v2"
)

func main() {
	f, err := excelize.OpenFile(`C:\Users\17324\Desktop\Coding\test.xlsx`)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer f.Close()

	sheetList := f.GetSheetList()
	fmt.Println("Sheets:", sheetList)
	
	sheet := sheetList[0]

	cells := []string{"C3", "C13"}
	for _, cellName := range cells {
		styleIdx, err := f.GetCellStyle(sheet, cellName)
		if err != nil {
			fmt.Printf("Cell %s style error: %v\n", cellName, err)
			continue
		}
		style, err := f.GetStyle(styleIdx)
		if err != nil {
			fmt.Printf("Cell %s GetStyle error: %v\n", cellName, err)
			continue
		}
        
        fmt.Printf("Cell %s => Style Index: %d\n", cellName, styleIdx)
		if style != nil {
			fmt.Printf("  Fill: %+v\n", style.Fill)
		} else {
            fmt.Printf("  Style is nil\n")
        }
	}
}
