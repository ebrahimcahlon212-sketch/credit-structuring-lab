# Credit Structuring Lab

A small Python engine that turns the terms of a single-name credit-linked note, or a simple bond repack, into quarterly expected cash flows, a fair coupon, named scenarios and a spread/recovery sensitivity grid. There is also an Excel version of the model for anyone who wants to review it without installing anything.

I built this to get the cash-flow mechanics properly into my hands: where the money comes from each quarter, what a wider spread actually does to a fixed note coupon, and what the issuer side of the ticket looks like next to the investor's. It is a learning project, not a pricer — see Scope below.

## What it does

- **CLN mode**: a funded note leg with quarterly coupons, recovery after default, and principal back on survival. Solves the fair coupon — the coupon that zeroes investor NPV at the stated issue price.
- **Repack mode**: note proceeds buy a reference bond; the engine compares expected asset and note cash flows after an annual operating fee and solves the coupon that zeroes the SPV residual.
- Constant hazard from the market shorthand `spread / LGD`; flat continuously compounded discounting; recovery settles on the next quarterly payment date.
- Named scenarios plus a two-dimensional spread/recovery grid.
- Outputs: a JSON result file, a sensitivity CSV, a SQLite run history for comparing runs, and the Excel pack.

Python is the calculation source of truth. The workbook mirrors it and is checked against `outputs/excel_crosscheck.json`.

## Quick start

Python 3.10 or later. Standard library only.

```
python -m venv .venv
source .venv/bin/activate
python -m pip install -e .
python -m unittest discover -s tests -v
```

Run the CLN example:

```
python -m credit_structuring_lab generate \
  --input examples/base_case.json \
  --output-dir outputs
```

Run the repack example (separate prefix so it does not overwrite the CLN results):

```
python -m credit_structuring_lab generate \
  --input examples/repack_case.json \
  --output-dir outputs \
  --output-prefix repack_case
```

Compare recent stored runs:

```
python -m credit_structuring_lab compare \
  --database outputs/model_runs.sqlite \
  --scenario "Base case" \
  --limit 10
```

From a checkout without installing, prefix the commands with `PYTHONPATH=src`.

## Sample output

The checked-in base case is a five-year, £1,000,000 CLN with a 7.25% coupon, 275 bp spread, 40% recovery and a 4.25% flat discount rate. Values from `outputs/base_case_results.json`:

| Output | Base case |
| --- | --- |
| Hazard rate | 4.583% |
| Survival to maturity | 79.520% |
| Cumulative default probability | 20.480% |
| Fair coupon | 7.088% |
| Investor value per 100 | 100.649 |
| Investor NPV | £6,487.35 |
| Validation checks | all passed |

How the fixed 7.25% note responds to different spread, recovery and rate assumptions:

| Scenario | Spread | Recovery | Fair coupon | Value per 100 |
| --- | --- | --- | --- | --- |
| Base case | 275 bp | 40% | 7.088% | 100.649 |
| Tighter credit | 175 bp | 40% | 5.552% | 107.162 |
| Wider credit | 450 bp | 40% | 9.411% | 92.043 |
| Default stress | 700 bp | 20% | 12.479% | 81.526 |

These probabilities are model-implied by the spread/LGD approximation — risk-neutral-style quantities, not forecasts.

## How it works

Hazard: `λ = s / (1 − R)`. Survival `S(t) = e^(−λt)`, discount factor `D(t) = e^(−rt)`. Quarter *i* gets default probability `S(tᵢ₋₁) − S(tᵢ)`. A defaulting note pays recovery on the next quarterly date and earns no accrued coupon for that interval; a surviving note receives principal at maturity. The full derivation, conventions and worked equations are in `MODEL_NOTE.md`.

## Repo layout

```
credit-structuring-lab/
├── .github/workflows/ci.yml
├── excel/Credit_Structuring_Cash_Flow_Engine.xlsx
├── examples/
│   ├── base_case.json
│   └── repack_case.json
├── outputs/
│   ├── base_case_results.json
│   ├── excel_crosscheck.json
│   ├── model_runs.sqlite
│   └── sensitivity.csv
├── src/credit_structuring_lab/
│   ├── cli.py
│   ├── model.py
│   └── store.py
├── sql/compare_runs.sql
├── tests/test_model.py
├── MODEL_NOTE.md
├── README.md
└── pyproject.toml
```

## Checks and tests

Every run reports checks: probability mass sums to one, survival never increases, the schedule matches the requested term, cash-flow components reconcile to the total, the fair coupon hits its NPV target, and no NaN or infinity reaches the outputs. The test suite covers those plus spread directionality, credit-event settlement, the repack zero-residual coupon, SQLite ordering and CLI artefact generation. CI runs the same suite on every push.

## Scope

Deliberately simplified:

- One spread and one recovery give a constant hazard — no CDS curve calibration.
- One flat discount rate — no curves, no basis.
- The repack is cash pass-through only: no swap, collateral liquidation, waterfall or margining.
- No counterparty risk, CVA, capital, tax or accounting treatment. Quarterly settlement is a modelling convention, not a legal reading of transaction documents.

The outputs are indicative educational analytics, not quotes.

## Licence

MIT
