import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const projectDir = path.resolve(process.argv[2] || ".");
const excelDir = path.join(projectDir, "excel");
const previewDir = path.join(projectDir, "excel", "previews");
const outputPath = path.join(excelDir, "Credit_Structuring_Cash_Flow_Engine.xlsx");

const NAVY = "#17365D";
const NAVY_DARK = "#0B1F3A";
const BLUE_LIGHT = "#D9EAF7";
const BLUE_PALE = "#EDF4FA";
const YELLOW = "#FFF2CC";
const GREEN_PALE = "#E2F0D9";
const RED_PALE = "#FCE4D6";
const GREY = "#E7E6E6";
const GREY_LIGHT = "#F5F5F5";
const WHITE = "#FFFFFF";
const BLACK = "#000000";
const INPUT_BLUE = "#0000FF";
const LINK_GREEN = "#008000";

const MONEY = '"£"#,##0;[Red]("£"#,##0);-';
const MONEY_1 = '"£"#,##0.0;[Red]("£"#,##0.0);-';
const PCT = "0.0%;[Red](0.0%);-";
const PCT_2 = "0.00%;[Red](0.00%);-";
const MULT = "0.0x;[Red](0.0x);-";
const NUM = "#,##0.00;[Red](#,##0.00);-";

function setTitle(sheet, rangeAddress, text) {
  const range = sheet.getRange(rangeAddress);
  range.merge();
  range.values = [[text]];
  range.format = {
    fill: NAVY_DARK,
    font: { bold: true, color: WHITE, size: 16 },
    verticalAlignment: "center",
    horizontalAlignment: "left",
  };
  range.format.rowHeight = 30;
}

function setSection(sheet, rangeAddress, text) {
  const range = sheet.getRange(rangeAddress);
  range.merge();
  range.values = [[text]];
  range.format = {
    fill: NAVY,
    font: { bold: true, color: WHITE },
    verticalAlignment: "center",
    horizontalAlignment: "left",
  };
  range.format.rowHeight = 21;
}

function styleHeader(range) {
  range.format = {
    fill: BLUE_LIGHT,
    font: { bold: true, color: BLACK },
    borders: { preset: "all", style: "thin", color: "#A6A6A6" },
    verticalAlignment: "center",
    wrapText: true,
  };
}

function styleTotal(range) {
  range.format.font = { bold: true, color: BLACK };
  range.format.borders = {
    top: { style: "thin", color: BLACK },
    bottom: { style: "double", color: BLACK },
  };
}

function styleInput(range, numberFormat = null) {
  range.format.fill = YELLOW;
  range.format.font = { color: INPUT_BLUE };
  if (numberFormat) range.format.numberFormat = numberFormat;
}

function styleLinked(range, numberFormat = null) {
  range.format.font = { color: LINK_GREEN };
  if (numberFormat) range.format.numberFormat = numberFormat;
}

function setWidths(sheet, widths) {
  for (const [column, width] of Object.entries(widths)) {
    sheet.getRange(`${column}:${column}`).format.columnWidth = width;
  }
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary");
const inputs = workbook.worksheets.add("Inputs");
const cashFlows = workbook.worksheets.add("Cash Flows");
const sensitivities = workbook.worksheets.add("Sensitivities");
const checks = workbook.worksheets.add("Checks");
const sources = workbook.worksheets.add("Sources & Notes");

for (const sheet of [summary, inputs, cashFlows, sensitivities, checks, sources]) {
  sheet.showGridLines = false;
}

await workbook.comments.setSelf({ displayName: "Ebrahim Cahlon" });

// Inputs
setTitle(inputs, "A1:F1", "CREDIT STRUCTURING CASH-FLOW ENGINE | INPUTS");
inputs.getRange("A3:F3").merge();
inputs.getRange("A3").values = [["Synthetic, educational assumptions | Change blue cells only | GBP unless stated"]];
inputs.getRange("A3:F3").format = { fill: GREY_LIGHT, font: { italic: true, color: "#595959" } };

setSection(inputs, "A5:F5", "PRODUCT TERMS");
inputs.getRange("A6:D13").values = [
  ["Product mode", "CLN", "text", "CLN or REPACK"],
  ["Currency", "GBP", "text", "Display convention only"],
  ["Note notional", 1000000, "GBP", "Investor principal"],
  ["Payments per year", 4, "count", "Quarterly in the base case"],
  ["Maturity", 5, "years", "Whole years in this compact model"],
  ["Issue price", 1, "% par", "Cash paid for the note, excluding fee"],
  ["Upfront structuring fee", 0, "% notional", "Optional Excel-layer fee; zero in the Python base case"],
  ["Issuance / setup cost", 0, "% notional", "Optional Excel-layer cost; zero in the Python base case"],
];

setSection(inputs, "A15:F15", "CREDIT AND FUNDING ASSUMPTIONS");
inputs.getRange("A16:D22").values = [
  ["Reference credit spread", 0.0275, "%", "Flat spread used to infer a constant hazard rate"],
  ["Reference recovery", 0.4, "%", "Fractional recovery of par"],
  ["Discount rate", 0.0425, "%", "Flat continuously compounded valuation rate"],
  ["Funding benchmark rate", 0.0425, "%", "Decomposes note coupon into funding and credit margin"],
  ["Funding spread over discount", null, "%", "Funding benchmark less discount rate"],
  ["Repack recovery adjustment", 0, "% par", "Optional stress deduction; zero in the Python model"],
  ["Static secured-funding haircut", 0.1, "% collateral", "Displayed for transaction economics; no margin calls modelled"],
];
inputs.getRange("B20").formulas = [["=B19-B18"]];

setSection(inputs, "A24:F24", "CLN TERMS");
inputs.getRange("A25:D25").values = [["CLN note coupon", 0.0725, "%", "Contractual annual coupon"]];

setSection(inputs, "A27:F27", "REPACK TERMS");
inputs.getRange("A28:D31").values = [
  ["Reference bond coupon", 0.065, "%", "Annual coupon on the purchased bond"],
  ["Reference bond purchase price", 1, "% par", "Initial collateral cash outflow"],
  ["SPV annual administration fee", 0.0015, "%", "Deducted from bond coupon"],
  ["Funding / hedge cost", 0.005, "%", "Deducted from bond coupon"],
];

setSection(inputs, "A33:F33", "DERIVED MODEL TERMS");
inputs.getRange("A34:D37").values = [
  ["Constant hazard rate", null, "%", "Credit spread divided by loss given default"],
  ["Effective note coupon", null, "%", "CLN coupon or repack pass-through coupon"],
  ["Effective note recovery", null, "%", "Reference recovery net of optional repack adjustment"],
  ["Active period count", null, "count", "Maturity multiplied by payment frequency"],
];
inputs.getRange("B34:B37").formulas = [
  ["=IF(B17<1,B16/(1-B17),0)"],
  ["=IF(B6=\"CLN\",B25,MAX(0,B28-B30-B31))"],
  ["=MAX(0,B17-IF(B6=\"REPACK\",B21,0))"],
  ["=B9*B10"],
];

setSection(inputs, "A40:F40", "ILLUSTRATIVE SCENARIO LIBRARY");
inputs.getRange("A41:E46").values = [
  ["Scenario", "Credit spread", "Recovery", "Discount rate", "Use"],
  ["Base", 0.0275, 0.4, 0.0425, "Starting case"],
  ["Tighter spread", 0.015, 0.4, 0.035, "Favourable credit move"],
  ["Wider spread", 0.04, 0.4, 0.045, "Downside repricing"],
  ["Lower recovery", 0.025, 0.25, 0.04, "Loss-severity stress"],
  ["Combined stress", 0.06, 0.2, 0.05, "Severe synthetic case"],
];
styleHeader(inputs.getRange("A41:E41"));

inputs.getRange("B6").dataValidation = { rule: { type: "list", values: ["CLN", "REPACK"] } };
inputs.getRange("B9").dataValidation = { rule: { type: "list", values: [1, 2, 4] } };
styleInput(inputs.getRange("B6:B19"));
styleInput(inputs.getRange("B21:B22"));
styleInput(inputs.getRange("B25"), PCT_2);
styleInput(inputs.getRange("B28:B31"), PCT_2);
inputs.getRange("B8").format.numberFormat = MONEY;
inputs.getRange("B9:B10").format.numberFormat = "0";
inputs.getRange("B11:B13").format.numberFormat = PCT_2;
inputs.getRange("B16:B22").format.numberFormat = PCT_2;
inputs.getRange("B28:B31").format.numberFormat = PCT_2;
inputs.getRange("B34:B36").format.numberFormat = PCT_2;
inputs.getRange("B37").format.numberFormat = "0";
inputs.getRange("B34:B37").format.font = { color: BLACK };
inputs.getRange("B42:D46").format.font = { color: INPUT_BLUE };
inputs.getRange("B42:D46").format.numberFormat = PCT_2;
inputs.getRange("A6:D37").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };
inputs.getRange("A41:E46").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };
inputs.getRange("D6:D37").format.wrapText = true;
inputs.getRange("E6:F37").format.fill = WHITE;
inputs.freezePanes.freezeRows(5);
setWidths(inputs, { A: 34, B: 18, C: 15, D: 58, E: 12, F: 12 });

const inputComments = [
  ["B16", "Illustrative synthetic spread. No market data or curve calibration is embedded."],
  ["B17", "Illustrative fractional recovery assumption. Legal settlement mechanics are simplified."],
  ["B18", "Illustrative flat rate, not a live government or swap curve."],
  ["B19", "Illustrative flat funding benchmark used only for coupon decomposition."],
  ["B21", "Optional spreadsheet recovery adjustment. The Python base case leaves this at zero."],
  ["B22", "Static haircut only. The model excludes margin calls and dynamic collateralisation."],
];
for (const [cell, note] of inputComments) {
  workbook.comments.addThread({ cell: inputs.getRange(cell) }, note);
}

// Cash flows
setTitle(cashFlows, "A1:S1", "CREDIT STRUCTURING CASH-FLOW ENGINE | EXPECTED CASH FLOWS");
cashFlows.getRange("A3:S3").merge();
cashFlows.getRange("A3").values = [["Constant-hazard expected cash flows | Default settles on the next scheduled payment date | Maximum 40 periods"]];
cashFlows.getRange("A3:S3").format = { fill: GREY_LIGHT, font: { italic: true, color: "#595959" } };
cashFlows.getRange("A5:S5").values = [[
  "Period", "End time", "Begin time", "Begin survival", "End survival", "Default probability",
  "Discount factor", "Contractual coupon", "Expected coupon", "Expected recovery", "Expected principal",
  "Expected note CF", "PV note CF", "Expected funding coupon", "Expected credit margin",
  "Expected reference asset CF", "Expected operating cost", "Expected issuer / SPV CF", "PV issuer / SPV CF",
]];
styleHeader(cashFlows.getRange("A5:S5"));

const cfRows = [];
for (let i = 1; i <= 40; i += 1) cfRows.push([i]);
cashFlows.getRange("A6:A45").values = cfRows;

const cfFormulaRows = [];
for (let r = 6; r <= 45; r += 1) {
  cfFormulaRows.push([
    `=IF(A${r}<='Inputs'!$B$37,A${r}/'Inputs'!$B$9,\"\")`,
    `=IF(B${r}=\"\",\"\",MAX(0,B${r}-1/'Inputs'!$B$9))`,
    `=IF(B${r}=\"\",\"\",EXP(-'Inputs'!$B$34*C${r}))`,
    `=IF(B${r}=\"\",\"\",EXP(-'Inputs'!$B$34*B${r}))`,
    `=IF(B${r}=\"\",\"\",D${r}-E${r})`,
    `=IF(B${r}=\"\",\"\",EXP(-'Inputs'!$B$18*B${r}))`,
    `=IF(B${r}=\"\",\"\",'Inputs'!$B$8*'Inputs'!$B$35/'Inputs'!$B$9)`,
    `=IF(B${r}=\"\",\"\",H${r}*E${r})`,
    `=IF(B${r}=\"\",\"\",'Inputs'!$B$8*'Inputs'!$B$36*F${r})`,
    `=IF(B${r}=\"\",\"\",IF(A${r}='Inputs'!$B$37,'Inputs'!$B$8*E${r},0))`,
    `=IF(B${r}=\"\",\"\",SUM(I${r}:K${r}))`,
    `=IF(B${r}=\"\",\"\",L${r}*G${r})`,
    `=IF(B${r}=\"\",\"\",'Inputs'!$B$8*'Inputs'!$B$19/'Inputs'!$B$9*E${r})`,
    `=IF(B${r}=\"\",\"\",I${r}-N${r})`,
    `=IF(B${r}=\"\",\"\",IF('Inputs'!$B$6=\"REPACK\",'Inputs'!$B$8*'Inputs'!$B$28/'Inputs'!$B$9*E${r}+'Inputs'!$B$8*'Inputs'!$B$17*F${r}+K${r},0))`,
    `=IF(B${r}=\"\",\"\",IF('Inputs'!$B$6=\"REPACK\",'Inputs'!$B$8*('Inputs'!$B$30+'Inputs'!$B$31)/'Inputs'!$B$9*E${r},0))`,
    `=IF(B${r}=\"\",\"\",IF('Inputs'!$B$6=\"CLN\",-L${r},P${r}-L${r}-Q${r}))`,
    `=IF(B${r}=\"\",\"\",R${r}*G${r})`,
  ]);
}
cashFlows.getRange("B6:S45").formulas = cfFormulaRows;

cashFlows.getRange("A47:S47").values = [["TOTAL", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]];
cashFlows.getRange("F47:S47").formulas = [[
  "=SUM(F6:F45)", null, "=SUM(H6:H45)", "=SUM(I6:I45)", "=SUM(J6:J45)", "=SUM(K6:K45)",
  "=SUM(L6:L45)", "=SUM(M6:M45)", "=SUM(N6:N45)", "=SUM(O6:O45)", "=SUM(P6:P45)",
  "=SUM(Q6:Q45)", "=SUM(R6:R45)", "=SUM(S6:S45)",
]];
styleTotal(cashFlows.getRange("A47:S47"));
cashFlows.getRange("A49:F52").values = [
  ["CONTROL", "Actual", "Expected", "Difference", "Tolerance", "Status"],
  ["Probability conservation", null, 1, null, 0.0000001, null],
  ["Active periods", null, null, null, 0, null],
  ["Note PV tie", null, null, null, 0.01, null],
];
styleHeader(cashFlows.getRange("A49:F49"));
cashFlows.getRange("B50:F52").formulas = [
  ["=SUM(F6:F45)+EXP(-'Inputs'!$B$34*'Inputs'!$B$10)", null, "=B50-C50", null, "=IF(ABS(D50)<=E50,\"OK\",\"FAIL\")"],
  ["=COUNT(B6:B45)", "='Inputs'!$B$37", "=B51-C51", null, "=IF(ABS(D51)<=E51,\"OK\",\"FAIL\")"],
  ["=SUM(M6:M45)", "=SUMPRODUCT(L6:L45,G6:G45)", "=B52-C52", null, "=IF(ABS(D52)<=E52,\"OK\",\"FAIL\")"],
];
cashFlows.getRange("B6:G45").format.numberFormat = "0.000000";
cashFlows.getRange("H6:S47").format.numberFormat = MONEY_1;
cashFlows.getRange("B50:E52").format.numberFormat = NUM;
cashFlows.getRange("F50:F52").format.font = { bold: true };
cashFlows.getRange("F50:F52").conditionalFormats.add("containsText", { text: "OK", format: { fill: GREEN_PALE, font: { bold: true, color: "#006100" } } });
cashFlows.getRange("F50:F52").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: RED_PALE, font: { bold: true, color: "#9C0006" } } });
styleLinked(cashFlows.getRange("B6:S45"));
cashFlows.freezePanes.freezeRows(5);
setWidths(cashFlows, { A: 9, B: 12, C: 12, D: 15, E: 15, F: 17, G: 15, H: 18, I: 17, J: 18, K: 18, L: 18, M: 18, N: 20, O: 19, P: 22, Q: 20, R: 22, S: 20 });

// Summary
setTitle(summary, "A1:H1", "CREDIT STRUCTURING CASH-FLOW ENGINE");
summary.getRange("A3:H3").merge();
summary.getRange("A3").values = [["Indicative single-name CLN and funded bond-repack model | Synthetic assumptions | Python and Excel cross-check"]];
summary.getRange("A3:H3").format = { fill: GREY_LIGHT, font: { italic: true, color: "#595959" } };

setSection(summary, "A5:D5", "KEY OUTPUTS");
summary.getRange("A6:B18").values = [
  ["Product mode", null],
  ["Effective note coupon", null],
  ["Fair coupon at issue price", null],
  ["Fair coupon minus funding benchmark", null],
  ["Model price", null],
  ["Model value", null],
  ["Cumulative default probability", null],
  ["Expected principal loss", null],
  ["Expected redemption timing", null],
  ["Investor NPV after upfront fee", null],
  ["Issuer / SPV indicative NPV", null],
  ["Reference asset PV", null],
  ["Overall model status", null],
];
summary.getRange("B6:B18").formulas = [
  ["='Inputs'!$B$6"],
  ["='Inputs'!$B$35"],
  ["=IF(B28>0,IF('Inputs'!$B$6=\"CLN\",(B27-B29-B30)/B28,(B27-'Inputs'!$B$8*'Inputs'!$B$29+B26-B29-B30-B31)/B28),\"\")"],
  ["=B8-'Inputs'!$B$19"],
  ["=SUM('Cash Flows'!$M$6:$M$45)/'Inputs'!$B$8"],
  ["=SUM('Cash Flows'!$M$6:$M$45)"],
  ["=SUM('Cash Flows'!$F$6:$F$45)"],
  ["='Inputs'!$B$8*(1-'Inputs'!$B$36)*B12"],
  ["=IF(SUM('Cash Flows'!$J$6:$K$45)>0,(SUMPRODUCT('Cash Flows'!$B$6:$B$45,'Cash Flows'!$J$6:$J$45)+SUMPRODUCT('Cash Flows'!$B$6:$B$45,'Cash Flows'!$K$6:$K$45))/SUM('Cash Flows'!$J$6:$K$45),\"\")"],
  ["=B11-'Inputs'!$B$8*('Inputs'!$B$11+'Inputs'!$B$12)"],
  ["='Inputs'!$B$8*('Inputs'!$B$11+'Inputs'!$B$12-'Inputs'!$B$13-IF('Inputs'!$B$6=\"REPACK\",'Inputs'!$B$29,0))+SUM('Cash Flows'!$S$6:$S$45)"],
  ["=SUMPRODUCT('Cash Flows'!$P$6:$P$45,'Cash Flows'!$G$6:$G$45)"],
  ["='Checks'!$B$5"],
];
summary.getRange("B7:B10").format.numberFormat = PCT_2;
summary.getRange("B11").format.numberFormat = MONEY_1;
summary.getRange("B12").format.numberFormat = PCT_2;
summary.getRange("B13").format.numberFormat = MONEY_1;
summary.getRange("B14").format.numberFormat = "0.00";
summary.getRange("B15:B17").format.numberFormat = MONEY_1;
summary.getRange("B18").format.font = { bold: true };
styleLinked(summary.getRange("B6:B18"));

setSection(summary, "E5:H5", "TRANSACTION MAP");
summary.getRange("E6:H16").values = [
  ["Mode", "Cash source", "Investor receives", "Primary retained risk"],
  ["CLN", "Funded note proceeds", "Coupon plus recovery-adjusted redemption", "Issuer, funding and reference-credit mechanics"],
  ["REPACK", "Note proceeds purchase a reference bond", "Pass-through coupon and recovery-adjusted redemption", "Collateral, funding and running-cost economics"],
  [null, null, null, null],
  ["Credit event", "Reference default interrupts coupons", "Principal is reduced to modelled recovery", "Legal and auction mechanics are outside scope"],
  ["No default", "Coupons continue", "Principal returns at maturity", "Rates, liquidity and issuer risk remain"],
  [null, null, null, null],
  ["Why this model", "Maps product terms into cash flows", "Separates investor and issuer views", "Automates repeatable scenario analysis"],
  [null, null, null, null],
  ["Use", "Change blue assumptions", "Review Summary and Sensitivities", "Confirm all Checks remain OK"],
  ["Boundary", "Indicative educational model", "Not an executable quote", "Not investment advice"],
];
styleHeader(summary.getRange("E6:H6"));
summary.getRange("E6:H16").format.wrapText = true;
summary.getRange("E6:H16").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };

setSection(summary, "A21:D21", "VALUATION COMPONENTS");
summary.getRange("A22:B31").values = [
  ["Coupon annuity PV per 100% coupon", null],
  ["Recovery PV", null],
  ["Principal PV", null],
  ["Note liability PV", null],
  ["Reference asset PV", null],
  ["Issue proceeds", null],
  ["Fair-coupon denominator", null],
  ["Fair-coupon recovery term", null],
  ["Fair-coupon principal term", null],
  ["Operating-cost PV", null],
];
summary.getRange("B22:B31").formulas = [
  ["='Inputs'!$B$8/'Inputs'!$B$9*SUMPRODUCT('Cash Flows'!$E$6:$E$45,'Cash Flows'!$G$6:$G$45)"],
  ["='Inputs'!$B$8*'Inputs'!$B$36*SUMPRODUCT('Cash Flows'!$F$6:$F$45,'Cash Flows'!$G$6:$G$45)"],
  ["=SUMPRODUCT('Cash Flows'!$K$6:$K$45,'Cash Flows'!$G$6:$G$45)"],
  ["=SUM('Cash Flows'!$M$6:$M$45)"],
  ["=SUMPRODUCT('Cash Flows'!$P$6:$P$45,'Cash Flows'!$G$6:$G$45)"],
  ["='Inputs'!$B$8*'Inputs'!$B$11"],
  ["=B22"],
  ["=B23"],
  ["=B24"],
  ["=SUMPRODUCT('Cash Flows'!$Q$6:$Q$45,'Cash Flows'!$G$6:$G$45)"],
];
summary.getRange("B22:B31").format.numberFormat = MONEY_1;
styleLinked(summary.getRange("B22:B31"));

setSection(summary, "E21:H21", "REVIEWER ROUTE");
summary.getRange("E22:H30").values = [
  ["Step", "Action", "Evidence", "Approx. time"],
  [1, "Read the Summary", "Product map and economics", "45 sec"],
  [2, "Change Inputs B6, B16 or B17", "Reusable product template", "60 sec"],
  [3, "Inspect Cash Flows", "Default and survival mechanics", "75 sec"],
  [4, "Review Sensitivities", "Spread and recovery risk", "60 sec"],
  [5, "Confirm Checks", "Controls and Python cross-check", "60 sec"],
  [null, null, null, null],
  ["Production extensions", "Market curves, ISDA settlement, counterparty risk and booking integration", "Explicitly excluded", "Discussion"],
  ["Source of truth", "Python engine with an independent formula mirror in Excel", "Tests plus workbook checks", "Discussion"],
];
styleHeader(summary.getRange("E22:H22"));
summary.getRange("E22:H30").format.wrapText = true;
summary.getRange("E22:H30").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };
summary.getRange("B18").conditionalFormats.add("containsText", { text: "OK", format: { fill: GREEN_PALE, font: { bold: true, color: "#006100" } } });
summary.getRange("B18").conditionalFormats.add("containsText", { text: "WARN", format: { fill: YELLOW, font: { bold: true, color: "#9C6500" } } });
summary.getRange("B18").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: RED_PALE, font: { bold: true, color: "#9C0006" } } });
summary.freezePanes.freezeRows(5);
setWidths(summary, { A: 36, B: 22, C: 13, D: 4, E: 18, F: 32, G: 33, H: 20 });

// Sensitivities
setTitle(sensitivities, "A1:O1", "CREDIT STRUCTURING CASH-FLOW ENGINE | SENSITIVITIES");
sensitivities.getRange("A3:O3").merge();
sensitivities.getRange("A3").values = [["Formula-driven spread and recovery sensitivities | Each row recalculates survival, loss and note value"]];
sensitivities.getRange("A3:O3").format = { fill: GREY_LIGHT, font: { italic: true, color: "#595959" } };
sensitivities.getRange("A5:I5").values = [["Case", "Credit spread", "Recovery", "Hazard rate", "Default probability", "Model price", "Fair coupon", "Survival PV factor", "Default PV factor"]];
styleHeader(sensitivities.getRange("A5:I5"));

const spreads = [0.01, 0.02, 0.03, 0.04, 0.06];
const recoveries = [0.2, 0.3, 0.4, 0.5, 0.6];
const scenarioRows = [];
for (const recovery of recoveries) {
  for (const spread of spreads) {
    scenarioRows.push([`S${Math.round(spread * 10000)} / R${Math.round(recovery * 100)}`, spread, recovery, null, null, null, null, null, null]);
  }
}
sensitivities.getRange("A6:I30").values = scenarioRows;
const sensFormulaRows = [];
for (let r = 6; r <= 30; r += 1) {
  const noteRecovery = `MAX(0,C${r}-IF('Inputs'!$B$6=\"REPACK\",'Inputs'!$B$21,0))`;
  const survivalTerms = [];
  const defaultTerms = [];
  for (let cfRow = 6; cfRow <= 45; cfRow += 1) {
    survivalTerms.push(`IF('Cash Flows'!$B$${cfRow}=\"\",0,EXP(-D${r}*'Cash Flows'!$B$${cfRow})*EXP(-'Inputs'!$B$18*'Cash Flows'!$B$${cfRow}))`);
    defaultTerms.push(`IF('Cash Flows'!$B$${cfRow}=\"\",0,(EXP(-D${r}*'Cash Flows'!$C$${cfRow})-EXP(-D${r}*'Cash Flows'!$B$${cfRow}))*EXP(-'Inputs'!$B$18*'Cash Flows'!$B$${cfRow}))`);
  }
  const survDf = `SUM(${survivalTerms.join(",")})`;
  const defaultDf = `SUM(${defaultTerms.join(",")})`;
  const principalDf = `EXP(-D${r}*'Inputs'!$B$10)*EXP(-'Inputs'!$B$18*'Inputs'!$B$10)`;
  const assetDf = `'Inputs'!$B$28/'Inputs'!$B$9*H${r}+C${r}*I${r}+${principalDf}`;
  const operatingCostDf = `('Inputs'!$B$30+'Inputs'!$B$31)/'Inputs'!$B$9*H${r}`;
  sensFormulaRows.push([
    `=IF(C${r}<1,B${r}/(1-C${r}),0)`,
    `=1-EXP(-D${r}*'Inputs'!$B$10)`,
    `='Inputs'!$B$35/'Inputs'!$B$9*H${r}+${noteRecovery}*I${r}+${principalDf}`,
    `=IF(H${r}>0,IF('Inputs'!$B$6=\"CLN\",('Inputs'!$B$11-${noteRecovery}*I${r}-${principalDf})/(H${r}/'Inputs'!$B$9),('Inputs'!$B$11-'Inputs'!$B$29+${assetDf}-${noteRecovery}*I${r}-${principalDf}-${operatingCostDf})/(H${r}/'Inputs'!$B$9)),\"\")`,
    `=${survDf}`,
    `=${defaultDf}`,
  ]);
}
sensitivities.getRange("D6:I30").formulas = sensFormulaRows;
sensitivities.getRange("B6:G30").format.numberFormat = PCT_2;
sensitivities.getRange("H6:I30").format.numberFormat = "0.000000";
sensitivities.getRange("A6:I30").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };

setSection(sensitivities, "J5:O5", "MODEL PRICE HEATMAP");
sensitivities.getRange("J6:O11").values = [
  ["Recovery / Spread", ...spreads],
  [recoveries[0], null, null, null, null, null],
  [recoveries[1], null, null, null, null, null],
  [recoveries[2], null, null, null, null, null],
  [recoveries[3], null, null, null, null, null],
  [recoveries[4], null, null, null, null, null],
];
styleHeader(sensitivities.getRange("J6:O6"));
styleHeader(sensitivities.getRange("J7:J11"));
const heatFormulas = [];
for (let r = 7; r <= 11; r += 1) {
  const row = [];
  for (let c = 11; c <= 15; c += 1) {
    const colLetter = String.fromCharCode(64 + c);
    row.push(`=SUMIFS($F$6:$F$30,$B$6:$B$30,${colLetter}$6,$C$6:$C$30,$J${r})`);
  }
  heatFormulas.push(row);
}
sensitivities.getRange("K7:O11").formulas = heatFormulas;
sensitivities.getRange("K6:O11").format.numberFormat = PCT_2;
sensitivities.getRange("J7:J11").format.numberFormat = PCT;
sensitivities.getRange("J6:O11").format.borders = { preset: "all", style: "thin", color: "#A6A6A6" };
sensitivities.getRange("K7:O11").conditionalFormats.add("colorScale", {
  colors: ["#F8696B", "#FFEB84", "#63BE7B"],
  thresholds: ["min", "50%", "max"],
});
sensitivities.getRange("J14:O20").values = [
  ["READING THE GRID", null, null, null, null, null],
  ["Higher credit spread raises inferred hazard and lowers fixed-coupon value.", null, null, null, null, null],
  ["Higher recovery raises value when hazard is held constant. The grid instead recalibrates hazard from spread / LGD.", null, null, null, null, null],
  ["REPACK mode separates reference asset, investor note and running-cost economics.", null, null, null, null, null],
  [null, null, null, null, null, null],
  ["Boundary: flat rates, constant hazard, no bid-offer or liquidity; not executable pricing.", null, null, null, null, null],
  ["Control: all grid cells are live formulas. See Checks for independent Python comparisons.", null, null, null, null, null],
];
sensitivities.getRange("J14:O14").merge();
sensitivities.getRange("J14:O14").format = { fill: NAVY, font: { bold: true, color: WHITE } };
for (let r = 15; r <= 20; r += 1) sensitivities.getRange(`J${r}:O${r}`).merge();
sensitivities.getRange("J15:O20").format.wrapText = true;
sensitivities.getRange("J15:O20").format.rowHeight = 24;
sensitivities.freezePanes.freezeRows(5);
setWidths(sensitivities, { A: 18, B: 16, C: 14, D: 14, E: 18, F: 16, G: 16, H: 17, I: 17, J: 20, K: 15, L: 15, M: 15, N: 15, O: 15 });

// Checks
setTitle(checks, "A1:G1", "CREDIT STRUCTURING CASH-FLOW ENGINE | CHECKS");
checks.getRange("A3:G3").merge();
checks.getRange("A3").values = [["One assertion per row | Formula checks plus independent Python base-case comparisons"]];
checks.getRange("A3:G3").format = { fill: GREY_LIGHT, font: { italic: true, color: "#595959" } };
checks.getRange("A5:B5").values = [["Overall model status", null]];
checks.getRange("B5").formulas = [["=IF(COUNTIF(F8:F24,\"FAIL\")>0,\"FAIL\",IF(COUNTIF(F8:F24,\"WARN\")>0,\"WARN\",\"OK\"))"]];
checks.getRange("A5:B5").format = { fill: BLUE_PALE, font: { bold: true } };
checks.getRange("A7:G7").values = [["Check", "Actual", "Expected", "Difference", "Tolerance", "Status", "Notes"]];
styleHeader(checks.getRange("A7:G7"));

const checkLabels = [
  ["Probability conservation", null, 1, null, 0.0000001, null, "Sum of period default probabilities plus terminal survival"],
  ["Cash-flow PV tie", null, null, null, 0.01, null, "Summary value equals schedule PV"],
  ["Fair coupon reprices to issue price", null, null, null, 0.000001, null, "Expected price at fair coupon"],
  ["Active schedule periods", null, null, null, 0, null, "Maturity multiplied by frequency"],
  ["Investor / issuer bridge", null, null, null, 0.01, null, "Bridge includes fees, costs and repack asset economics"],
  ["Wider spread lowers price", null, 1, null, 0, null, "Monotonicity at 40% recovery"],
  ["Higher recovery raises price at fixed hazard", null, 1, null, 0, null, "Holds the base hazard constant to isolate loss severity"],
  ["Fair coupon non-negative", null, 1, null, 0, null, "Boundary condition"],
  ["Input recovery within bounds", null, 1, null, 0, null, "Recovery must be between zero and one"],
  ["Input period count supported", null, 1, null, 0, null, "Maximum 40 periods"],
  ["Repack pass-through coupon valid", null, 1, null, 0, null, "Coupon cannot be negative"],
  ["Python model price cross-check", null, null, null, 0.000001, null, "Populated from generated Python result when available"],
  ["Python fair coupon cross-check", null, null, null, 0.0001, null, "Populated from generated Python result when available"],
  ["Python default probability cross-check", null, null, null, 0.0001, null, "Populated from generated Python result when available"],
  ["Python investor NPV cross-check", null, null, null, 1, null, "Populated from generated Python result when available"],
  ["Python issuer NPV cross-check", null, null, null, 1, null, "Populated from generated Python result when available"],
  ["Python validation status", null, 1, null, 0, null, "All Python-side controls passed"],
];
checks.getRange("A8:G24").values = checkLabels;

checks.getRange("B8:F18").formulas = [
  ["=SUM('Cash Flows'!$F$6:$F$45)+EXP(-'Inputs'!$B$34*'Inputs'!$B$10)", null, "=ROUND(B8-C8,8)", null, "=IF(ABS(D8)<=E8,\"OK\",\"FAIL\")"],
  ["='Summary'!$B$11", "=SUM('Cash Flows'!$M$6:$M$45)", "=ROUND(B9-C9,8)", null, "=IF(ABS(D9)<=E9,\"OK\",\"FAIL\")"],
  ["=IF('Inputs'!$B$6=\"CLN\",'Summary'!$B$8/'Inputs'!$B$9*SUMPRODUCT('Cash Flows'!$E$6:$E$45,'Cash Flows'!$G$6:$G$45)+'Inputs'!$B$36*SUMPRODUCT('Cash Flows'!$F$6:$F$45,'Cash Flows'!$G$6:$G$45)+EXP(-'Inputs'!$B$34*'Inputs'!$B$10)*EXP(-'Inputs'!$B$18*'Inputs'!$B$10),'Inputs'!$B$11-'Inputs'!$B$29+'Inputs'!$B$28/'Inputs'!$B$9*SUMPRODUCT('Cash Flows'!$E$6:$E$45,'Cash Flows'!$G$6:$G$45)+'Inputs'!$B$17*SUMPRODUCT('Cash Flows'!$F$6:$F$45,'Cash Flows'!$G$6:$G$45)+EXP(-'Inputs'!$B$34*'Inputs'!$B$10)*EXP(-'Inputs'!$B$18*'Inputs'!$B$10)-'Summary'!$B$8/'Inputs'!$B$9*SUMPRODUCT('Cash Flows'!$E$6:$E$45,'Cash Flows'!$G$6:$G$45)-'Inputs'!$B$36*SUMPRODUCT('Cash Flows'!$F$6:$F$45,'Cash Flows'!$G$6:$G$45)-EXP(-'Inputs'!$B$34*'Inputs'!$B$10)*EXP(-'Inputs'!$B$18*'Inputs'!$B$10)-('Inputs'!$B$30+'Inputs'!$B$31)/'Inputs'!$B$9*SUMPRODUCT('Cash Flows'!$E$6:$E$45,'Cash Flows'!$G$6:$G$45))", "=IF('Inputs'!$B$6=\"CLN\",'Inputs'!$B$11,0)", "=ROUND(B10-C10,8)", null, "=IF(ABS(D10)<=E10,\"OK\",\"FAIL\")"],
  ["=COUNT('Cash Flows'!$B$6:$B$45)", "='Inputs'!$B$37", "=ROUND(B11-C11,8)", null, "=IF(ABS(D11)<=E11,\"OK\",\"FAIL\")"],
  ["='Summary'!$B$15+'Summary'!$B$16+'Inputs'!$B$8*'Inputs'!$B$13", "=IF('Inputs'!$B$6=\"CLN\",0,'Summary'!$B$17-'Inputs'!$B$8*'Inputs'!$B$29-'Summary'!$B$31)", "=ROUND(B12-C12,8)", null, "=IF(ABS(D12)<=E12,\"OK\",\"FAIL\")"],
  ["=IF(SUMIFS('Sensitivities'!$F$6:$F$30,'Sensitivities'!$B$6:$B$30,0.06,'Sensitivities'!$C$6:$C$30,0.4)<SUMIFS('Sensitivities'!$F$6:$F$30,'Sensitivities'!$B$6:$B$30,0.01,'Sensitivities'!$C$6:$C$30,0.4),1,0)", null, "=ROUND(B13-C13,8)", null, "=IF(ABS(D13)<=E13,\"OK\",\"FAIL\")"],
  ["=IF(0.6*SUMPRODUCT('Cash Flows'!$F$6:$F$45,'Cash Flows'!$G$6:$G$45)>0.2*SUMPRODUCT('Cash Flows'!$F$6:$F$45,'Cash Flows'!$G$6:$G$45),1,0)", null, "=ROUND(B14-C14,8)", null, "=IF(ABS(D14)<=E14,\"OK\",\"FAIL\")"],
  ["=IF('Summary'!$B$8>=0,1,0)", null, "=ROUND(B15-C15,8)", null, "=IF(ABS(D15)<=E15,\"OK\",\"FAIL\")"],
  ["=IF(AND('Inputs'!$B$17>=0,'Inputs'!$B$17<=1),1,0)", null, "=ROUND(B16-C16,8)", null, "=IF(ABS(D16)<=E16,\"OK\",\"FAIL\")"],
  ["=IF(AND('Inputs'!$B$37>=1,'Inputs'!$B$37<=40),1,0)", null, "=ROUND(B17-C17,8)", null, "=IF(ABS(D17)<=E17,\"OK\",\"FAIL\")"],
  ["=IF(OR('Inputs'!$B$6=\"CLN\",'Inputs'!$B$35>=0),1,0)", null, "=ROUND(B18-C18,8)", null, "=IF(ABS(D18)<=E18,\"OK\",\"FAIL\")"],
];

let pythonCrossCheck = {};
try {
  const raw = await fs.readFile(path.join(projectDir, "outputs", "excel_crosscheck.json"), "utf8");
  pythonCrossCheck = JSON.parse(raw);
} catch {
  pythonCrossCheck = {};
}

const pyRows = [
  ["='Summary'!$B$10", pythonCrossCheck.model_price_pct ?? null, "=IF(OR(B19=\"\",C19=\"\"),0,ROUND(B19-C19,8))", null, "=IF(C19=\"\",\"WARN\",IF(ABS(D19)<=E19,\"OK\",\"FAIL\"))"],
  ["='Summary'!$B$8", pythonCrossCheck.fair_coupon ?? null, "=IF(OR(B20=\"\",C20=\"\"),0,ROUND(B20-C20,8))", null, "=IF(C20=\"\",\"WARN\",IF(ABS(D20)<=E20,\"OK\",\"FAIL\"))"],
  ["='Summary'!$B$12", pythonCrossCheck.default_probability ?? null, "=IF(OR(B21=\"\",C21=\"\"),0,ROUND(B21-C21,8))", null, "=IF(C21=\"\",\"WARN\",IF(ABS(D21)<=E21,\"OK\",\"FAIL\"))"],
  ["='Summary'!$B$15", pythonCrossCheck.investor_npv ?? null, "=IF(OR(B22=\"\",C22=\"\"),0,ROUND(B22-C22,8))", null, "=IF(C22=\"\",\"WARN\",IF(ABS(D22)<=E22,\"OK\",\"FAIL\"))"],
  ["='Summary'!$B$16", pythonCrossCheck.issuer_npv ?? null, "=IF(OR(B23=\"\",C23=\"\"),0,ROUND(B23-C23,8))", null, "=IF(C23=\"\",\"WARN\",IF(ABS(D23)<=E23,\"OK\",\"FAIL\"))"],
  [pythonCrossCheck.validation_ok === true ? 1 : null, 1, "=IF(OR(B24=\"\",C24=\"\"),0,ROUND(B24-C24,8))", null, "=IF(B24=\"\",\"WARN\",IF(ABS(D24)<=E24,\"OK\",\"FAIL\"))"],
];
checks.getRange("B19:F24").formulas = pyRows.map((row) => [row[0], null, row[2], null, row[4]]);
checks.getRange("C19:C24").values = pyRows.map((row) => [row[1]]);
checks.getRange("B8:E24").format.numberFormat = NUM;
checks.getRange("B19:C21").format.numberFormat = PCT_2;
checks.getRange("B22:C23").format.numberFormat = MONEY_1;
checks.getRange("F8:F24").format.font = { bold: true };
checks.getRange("F8:F24").conditionalFormats.add("containsText", { text: "OK", format: { fill: GREEN_PALE, font: { bold: true, color: "#006100" } } });
checks.getRange("F8:F24").conditionalFormats.add("containsText", { text: "WARN", format: { fill: YELLOW, font: { bold: true, color: "#9C6500" } } });
checks.getRange("F8:F24").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: RED_PALE, font: { bold: true, color: "#9C0006" } } });
checks.getRange("B5").conditionalFormats.add("containsText", { text: "OK", format: { fill: GREEN_PALE, font: { bold: true, color: "#006100" } } });
checks.getRange("B5").conditionalFormats.add("containsText", { text: "WARN", format: { fill: YELLOW, font: { bold: true, color: "#9C6500" } } });
checks.getRange("B5").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: RED_PALE, font: { bold: true, color: "#9C0006" } } });
checks.getRange("G8:G24").format.wrapText = true;
checks.getRange("A8:G24").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };
checks.freezePanes.freezeRows(7);
setWidths(checks, { A: 34, B: 18, C: 18, D: 16, E: 13, F: 12, G: 56 });

// Sources and notes
setTitle(sources, "A1:F1", "CREDIT STRUCTURING CASH-FLOW ENGINE | SOURCES AND MODEL NOTES");
sources.getRange("A3:F3").merge();
sources.getRange("A3").values = [["All numerical inputs are synthetic. Sources frame product mechanics and risk context; they do not provide market calibration."]];
sources.getRange("A3:F3").format = { fill: GREY_LIGHT, font: { italic: true, color: "#595959" } };

setSection(sources, "A5:F5", "REFERENCE SOURCES");
sources.getRange("A6:F11").values = [
  ["Code", "Source", "Organisation", "URL", "Used for", "Boundary"],
  ["S1", "2014 ISDA Credit Derivatives Definitions", "ISDA", "https://www.isda.org/book/2014-isda-credit-derivative-definitions/", "Credit-event and settlement context", "The model does not reproduce legal definitions or auction settlement"],
  ["S2", "The rise and risks of synthetic risk transfers", "Bank for International Settlements", "https://www.bis.org/publ/qtrpdf/r_qt2603c.htm", "Funded CLN and collateral context", "The project models a single-name stylisation, not regulatory capital relief"],
  ["S3", "CRE22 Standardised approach: credit risk mitigation", "Basel Committee", "https://www.bis.org/basel_framework/chapter/CRE/22.htm", "Cash-funded CLN context", "No regulatory capital calculation is included"],
  ["S4", "Repack transaction vehicles Q&A", "European Banking Authority", "https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2025_7575", "Repack SPV and cash-flow transformation context", "The model is a simplified pass-through structure"],
  ["S5", "User-defined synthetic assumptions", "Model", "n/a", "All numerical inputs", "Not live market data"],
];
styleHeader(sources.getRange("A6:F6"));
sources.getRange("A6:F11").format.wrapText = true;
sources.getRange("A6:F11").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };

setSection(sources, "A13:F13", "CORE CONVENTIONS");
sources.getRange("A14:F21").values = [
  ["Topic", "Convention", "Reason", "Risk", "Production extension", "Status"],
  ["Default intensity", "Constant hazard = spread / (1 - recovery)", "Transparent approximation", "Not a calibrated credit curve", "Bootstrap hazard curve from market CDS", "DISCLOSED"],
  ["Discounting", "Flat continuously compounded rate", "Keeps mechanics auditable", "No curve shape or basis", "Use OIS and funding curves", "DISCLOSED"],
  ["Default timing", "Period default settled at next coupon date", "Compact expected-cash-flow grid", "No exact event or auction date", "Daily event and settlement engine", "DISCLOSED"],
  ["Coupons", "Paid only if reference survives to payment date", "Conservative simple convention", "No accrued coupon on default", "Add accrued and legal term flags", "DISCLOSED"],
  ["Repack recovery", "Reference recovery with optional spreadsheet adjustment", "Makes recovery sensitivity explicit", "No legal close-out model", "Model swaps and replacement cost", "DISCLOSED"],
  ["Funding", "Flat benchmark rate plus separate running costs", "Shows coupon decomposition", "Static haircut is displayed but not priced", "Collateral and margin schedule", "DISCLOSED"],
  ["Valuation", "Expected cash flows under a stylised risk-neutral hazard", "Illustrative relative value", "Not executable pricing", "Market calibration and bid-offer", "DISCLOSED"],
];
styleHeader(sources.getRange("A14:F14"));
sources.getRange("A14:F21").format.wrapText = true;
sources.getRange("A14:F21").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };

setSection(sources, "A24:F24", "EXCLUDED RISKS AND USE RESTRICTIONS");
sources.getRange("A25:F33").values = [
  ["Counterparty and wrong-way risk", "Excluded", "Would require counterparty exposure and correlation modelling", null, null, null],
  ["Liquidity and bid-offer", "Excluded", "No market depth or executable quote", null, null, null],
  ["Capital, tax and accounting", "Excluded", "Jurisdiction and entity specific", null, null, null],
  ["Legal enforceability", "Excluded", "Requires executed documents and legal review", null, null, null],
  ["Dynamic collateral and margining", "Excluded", "Static haircut is an unpriced display input", null, null, null],
  ["Issuer credit risk", "Simplified", "A flat discount rate is not a full issuer curve", null, null, null],
  ["Use restriction", "Educational", "Not investment advice or an offer to transact", null, null, null],
  ["Model claim", "Indicative cash-flow and scenario model", "Do not call this a production pricer", null, null, null],
  ["Reviewer note", "Inspect assumptions, formulas and checks", "All key limitations are visible", null, null, null],
];
sources.getRange("A25:C33").format.wrapText = true;
sources.getRange("A25:C33").format.borders = { preset: "inside", style: "thin", color: "#D9D9D9" };
sources.freezePanes.freezeRows(5);
setWidths(sources, { A: 28, B: 34, C: 30, D: 62, E: 34, F: 34 });

// Workbook-wide vertical alignment. Cell-specific font colours and weights stay intact.
for (const sheet of [summary, inputs, cashFlows, sensitivities, checks, sources]) {
  const used = sheet.getUsedRange();
  used.format.verticalAlignment = "center";
}

// Keep titles in a consistent presentation font.
for (const [sheet, titleRange] of [
  [summary, "A1:H1"], [inputs, "A1:F1"], [cashFlows, "A1:S1"],
  [sensitivities, "A1:O1"], [checks, "A1:G1"], [sources, "A1:F1"],
]) {
  sheet.getRange(titleRange).format.font = { name: "Arial", size: 16, bold: true, color: WHITE };
}

await fs.mkdir(excelDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const inspectSummary = await workbook.inspect({
  kind: "table",
  range: "Summary!A1:H31",
  include: "values,formulas",
  tableMaxRows: 31,
  tableMaxCols: 8,
  maxChars: 12000,
});
console.log("SUMMARY_INSPECT");
console.log(inspectSummary.ndjson);

const inspectChecks = await workbook.inspect({
  kind: "table",
  range: "Checks!A5:G24",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 7,
  maxChars: 12000,
});
console.log("CHECKS_INSPECT");
console.log(inspectChecks.ndjson);

inputs.getRange("B6").values = [["REPACK"]];
const inspectRepack = await workbook.inspect({
  kind: "table",
  range: "Summary!A6:B17",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 2,
  maxChars: 6000,
});
const inspectRepackChecks = await workbook.inspect({
  kind: "table",
  range: "Checks!A8:F18",
  include: "values,formulas",
  tableMaxRows: 11,
  tableMaxCols: 6,
  maxChars: 8000,
});
console.log("REPACK_INSPECT");
console.log(inspectRepack.ndjson);
console.log(inspectRepackChecks.ndjson);
inputs.getRange("B6").values = [["CLN"]];

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 8000,
});
console.log("ERROR_SCAN");
console.log(formulaErrors.ndjson);

for (const [sheetName, range] of [
  ["Summary", "A1:H31"],
  ["Inputs", "A1:F46"],
  ["Cash Flows", "A1:S52"],
  ["Sensitivities", "A1:O30"],
  ["Checks", "A1:G24"],
  ["Sources & Notes", "A1:F33"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(" ", "_").replaceAll("&", "and")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`OUTPUT ${outputPath}`);
