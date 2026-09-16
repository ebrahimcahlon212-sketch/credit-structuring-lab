# Credit Structuring Lab

Python and Excel models for the quarterly cash flows of a credit-linked note (CLN) and a simple bond repack. They calculate expected payments, fair coupons, default-event payoffs and spread/recovery sensitivities using hypothetical inputs.

[Two-page model note (Word)](reports/credit-model-note.docx) · [Excel workbook](excel/Credit_Structuring_Cash_Flow_Engine.xlsx) · [Formulas and conventions](MODEL_NOTE.md)

## Example

The hypothetical five-year, £1,000,000 CLN pays a 7.25% coupon. At a 275 bp spread, 40% recovery and 4.25% flat discount rate, the model gives a 7.088% fair coupon, a value of 100.649 per 100 notional and £6,487.35 investor NPV. [Inputs](examples/base_case.json) and [results](outputs/base_case_results.json) are included.

The CLN fair coupon sets investor NPV to zero at the issue price. The repack fair coupon sets the issuer/SPV residual to zero after the reference-bond purchase, note payments and operating fees. These are different targets.

## Run

Python 3.10 or later; no runtime dependencies outside the standard library. In your Python environment:

```bash
python -m pip install -e .
python -m unittest discover -s tests -v
python -m credit_structuring_lab generate --input examples/base_case.json --output-dir outputs
python -m credit_structuring_lab generate --input examples/repack_case.json --output-dir outputs --output-prefix repack_case
python -m credit_structuring_lab compare --database outputs/model_runs.sqlite --scenario "Base case" --limit 10
```

The commands write JSON results, sensitivity CSVs and a SQLite run history. Separate prefixes keep the CLN and repack outputs apart. Python supplies the calculations; the workbook can be reviewed against [the exported check values](outputs/excel_crosscheck.json).

## Assumptions and checks

Hazard is constant at `spread / (1 - recovery)`. Payments are quarterly, discounting uses one continuous rate, and expected recovery settles on the quarterly payment date without accrued coupon for the default interval. Model-implied default probabilities are not forecasts. The sensitivity grid recalculates hazard whenever spread or recovery changes.

Tests cover payment dates, probability totals, cash-flow reconciliation, fair-coupon targets, spread direction, default settlement and saved results. GitHub runs them on Python 3.10 and 3.12.

This is an educational model. It omits CDS curve calibration, issuer/counterparty risk, liquidity, funding adjustments, capital, tax and accounting. The repack excludes swaps, liquidation, margining and payment waterfalls. Settlement assumptions are modelling conventions; outputs are not market quotes. See the [technical reference](MODEL_NOTE.md) for the full scope.

[MIT licence](LICENSE).
