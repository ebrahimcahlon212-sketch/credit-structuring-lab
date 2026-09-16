# Model reference

Formulas and conventions for the educational CLN and bond-repack model. The [two-page Word note](reports/credit-model-note.docx) summarises the examples.

## Terms and conventions

`StructureTerms` is immutable; unknown JSON term names are rejected. Rates with `_pct` suffixes are percentages; spreads and fees with `_bps` suffixes are basis points.

| Input | Unit or meaning |
|---|---|
| `notional` | Currency; note and reference-asset face amount |
| `term_years` | Years; must resolve to whole quarters |
| `issue_price_pct` | Percent of notional paid by the investor |
| `coupon_rate_pct` | Annual note coupon percent |
| `credit_spread_bps` | Credit spread in basis points |
| `recovery_rate_pct` | Recovery percent, at least zero and below 100% |
| `discount_rate_pct` | Annual continuous discount rate percent |
| `funding_rate_pct` | Annual percent; coupon decomposition only |
| `reference_coupon_rate_pct` | Annual reference-bond coupon percent |
| `reference_price_pct` | Reference-asset purchase price as percent of notional |
| `annual_fee_bps` | Annual repack operating fee in basis points |

Dates advance by three calendar months from the valuation date, with a fixed accrual fraction of 0.25. There is no holiday calendar or business-day adjustment. Expected valuation allocates defaults to quarterly payment dates and pays no accrued coupon in a default interval. Recovery is a constant fraction of notional. Deterministic event paths use the separate timing convention below.

## Default and discounting

Let `s` be decimal credit spread, `R` decimal recovery, `r` the annual continuous discount rate and `t_i` a quarterly payment time:

```text
lambda = s / (1 - R)
S_i = exp(-lambda * t_i), with S_0 = 1
q_i = S_(i-1) - S_i
D_i = exp(-r * t_i)
sum(q_i) + S_n = 1
```

The hazard estimate is a spread/LGD approximation, without calibration to CDS premium and protection legs. Probabilities are model-implied, risk-neutral-style quantities rather than realised-default forecasts. Recovery of 100% is excluded because LGD is the denominator.

## CLN

Let `N` be notional, `c` the annual decimal coupon, `Delta = 0.25`, `P_0` the issue price in percent and `I_i` equal one at maturity and zero otherwise:

```text
CF_note_i = N*c*Delta*S_i + N*R*q_i + I_i*N*S_i
PV_note = sum(D_i * CF_note_i)
NPV_investor = PV_note - N*P_0/100
A = N * sum(Delta * S_i * D_i)
c_fair = (N*P_0/100 - PV_principal_and_recovery) / A
```

Coupons require survival to the payment date; principal requires survival to maturity. Recovery is paid at the quarter's payment date. The fair annual coupon sets investor NPV to zero. The reported percentage coupon is `100*c_fair`.

The issuer receives the issue proceeds and pays the note cash flows, so issuer NPV is the negative of investor NPV in this note-leg view. `funding_rate_pct` only splits expected coupon into `N*f*Delta*S_i` and `N*(c-f)*Delta*S_i`. It does not model collateral investment, hedge purchase or issuer funding costs.

## Bond repack

The asset and note share notional, maturity, default probability and recovery. Let `c_b` be the annual decimal bond coupon, `g` the annual decimal fee and `P_b` the bond purchase price in percent:

```text
CF_asset_i = N*c_b*Delta*S_i + N*R*q_i + I_i*N*S_i
Fee_i = N*g*Delta*S_i
CF_SPV_i = CF_asset_i - CF_note_i - Fee_i
CF_SPV_0 = N*P_0/100 - N*P_b/100
c_fair = (CF_SPV_0 + PV_asset - PV_principal_and_recovery - PV_fees) / A
```

This fair coupon sets the SPV residual NPV to zero. It does not target zero investor NPV. The model represents cash pass-through with an operating fee; it excludes swaps, collateral sales, funding haircuts, margining, payment waterfalls and enforcement.

## Event paths and sensitivities

The examples include undiscounted paths for default at 1.25, 3.00 and 4.75 years, plus no default. On a default path, coupons are paid only on dates strictly before the event. Recovery is paid on the first quarterly date strictly after it, with no principal or later cash flows. Default on a coupon date forfeits that coupon; default at maturity settles one quarter later. With no default, all scheduled coupons and principal are paid.

Paths report dated payments, total distributions and net undiscounted cash flow after subscription. They do not estimate XIRR, event probabilities or expected returns.

Named scenarios change the specified inputs and rerun valuation. The example labelled "Default stress" combines wider spread, lower recovery and a higher discount rate; it is separate from an assumed event date. The spread/recovery grid recalculates hazard at each point, so recovery sensitivity does not hold hazard constant.

## Outputs and checks

Results include hazard, survival, cumulative default probability, undiscounted expected loss, fair coupon, quarterly expected cash flows, component present values and investor/issuer NPVs. `investor_value_pct` is discounted note cash flows divided by notional, not by the issue price.

The CLI writes JSON and CSV and stores input payloads and scenario summaries in SQLite. Foreign keys are enabled, inserts are atomic and comparison queries are parameterised. Stored identifiers and UTC timestamps support comparison between runs. The [Excel workbook](excel/Credit_Structuring_Cash_Flow_Engine.xlsx) can be checked against [exported Python metrics](outputs/excel_crosscheck.json).

Each valuation checks probability mass, non-increasing survival, schedule length, component reconciliation, the fair-coupon NPV target and finite numeric outputs. Unit tests also cover date conventions, spread direction, quarterly-frequency rejection, credit-event settlement, repack coupons, SQLite ordering and CLI outputs. These checks establish internal consistency, not market calibration or independent price verification.

## Limitations

The examples use hypothetical inputs. Constant hazard, flat discounting and deterministic recovery omit term structures and interactions between default timing, rates, recovery and market conditions. Expected cash flows and event paths do not provide a distributional or Monte Carlo risk analysis. Quarterly settlement and the accrued-coupon treatment are modelling conventions, not legal interpretations of transaction terms.

The CLN excludes issuer default, hedge cost, collateral return, wrong-way risk and counterparty exposure. The repack also excludes currency conversion and embedded options. Liquidity, bid-offer, bond-CDS basis, CVA, FVA, MVA, capital, tax and accounting are outside scope. There is no live market feed, calibration governance, independent price verification or production change control. Coupons and valuations are educational outputs, not executable quotes.

[MIT licence](LICENSE).
