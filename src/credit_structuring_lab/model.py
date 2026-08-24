"""Reduced-form analytics for a credit-linked note and a simple bond repack.

The implementation deliberately keeps the assumptions visible.  Default follows a
constant hazard process calibrated with the market shorthand
``hazard = credit spread / loss given default``.  Cash flows are expected values,
not Monte Carlo paths, and a default is settled on the next quarterly payment date.
"""

from __future__ import annotations

import calendar
import math
from dataclasses import asdict, dataclass, replace
from datetime import date
from typing import Any, Iterable, Mapping, Sequence


@dataclass(frozen=True)
class StructureTerms:
    """User-facing structure terms.

    Rates ending in ``_pct`` are entered as percentages.  Prices are percentages
    of notional and credit spreads or fees ending in ``_bps`` are basis points.
    """

    name: str = "Base case"
    mode: str = "cln"
    valuation_date: str = "2026-08-24"
    notional: float = 1_000_000.0
    term_years: float = 5.0
    payments_per_year: int = 4
    issue_price_pct: float = 100.0
    coupon_rate_pct: float = 7.0
    credit_spread_bps: float = 250.0
    recovery_rate_pct: float = 40.0
    discount_rate_pct: float = 4.0
    funding_rate_pct: float = 4.0
    reference_coupon_rate_pct: float = 6.0
    reference_price_pct: float = 100.0
    annual_fee_bps: float = 0.0

    @classmethod
    def from_dict(cls, values: Mapping[str, Any]) -> "StructureTerms":
        """Create terms from a JSON-style mapping and reject unknown model keys."""

        allowed_non_term_keys = {"description", "scenarios", "sensitivity"}
        unknown = (
            set(values)
            - set(cls.__dataclass_fields__)
            - allowed_non_term_keys
        )
        if unknown:
            raise ValueError("unknown input term(s): " + ", ".join(sorted(unknown)))
        model_values = {
            key: value
            for key, value in values.items()
            if key in cls.__dataclass_fields__
        }
        terms = cls(**model_values)
        terms = replace(terms, mode=str(terms.mode).lower().strip())
        validate_terms(terms)
        return terms

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def validate_terms(terms: StructureTerms) -> None:
    """Raise ``ValueError`` when terms are outside the model's scope."""

    errors: list[str] = []
    if terms.mode not in {"cln", "repack"}:
        errors.append("mode must be 'cln' or 'repack'")
    try:
        date.fromisoformat(terms.valuation_date)
    except (TypeError, ValueError):
        errors.append("valuation_date must use ISO format YYYY-MM-DD")
    if not _is_finite_positive(terms.notional):
        errors.append("notional must be a positive finite number")
    if not _is_finite_positive(terms.term_years):
        errors.append("term_years must be a positive finite number")
    elif not math.isclose(terms.term_years * 4.0, round(terms.term_years * 4.0), abs_tol=1e-9):
        errors.append("term_years must resolve to a whole number of quarters")
    if terms.payments_per_year != 4:
        errors.append("this version supports quarterly payments only")
    if not _between(terms.recovery_rate_pct, 0.0, 100.0, include_upper=False):
        errors.append("recovery_rate_pct must be at least 0 and below 100")
    if not _is_finite_non_negative(terms.credit_spread_bps):
        errors.append("credit_spread_bps must be a finite non-negative number")
    if not _is_finite_non_negative(terms.coupon_rate_pct):
        errors.append("coupon_rate_pct must be a finite non-negative number")
    if not _is_finite_non_negative(terms.reference_coupon_rate_pct):
        errors.append("reference_coupon_rate_pct must be a finite non-negative number")
    if not _is_finite_non_negative(terms.annual_fee_bps):
        errors.append("annual_fee_bps must be a finite non-negative number")
    if not _between(terms.issue_price_pct, 0.0, 500.0, include_lower=False):
        errors.append("issue_price_pct must be above 0 and no more than 500")
    if not _between(terms.reference_price_pct, 0.0, 500.0, include_lower=False):
        errors.append("reference_price_pct must be above 0 and no more than 500")
    if not _between(terms.discount_rate_pct, -99.0, 100.0):
        errors.append("discount_rate_pct must be finite and between -99 and 100")
    if not _between(terms.funding_rate_pct, -99.0, 100.0):
        errors.append("funding_rate_pct must be finite and between -99 and 100")
    if errors:
        raise ValueError("Invalid structure terms: " + "; ".join(errors))


def constant_hazard_rate(terms: StructureTerms) -> float:
    """Return the annual constant hazard rate as a decimal."""

    spread = terms.credit_spread_bps / 10_000.0
    loss_given_default = 1.0 - terms.recovery_rate_pct / 100.0
    return spread / loss_given_default


def build_quarterly_schedule(terms: StructureTerms) -> list[dict[str, Any]]:
    """Build a quarterly schedule using calendar month increments."""

    start = date.fromisoformat(terms.valuation_date)
    quarter_count = int(round(terms.term_years * 4.0))
    return [
        {
            "period": period,
            "payment_date": _add_months(start, period * 3).isoformat(),
            "year_fraction": 0.25,
            "time_years": period / 4.0,
        }
        for period in range(1, quarter_count + 1)
    ]


def expected_cashflows(
    terms: StructureTerms, coupon_rate_pct: float | None = None
) -> list[dict[str, Any]]:
    """Project expected quarterly note, reference asset, fee and issuer cash flows."""

    validate_terms(terms)
    coupon_rate = (
        terms.coupon_rate_pct if coupon_rate_pct is None else float(coupon_rate_pct)
    ) / 100.0
    if not math.isfinite(coupon_rate) or coupon_rate < 0.0:
        raise ValueError("coupon_rate_pct override must be finite and non-negative")

    hazard = constant_hazard_rate(terms)
    recovery = terms.recovery_rate_pct / 100.0
    discount_rate = terms.discount_rate_pct / 100.0
    funding_rate = terms.funding_rate_pct / 100.0
    reference_coupon_rate = terms.reference_coupon_rate_pct / 100.0
    fee_rate = terms.annual_fee_bps / 10_000.0
    schedule = build_quarterly_schedule(terms)
    maturity_period = len(schedule)
    previous_survival = 1.0
    rows: list[dict[str, Any]] = []

    for item in schedule:
        period = int(item["period"])
        time_years = float(item["time_years"])
        accrual = float(item["year_fraction"])
        survival = math.exp(-hazard * time_years)
        default_probability = previous_survival - survival
        discount_factor = math.exp(-discount_rate * time_years)

        note_coupon = terms.notional * coupon_rate * accrual * survival
        note_recovery = terms.notional * recovery * default_probability
        note_principal = terms.notional * survival if period == maturity_period else 0.0
        note_total = note_coupon + note_recovery + note_principal

        funding_coupon = terms.notional * funding_rate * accrual * survival
        credit_margin_coupon = note_coupon - funding_coupon

        if terms.mode == "repack":
            reference_coupon = (
                terms.notional * reference_coupon_rate * accrual * survival
            )
            reference_recovery = note_recovery
            reference_principal = note_principal
            fee = terms.notional * fee_rate * accrual * survival
        else:
            reference_coupon = 0.0
            reference_recovery = 0.0
            reference_principal = 0.0
            fee = 0.0
        reference_total = (
            reference_coupon + reference_recovery + reference_principal
        )
        issuer_net = (
            -note_total
            if terms.mode == "cln"
            else reference_total - note_total - fee
        )

        rows.append(
            {
                **item,
                "survival_probability": survival,
                "default_probability": default_probability,
                "discount_factor": discount_factor,
                "note_coupon_expected": note_coupon,
                "note_recovery_expected": note_recovery,
                "note_principal_expected": note_principal,
                "note_total_expected": note_total,
                "note_total_pv": note_total * discount_factor,
                "funding_coupon_component_expected": funding_coupon,
                "credit_margin_component_expected": credit_margin_coupon,
                "reference_coupon_expected": reference_coupon,
                "reference_recovery_expected": reference_recovery,
                "reference_principal_expected": reference_principal,
                "reference_total_expected": reference_total,
                "reference_total_pv": reference_total * discount_factor,
                "operating_fee_expected": fee,
                "operating_fee_pv": fee * discount_factor,
                "issuer_net_expected": issuer_net,
                "issuer_net_pv": issuer_net * discount_factor,
            }
        )
        previous_survival = survival
    return rows


def deterministic_credit_event_payoff(
    terms: StructureTerms,
    default_time_years: float | None,
    recovery_rate_pct: float | None = None,
) -> dict[str, Any]:
    """Build an undiscounted investor payoff path for one deterministic event time.

    Coupons are paid only on dates strictly before the credit event.  Recovery
    settles on the first quarterly date strictly after the event, and nothing is
    paid after that settlement.  ``None`` or an event after maturity is a
    no-default path with all coupons and principal paid as scheduled.
    """

    validate_terms(terms)
    recovery_pct = (
        terms.recovery_rate_pct
        if recovery_rate_pct is None
        else float(recovery_rate_pct)
    )
    if not _between(recovery_pct, 0.0, 100.0):
        raise ValueError("recovery_rate_pct must be finite and between 0 and 100")
    if default_time_years is not None:
        default_time_years = float(default_time_years)
        if not math.isfinite(default_time_years) or default_time_years < 0.0:
            raise ValueError("default_time_years must be finite and non-negative")

    schedule = build_quarterly_schedule(terms)
    credit_event = (
        default_time_years is not None
        and default_time_years <= terms.term_years + 1e-12
    )
    cashflows: list[dict[str, Any]] = [
        {
            "date": terms.valuation_date,
            "time_years": 0.0,
            "type": "subscription",
            "amount": -terms.notional * terms.issue_price_pct / 100.0,
        }
    ]
    coupon_amount = terms.notional * terms.coupon_rate_pct / 100.0 / 4.0
    settlement_date: str | None = None

    if credit_event:
        assert default_time_years is not None
        later_payment_dates = [
            item
            for item in schedule
            if float(item["time_years"]) > default_time_years + 1e-12
        ]
        if later_payment_dates:
            settlement = later_payment_dates[0]
        else:
            settlement_period = len(schedule) + 1
            start = date.fromisoformat(terms.valuation_date)
            settlement = {
                "period": settlement_period,
                "payment_date": _add_months(start, settlement_period * 3).isoformat(),
                "year_fraction": 0.25,
                "time_years": settlement_period / 4.0,
            }
        for item in schedule:
            if float(item["time_years"]) < default_time_years - 1e-12:
                cashflows.append(
                    {
                        "date": item["payment_date"],
                        "time_years": item["time_years"],
                        "type": "coupon",
                        "amount": coupon_amount,
                    }
                )
        settlement_date = str(settlement["payment_date"])
        cashflows.append(
            {
                "date": settlement_date,
                "time_years": settlement["time_years"],
                "type": "recovery",
                "amount": terms.notional * recovery_pct / 100.0,
            }
        )
    else:
        for item in schedule:
            cashflows.append(
                {
                    "date": item["payment_date"],
                    "time_years": item["time_years"],
                    "type": "coupon",
                    "amount": coupon_amount,
                }
            )
        maturity = schedule[-1]
        settlement_date = str(maturity["payment_date"])
        cashflows.append(
            {
                "date": settlement_date,
                "time_years": maturity["time_years"],
                "type": "principal",
                "amount": terms.notional,
            }
        )

    investor_distributions = sum(
        float(cashflow["amount"])
        for cashflow in cashflows
        if cashflow["type"] != "subscription"
    )
    subscription = -float(cashflows[0]["amount"])
    return {
        "default_time_years": default_time_years,
        "credit_event": credit_event,
        "recovery_rate_pct": recovery_pct,
        "settlement_date": settlement_date,
        "total_investor_payoff": investor_distributions,
        "net_undiscounted_cashflow": investor_distributions - subscription,
        "cashflows": cashflows,
    }


def fair_coupon_rate_pct(terms: StructureTerms) -> float:
    """Solve the mode-specific fair annual coupon.

    For a CLN, fair means zero investor NPV at the stated issue price.  For a
    repack, fair means zero issuer/SPV residual after buying the reference bond,
    paying note cash flows and paying the annual operating fee.
    """

    rows = expected_cashflows(terms, coupon_rate_pct=0.0)
    annuity = _coupon_annuity(terms, rows)
    if annuity <= 0.0:
        raise ValueError("coupon annuity is not positive")
    issue_amount = terms.notional * terms.issue_price_pct / 100.0
    principal_recovery_pv = sum(
        (row["note_recovery_expected"] + row["note_principal_expected"])
        * row["discount_factor"]
        for row in rows
    )
    if terms.mode == "cln":
        numerator = issue_amount - principal_recovery_pv
    else:
        reference_purchase = terms.notional * terms.reference_price_pct / 100.0
        reference_asset_pv = sum(row["reference_total_pv"] for row in rows)
        fee_pv = sum(row["operating_fee_pv"] for row in rows)
        numerator = (
            issue_amount
            - reference_purchase
            + reference_asset_pv
            - principal_recovery_pv
            - fee_pv
        )
    return numerator / annuity * 100.0


def price_structure(terms: StructureTerms) -> dict[str, Any]:
    """Calculate expected cash flows, valuation metrics and validation checks."""

    rows = expected_cashflows(terms)
    issue_amount = terms.notional * terms.issue_price_pct / 100.0
    note_cashflows_pv = sum(row["note_total_pv"] for row in rows)
    investor_npv = note_cashflows_pv - issue_amount
    reference_purchase = (
        terms.notional * terms.reference_price_pct / 100.0
        if terms.mode == "repack"
        else 0.0
    )
    reference_asset_pv = sum(row["reference_total_pv"] for row in rows)
    operating_fee_pv = sum(row["operating_fee_pv"] for row in rows)
    initial_issuer_cashflow = (
        issue_amount
        if terms.mode == "cln"
        else issue_amount - reference_purchase
    )
    issuer_npv = initial_issuer_cashflow + sum(row["issuer_net_pv"] for row in rows)
    hazard = constant_hazard_rate(terms)
    maturity_survival = rows[-1]["survival_probability"]
    expected_loss = (
        terms.notional
        * (1.0 - terms.recovery_rate_pct / 100.0)
        * (1.0 - maturity_survival)
    )
    fair_coupon = fair_coupon_rate_pct(terms)

    economics = {
        "issue_proceeds": issue_amount,
        "reference_asset_purchase": reference_purchase,
        "reference_asset_pv": reference_asset_pv,
        "note_coupon_pv": sum(
            row["note_coupon_expected"] * row["discount_factor"] for row in rows
        ),
        "note_principal_and_recovery_pv": sum(
            (row["note_recovery_expected"] + row["note_principal_expected"])
            * row["discount_factor"]
            for row in rows
        ),
        "note_cashflows_pv": note_cashflows_pv,
        "funding_coupon_component_pv": sum(
            row["funding_coupon_component_expected"] * row["discount_factor"]
            for row in rows
        ),
        "credit_margin_component_pv": sum(
            row["credit_margin_component_expected"] * row["discount_factor"]
            for row in rows
        ),
        "operating_fee_pv": operating_fee_pv,
        "investor_npv": investor_npv,
        "issuer_npv": issuer_npv,
        "investor_value_pct": note_cashflows_pv / terms.notional * 100.0,
    }
    metrics = {
        "hazard_rate_pct": hazard * 100.0,
        "loss_given_default_pct": 100.0 - terms.recovery_rate_pct,
        "survival_to_maturity_pct": maturity_survival * 100.0,
        "cumulative_default_probability_pct": (1.0 - maturity_survival) * 100.0,
        "undiscounted_expected_loss": expected_loss,
        "undiscounted_expected_loss_pct": expected_loss / terms.notional * 100.0,
        "fair_coupon_rate_pct": fair_coupon,
        "fair_coupon_target": (
            "zero investor NPV" if terms.mode == "cln" else "zero issuer/SPV NPV"
        ),
    }
    validation = _validation_checks(terms, rows, fair_coupon, economics)
    return {
        "terms": terms.to_dict(),
        "metrics": metrics,
        "economics": economics,
        "cashflows": rows,
        "validation": validation,
    }


def run_analysis(
    terms: StructureTerms,
    scenario_specs: Sequence[Mapping[str, Any]] | None = None,
    sensitivity_spec: Mapping[str, Sequence[float]] | None = None,
) -> dict[str, Any]:
    """Run the base valuation, named scenarios and a spread/recovery grid."""

    base = price_structure(terms)
    scenarios = [_scenario_summary("Base case", terms, base)]
    specs = list(scenario_specs) if scenario_specs is not None else _default_scenarios(terms)
    for spec in specs:
        scenario_name = str(spec.get("name", "Unnamed scenario"))
        overrides = spec.get("overrides")
        if overrides is None:
            overrides = {key: value for key, value in spec.items() if key != "name"}
        if not isinstance(overrides, Mapping):
            raise ValueError(f"scenario {scenario_name!r} overrides must be an object")
        scenario_terms = _terms_with_overrides(terms, overrides)
        scenarios.append(
            _scenario_summary(scenario_name, scenario_terms, price_structure(scenario_terms))
        )

    sensitivity = _sensitivity_rows(terms, sensitivity_spec)
    default_path_specs: list[tuple[str, float | None]] = [
        ("Default at 1.25 years", 1.25),
        ("Default at 3.00 years", 3.0),
        ("Default at 4.75 years", 4.75),
        ("No default", None),
    ]
    default_paths = {
        "settlement_convention": (
            "recovery on the first quarterly date after default; coupons only "
            "on preceding dates; no post-default cash flows"
        ),
        "paths": [
            {
                "scenario": scenario_name,
                **deterministic_credit_event_payoff(terms, default_time),
            }
            for scenario_name, default_time in default_path_specs
        ],
    }
    return {
        "schema_version": "1.0",
        "methodology": {
            "default_model": "constant hazard calibrated as spread divided by loss given default",
            "cashflow_timing": "quarterly; default recovery settles on the next payment date",
            "coupon_on_default": "no accrued coupon is paid in a default interval",
            "discounting": "continuous compounding at a flat annual discount rate",
            "cln_issuer_scope": "contractual note cash flows before external hedge or collateral economics",
            "repack_scope": "reference bond asset cash flows less note funding and operating fees",
        },
        "base_case": base,
        "scenarios": scenarios,
        "sensitivity": sensitivity,
        "default_paths": default_paths,
    }


def _validation_checks(
    terms: StructureTerms,
    rows: Sequence[Mapping[str, Any]],
    fair_coupon: float,
    economics: Mapping[str, float],
) -> dict[str, Any]:
    default_mass = sum(float(row["default_probability"]) for row in rows)
    ending_survival = float(rows[-1]["survival_probability"])
    probability_error = abs(default_mass + ending_survival - 1.0)
    survival_values = [1.0] + [float(row["survival_probability"]) for row in rows]
    monotonic = all(
        right <= left + 1e-14
        for left, right in zip(survival_values, survival_values[1:])
    )
    component_error = max(
        abs(
            float(row["note_total_expected"])
            - float(row["note_coupon_expected"])
            - float(row["note_recovery_expected"])
            - float(row["note_principal_expected"])
        )
        for row in rows
    )
    fair_rows = expected_cashflows(terms, coupon_rate_pct=fair_coupon)
    fair_note_pv = sum(float(row["note_total_pv"]) for row in fair_rows)
    issue_amount = terms.notional * terms.issue_price_pct / 100.0
    if terms.mode == "cln":
        fair_target_npv = fair_note_pv - issue_amount
    else:
        reference_purchase = terms.notional * terms.reference_price_pct / 100.0
        fair_target_npv = (
            issue_amount
            - reference_purchase
            + sum(float(row["issuer_net_pv"]) for row in fair_rows)
        )
    finite_values = all(
        math.isfinite(float(value))
        for row in rows
        for key, value in row.items()
        if key not in {"payment_date"}
    ) and all(math.isfinite(float(value)) for value in economics.values())
    npv_tolerance = max(1e-6, terms.notional * 1e-10)
    checks = [
        {
            "name": "probability_mass",
            "passed": probability_error <= 1e-12,
            "value": probability_error,
            "tolerance": 1e-12,
        },
        {
            "name": "survival_is_non_increasing",
            "passed": monotonic,
            "value": monotonic,
        },
        {
            "name": "quarterly_schedule_count",
            "passed": len(rows) == int(round(terms.term_years * 4.0)),
            "value": len(rows),
            "expected": int(round(terms.term_years * 4.0)),
        },
        {
            "name": "note_cashflow_components_reconcile",
            "passed": component_error <= 1e-8,
            "value": component_error,
            "tolerance": 1e-8,
        },
        {
            "name": "fair_coupon_reaches_target_npv",
            "passed": abs(fair_target_npv) <= npv_tolerance,
            "value": fair_target_npv,
            "tolerance": npv_tolerance,
        },
        {
            "name": "all_numeric_outputs_are_finite",
            "passed": finite_values,
            "value": finite_values,
        },
    ]
    return {
        "all_passed": all(bool(check["passed"]) for check in checks),
        "checks": checks,
    }


def _scenario_summary(
    scenario_name: str, terms: StructureTerms, result: Mapping[str, Any]
) -> dict[str, Any]:
    metrics = result["metrics"]
    economics = result["economics"]
    return {
        "scenario": scenario_name,
        "mode": terms.mode,
        "credit_spread_bps": terms.credit_spread_bps,
        "recovery_rate_pct": terms.recovery_rate_pct,
        "discount_rate_pct": terms.discount_rate_pct,
        "coupon_rate_pct": terms.coupon_rate_pct,
        "hazard_rate_pct": metrics["hazard_rate_pct"],
        "fair_coupon_rate_pct": metrics["fair_coupon_rate_pct"],
        "survival_to_maturity_pct": metrics["survival_to_maturity_pct"],
        "investor_value_pct": economics["investor_value_pct"],
        "investor_npv": economics["investor_npv"],
        "issuer_npv": economics["issuer_npv"],
        "validation_passed": result["validation"]["all_passed"],
    }


def _sensitivity_rows(
    terms: StructureTerms,
    spec: Mapping[str, Sequence[float]] | None,
) -> list[dict[str, Any]]:
    if spec is None:
        spreads: Iterable[float] = [100.0, 200.0, 350.0, 500.0, 750.0]
        recoveries: Iterable[float] = [20.0, 35.0, 50.0, 65.0]
    else:
        spreads = spec.get("credit_spreads_bps", [])
        recoveries = spec.get("recovery_rates_pct", [])
        if not spreads or not recoveries:
            raise ValueError(
                "sensitivity requires non-empty credit_spreads_bps and recovery_rates_pct"
            )
    rows: list[dict[str, Any]] = []
    for spread in spreads:
        for recovery in recoveries:
            scenario_terms = replace(
                terms,
                credit_spread_bps=float(spread),
                recovery_rate_pct=float(recovery),
            )
            validate_terms(scenario_terms)
            result = price_structure(scenario_terms)
            rows.append(
                {
                    "credit_spread_bps": float(spread),
                    "recovery_rate_pct": float(recovery),
                    "hazard_rate_pct": result["metrics"]["hazard_rate_pct"],
                    "fair_coupon_rate_pct": result["metrics"]["fair_coupon_rate_pct"],
                    "survival_to_maturity_pct": result["metrics"]["survival_to_maturity_pct"],
                    "expected_loss_pct": result["metrics"]["undiscounted_expected_loss_pct"],
                    "investor_value_pct": result["economics"]["investor_value_pct"],
                    "investor_npv": result["economics"]["investor_npv"],
                    "issuer_npv": result["economics"]["issuer_npv"],
                }
            )
    return rows


def _default_scenarios(terms: StructureTerms) -> list[dict[str, Any]]:
    return [
        {
            "name": "Tighter credit",
            "overrides": {"credit_spread_bps": max(25.0, terms.credit_spread_bps * 0.65)},
        },
        {
            "name": "Wider credit",
            "overrides": {"credit_spread_bps": terms.credit_spread_bps * 1.5},
        },
        {
            "name": "Default stress",
            "overrides": {
                "credit_spread_bps": terms.credit_spread_bps * 2.5,
                "recovery_rate_pct": max(5.0, terms.recovery_rate_pct - 20.0),
                "discount_rate_pct": terms.discount_rate_pct + 1.0,
            },
        },
    ]


def _terms_with_overrides(
    terms: StructureTerms, overrides: Mapping[str, Any]
) -> StructureTerms:
    unknown = set(overrides) - set(StructureTerms.__dataclass_fields__)
    if unknown:
        raise ValueError("unknown scenario term(s): " + ", ".join(sorted(unknown)))
    scenario_terms = replace(terms, **dict(overrides))
    scenario_terms = replace(scenario_terms, mode=str(scenario_terms.mode).lower().strip())
    validate_terms(scenario_terms)
    return scenario_terms


def _coupon_annuity(
    terms: StructureTerms, rows: Sequence[Mapping[str, Any]]
) -> float:
    return sum(
        terms.notional
        * float(row["year_fraction"])
        * float(row["survival_probability"])
        * float(row["discount_factor"])
        for row in rows
    )


def _add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _is_finite_positive(value: Any) -> bool:
    try:
        return math.isfinite(float(value)) and float(value) > 0.0
    except (TypeError, ValueError):
        return False


def _is_finite_non_negative(value: Any) -> bool:
    try:
        return math.isfinite(float(value)) and float(value) >= 0.0
    except (TypeError, ValueError):
        return False


def _between(
    value: Any,
    lower: float,
    upper: float,
    *,
    include_lower: bool = True,
    include_upper: bool = True,
) -> bool:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return False
    if not math.isfinite(numeric):
        return False
    lower_ok = numeric >= lower if include_lower else numeric > lower
    upper_ok = numeric <= upper if include_upper else numeric < upper
    return lower_ok and upper_ok
