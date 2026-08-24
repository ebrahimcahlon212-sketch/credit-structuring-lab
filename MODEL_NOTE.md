# Model Note

## Purpose

Credit Structuring Lab is an educational expected-cash-flow engine for a stylised single-name credit-linked note and a simple cash-pass-through bond repack. I wrote it to work through the product mechanics by hand and to keep every assumption visible.

It is not a production valuation library or an executable quote.

## Model perimeter

The two product modes share one quarterly schedule, default model, discounting method and validation framework.

| Mode | Modelled economics | Fair-coupon target |
|---|---|---|
| `cln` | Note issue proceeds and contractual note cash flows | Zero investor NPV at the stated issue price |
| `repack` | Note proceeds, reference-bond purchase, expected asset and note cash flows, and operating fees | Zero simplified issuer or SPV residual NPV |

The repack is a simple cash-pass-through representation. No swap, collateral liquidation, secured-funding haircut or margining process is present.

## Conventions

- Dates advance in three-calendar-month increments from the valuation date.
- Each accrual period has a fixed year fraction of 0.25.
- No business-day adjustment or holiday calendar is applied.
- All coupons are quarterly. Terms must contain a whole number of quarters.
- Default during a quarter settles at that quarter's payment date.
- No accrued coupon is paid for an interval in which default occurs.
- Recovery is a constant percentage of note notional.
- Discounting is continuous at one flat annual rate.
- Valuation cash flows are probability-weighted expected values. Separate deterministic event paths show undiscounted contractual payoffs.

## Inputs and units

The immutable `StructureTerms` data class contains all model terms. JSON keys are validated, and unknown terms are rejected.

| Field | Unit | Use |
|---|---|---|
| `notional` | Currency | Note and reference-asset face amount |
| `term_years` | Years | Maturity, restricted to whole quarters |
| `issue_price_pct` | Percent of notional | Investor subscription amount |
| `coupon_rate_pct` | Annual percent | Note coupon |
| `credit_spread_bps` | Basis points | Hazard-rate approximation |
| `recovery_rate_pct` | Percent | Recovery on default |
| `discount_rate_pct` | Annual percent | Flat continuous discounting |
| `funding_rate_pct` | Annual percent | CLN coupon-component presentation only |
| `reference_coupon_rate_pct` | Annual percent | Repack reference-bond coupon |
| `reference_price_pct` | Percent of notional | Repack initial asset purchase |
| `annual_fee_bps` | Basis points | Repack expected operating fee |

Recovery must be at least zero and below 100%. A 100% input is excluded because loss given default is the denominator of the hazard approximation.

## Credit model

Let \(s\) be the credit spread as a decimal and \(R\) the recovery rate. The annual constant hazard rate is

\[
\lambda = \frac{s}{1-R}
\]

This is a spread/LGD approximation. It is not a numerical calibration to CDS premium and protection legs.

For quarterly payment time \(t_i\), survival probability is

\[
S_i = \exp(-\lambda t_i)
\]

Set \(S_0=1\). Default probability allocated to quarter \(i\) is

\[
q_i = S_{i-1}-S_i
\]

The engine therefore preserves the probability identity

\[
\sum_{i=1}^{n}q_i+S_n=1
\]

These probabilities are risk-neutral-style quantities implied by the selected spread and recovery assumption. They should not be presented as forecasts of realised default.

## Discounting

For flat continuously compounded annual discount rate \(r\), the payment-date discount factor is

\[
D_i = \exp(-rt_i)
\]

All expected coupons, recovery and principal are discounted at the scheduled quarterly payment date. The model contains no separate discount, funding or credit curves.

## CLN expected cash flows

Let \(N\) be notional, \(c\) the annual note coupon, \(\Delta=0.25\), and \(I_i\) equal one in the maturity quarter and zero otherwise.

Expected cash flow at payment date \(i\) is

\[
CF_i^{note}
=Nc\Delta S_i+NRq_i+I_iNS_i
\]

The first term is the coupon conditional on survival to the payment date. The second term is recovery for defaults allocated to the preceding interval. The final term is principal redemption conditional on survival to maturity.

No accrued coupon is paid on default. Recovery is placed on the next payment date rather than the unobserved default date.

The note present value is

\[
PV^{note}=\sum_{i=1}^{n}D_iCF_i^{note}
\]

If issue price is \(P_0\) percent of notional, investor NPV is

\[
NPV^{investor}=PV^{note}-N\frac{P_0}{100}
\]

Define the risky coupon annuity in currency units as

\[
A=N\sum_{i=1}^{n}\Delta S_iD_i
\]

The CLN fair coupon is the annual coupon rate that makes investor NPV zero.

\[
c^*=
\frac{N(P_0/100)-PV^{principal+recovery}}{A}
\]

This is an indicative model coupon under the stated assumptions. It is not an executable market coupon.

### CLN issuer presentation

Initial issuer cash flow is the note issue amount. Subsequent issuer cash flows are the negatives of expected contractual note cash flows. The resulting issuer NPV is the opposite of investor NPV within this limited note-leg view.

The `funding_rate_pct` input decomposes expected coupon into

\[
CF_i^{funding}=Nf\Delta S_i
\]

and

\[
CF_i^{credit\ margin}=N(c-f)\Delta S_i
\]

This decomposition is descriptive. The engine does not model collateral investment, hedge purchase, issuer funding costs or secured-funding cash flows.

## Simple repack expected cash flows

The repack mode assumes the reference asset and issued note share notional, default probability, recovery and maturity. Let \(c_b\) be the annual reference coupon and \(g\) the annual operating fee.

Expected reference-asset cash flow is

\[
CF_i^{asset}
=Nc_b\Delta S_i+NRq_i+I_iNS_i
\]

Expected operating fee is

\[
Fee_i=Ng\Delta S_i
\]

The expected net issuer or SPV cash flow after issuance is

\[
CF_i^{SPV}=CF_i^{asset}-CF_i^{note}-Fee_i
\]

Initial residual cash flow equals note proceeds less the reference-asset purchase amount.

\[
CF_0^{SPV}
=N\frac{P_0}{100}-N\frac{P_b}{100}
\]

The repack fair coupon solves

\[
CF_0^{SPV}+
PV^{asset}-PV^{principal+recovery}-PV^{fees}-c^*A=0
\]

This represents a simple cash-pass-through note. It does not include a swap, bond-CDS basis, collateral sale, liquidation haircut, payment-priority waterfall or enforcement process.

## Reported metrics

The base-case result includes

- Annual hazard rate, loss given default and survival to maturity
- Cumulative model-implied default probability and undiscounted expected loss
- Indicative fair coupon and its NPV target
- Expected coupon, principal, recovery and total cash flows by payment date
- Investor value per 100 notional and investor NPV
- Simplified issuer or SPV NPV and component PVs
- Validation result and detailed check values

`investor_value_pct` divides expected discounted note cash flows by notional. It is not divided by the entered issue price.

## Deterministic credit-event paths

The analysis also generates undiscounted investor payoff paths for default at 1.25, 3.00 and 4.75 years, together with a no-default path. These paths are separate from the expected-value calculation.

For a stated event time \(\tau\), coupons are paid only on quarterly dates strictly before \(\tau\). Recovery is paid on the first quarterly date strictly after \(\tau\). The path contains no principal payment and no cash flows after recovery. If there is no credit event, every coupon and principal are paid as scheduled.

A default exactly on a coupon date does not receive that date's coupon. Its recovery settles on the following quarterly date. An event at maturity therefore settles one quarter after contractual maturity under this mechanical convention.

The paths report dated cash flows, total investor distributions and net undiscounted cash flow after subscription. They do not report XIRR, expected return or event probability.

## Scenarios and sensitivities

Named scenarios override selected structure terms and rerun the full valuation. The example contains tighter-credit, wider-credit and default-stress parameter sets. “Default stress” is a label for higher spread, lower recovery and a higher discount rate. It is distinct from the deterministic credit-event paths described above.

The two-dimensional sensitivity grid reruns the model for every selected credit-spread and recovery pair. Because hazard is recalculated as spread divided by LGD at every grid point, changing recovery also changes hazard. Results should not be interpreted as recovery sensitivities with hazard held constant.

Each grid row reports hazard, fair coupon, survival, expected loss, investor value, investor NPV and issuer NPV.

## Output and data workflow

The command-line workflow writes a detailed JSON result and a sensitivity CSV. It also stores the input payload and normalised scenario summaries in SQLite.

The SQLite schema separates model runs from scenario results. Foreign keys are enabled, run insertion is atomic and comparison queries are parameterised. This is a lightweight run history, not a booking system or trade database.

`outputs/excel_crosscheck.json` exposes a small set of CLN metrics in decimal or currency form for workbook QA. The prebuilt Excel file is located at `excel/Credit_Structuring_Cash_Flow_Engine.xlsx`. Python remains the calculation source of truth.

## Automated controls

Every base valuation performs these checks.

| Check | Purpose |
|---|---|
| Probability mass | Default mass plus maturity survival equals one |
| Survival monotonicity | Survival probability never increases |
| Schedule count | Number of rows matches the requested quarterly term |
| Cash-flow reconciliation | Coupon, recovery and principal sum to total note cash flow |
| Fair-coupon target | Fair coupon reaches the relevant NPV target within tolerance |
| Finite outputs | Reported numeric outputs contain no NaN or infinity |

The unit suite also checks hazard arithmetic, payment dates, credit-event settlement, spread directionality, frequency rejection, repack zero-residual coupon, SQLite comparison ordering and generated artefacts.

## Model risks and limitations

- The constant hazard estimate uses `spread / LGD` and omits full CDS calibration conventions.
- One flat continuous discount rate replaces observable discount and funding curves.
- Expected valuation uses probability-weighted cash flows. Deterministic payoff paths do not replace a distributional or Monte Carlo risk analysis.
- Quarterly settlement is a modelling convention, not a legal or operational settlement forecast.
- No accrued coupon is paid during a default interval, regardless of transaction-specific documentation.
- Recovery is deterministic and independent of default timing, rates and market conditions.
- The CLN view excludes issuer default, hedge cost, collateral return, wrong-way risk and counterparty exposure.
- The repack excludes swaps, currency conversion, embedded options, liquidation, security enforcement and detailed payment priorities.
- Liquidity, bid-offer, bond-CDS basis, CVA, FVA, MVA, capital, tax and accounting effects are outside scope.
- There is no live market-data ingestion, calibration governance, independent price verification or production change control.

## Reproducibility and review

Inputs are human-readable JSON. Core calculations are deterministic functions. Generated results include the model methodology, terms, cash-flow rows and check values. SQLite preserves run identifiers and timestamps for comparison. Git and CI provide an auditable history of code and tests.

If I took this further, the first step would be a calibrated CDS term structure with real date conventions. After that: XIRR on the event paths, and an asset-swap repack with an actual swap leg.

## Licence

Released under the MIT License.
