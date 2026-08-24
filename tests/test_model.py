from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from credit_structuring_lab.cli import main  # noqa: E402
from credit_structuring_lab.model import (  # noqa: E402
    StructureTerms,
    build_quarterly_schedule,
    constant_hazard_rate,
    deterministic_credit_event_payoff,
    fair_coupon_rate_pct,
    price_structure,
)
from credit_structuring_lab.store import compare_runs, persist_run  # noqa: E402


class CreditLinkedNoteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.terms = StructureTerms(
            name="Unit test CLN",
            mode="cln",
            valuation_date="2026-08-24",
            notional=1_000_000.0,
            term_years=5.0,
            payments_per_year=4,
            issue_price_pct=100.0,
            coupon_rate_pct=7.0,
            credit_spread_bps=240.0,
            recovery_rate_pct=40.0,
            discount_rate_pct=4.0,
            funding_rate_pct=4.0,
        )

    def test_hazard_calibration(self) -> None:
        self.assertAlmostEqual(constant_hazard_rate(self.terms), 0.04, places=12)

    def test_schedule_and_probability_mass(self) -> None:
        schedule = build_quarterly_schedule(self.terms)
        self.assertEqual(len(schedule), 20)
        self.assertEqual(schedule[0]["payment_date"], "2026-11-24")
        self.assertEqual(schedule[-1]["payment_date"], "2031-08-24")
        result = price_structure(self.terms)
        rows = result["cashflows"]
        probability_mass = sum(row["default_probability"] for row in rows)
        probability_mass += rows[-1]["survival_probability"]
        self.assertAlmostEqual(probability_mass, 1.0, places=12)
        self.assertTrue(result["validation"]["all_passed"])

    def test_fair_coupon_zeroes_investor_npv(self) -> None:
        fair_coupon = fair_coupon_rate_pct(self.terms)
        fair_terms = StructureTerms.from_dict(
            {**self.terms.to_dict(), "coupon_rate_pct": fair_coupon}
        )
        result = price_structure(fair_terms)
        self.assertAlmostEqual(result["economics"]["investor_npv"], 0.0, places=6)

    def test_wider_spread_reduces_fixed_coupon_value(self) -> None:
        base_value = price_structure(self.terms)["economics"]["investor_value_pct"]
        wide_terms = StructureTerms.from_dict(
            {**self.terms.to_dict(), "credit_spread_bps": 600.0}
        )
        wide_value = price_structure(wide_terms)["economics"]["investor_value_pct"]
        self.assertLess(wide_value, base_value)

    def test_non_quarterly_input_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "quarterly"):
            StructureTerms.from_dict(
                {**self.terms.to_dict(), "payments_per_year": 2}
            )

    def test_credit_event_has_one_redemption_and_no_later_cashflows(self) -> None:
        path = deterministic_credit_event_payoff(
            self.terms,
            default_time_years=1.25,
            recovery_rate_pct=35.0,
        )
        redemptions = [
            cashflow
            for cashflow in path["cashflows"]
            if cashflow["type"] in {"recovery", "principal"}
        ]
        coupons = [
            cashflow
            for cashflow in path["cashflows"]
            if cashflow["type"] == "coupon"
        ]
        self.assertEqual(len(redemptions), 1)
        self.assertEqual(redemptions[0]["type"], "recovery")
        self.assertEqual(redemptions[0]["time_years"], 1.5)
        self.assertEqual(redemptions[0]["amount"], 350_000.0)
        self.assertEqual(len(coupons), 4)
        self.assertTrue(all(coupon["time_years"] < 1.25 for coupon in coupons))
        self.assertTrue(
            all(cashflow["time_years"] <= 1.5 for cashflow in path["cashflows"])
        )
        self.assertFalse(
            any(
                cashflow["type"] == "coupon" and cashflow["time_years"] >= 1.25
                for cashflow in path["cashflows"]
            )
        )


class RepackTests(unittest.TestCase):
    def test_fair_coupon_zeroes_spv_npv(self) -> None:
        terms = StructureTerms(
            name="Par bond repack",
            mode="repack",
            notional=2_000_000.0,
            term_years=4.0,
            issue_price_pct=100.0,
            reference_price_pct=100.0,
            coupon_rate_pct=5.0,
            reference_coupon_rate_pct=6.25,
            annual_fee_bps=25.0,
            credit_spread_bps=300.0,
            recovery_rate_pct=40.0,
            discount_rate_pct=4.25,
        )
        fair_coupon = fair_coupon_rate_pct(terms)
        self.assertAlmostEqual(fair_coupon, 6.0, places=10)
        fair_terms = StructureTerms.from_dict(
            {**terms.to_dict(), "coupon_rate_pct": fair_coupon}
        )
        result = price_structure(fair_terms)
        self.assertAlmostEqual(result["economics"]["issuer_npv"], 0.0, places=6)
        self.assertTrue(result["validation"]["all_passed"])


class StoreAndCliTests(unittest.TestCase):
    def test_insert_and_compare_runs(self) -> None:
        scenario = {
            "scenario": "Base case",
            "credit_spread_bps": 250.0,
            "recovery_rate_pct": 40.0,
            "discount_rate_pct": 4.0,
            "coupon_rate_pct": 7.0,
            "hazard_rate_pct": 4.1666666667,
            "fair_coupon_rate_pct": 6.8,
            "survival_to_maturity_pct": 81.2,
            "investor_value_pct": 100.7,
            "investor_npv": 7_000.0,
            "issuer_npv": -7_000.0,
            "validation_passed": True,
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            database = Path(temporary_directory) / "runs.sqlite"
            persist_run(
                database,
                run_id="run-old",
                generated_at="2026-08-24T10:00:00Z",
                model_name="Test",
                mode="cln",
                input_payload={"mode": "cln"},
                scenarios=[scenario],
            )
            newer = {**scenario, "investor_npv": 8_000.0}
            persist_run(
                database,
                run_id="run-new",
                generated_at="2026-08-24T11:00:00Z",
                model_name="Test",
                mode="cln",
                input_payload={"mode": "cln"},
                scenarios=[newer],
            )
            rows = compare_runs(database, scenario_name="Base case")
            self.assertEqual([row["run_id"] for row in rows], ["run-new", "run-old"])
            self.assertEqual(rows[0]["investor_npv"], 8_000.0)

    def test_cli_generates_json_csv_and_sqlite(self) -> None:
        payload = {
            "name": "CLI test",
            "mode": "cln",
            "valuation_date": "2026-08-24",
            "notional": 1000000,
            "term_years": 1,
            "payments_per_year": 4,
            "issue_price_pct": 100,
            "coupon_rate_pct": 7,
            "credit_spread_bps": 250,
            "recovery_rate_pct": 40,
            "discount_rate_pct": 4,
            "funding_rate_pct": 4,
            "sensitivity": {
                "credit_spreads_bps": [200, 400],
                "recovery_rates_pct": [30, 50]
            }
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            input_path = root / "input.json"
            output_dir = root / "outputs"
            input_path.write_text(json.dumps(payload), encoding="utf-8")
            exit_code = main(
                ["generate", "--input", str(input_path), "--output-dir", str(output_dir)]
            )
            self.assertEqual(exit_code, 0)
            self.assertTrue((output_dir / "base_case_results.json").exists())
            self.assertTrue((output_dir / "sensitivity.csv").exists())
            self.assertTrue((output_dir / "model_runs.sqlite").exists())
            self.assertTrue((output_dir / "excel_crosscheck.json").exists())
            result = json.loads(
                (output_dir / "base_case_results.json").read_text(encoding="utf-8")
            )
            self.assertTrue(result["base_case"]["validation"]["all_passed"])
            self.assertEqual(len(result["sensitivity"]), 4)
            self.assertEqual(len(result["default_paths"]["paths"]), 4)
            crosscheck = json.loads(
                (output_dir / "excel_crosscheck.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                set(crosscheck),
                {
                    "model_price_pct",
                    "fair_coupon",
                    "default_probability",
                    "investor_npv",
                    "issuer_npv",
                    "validation_ok",
                },
            )
            self.assertTrue(crosscheck["validation_ok"])

    def test_cli_generates_named_repack_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory) / "outputs"
            exit_code = main(
                [
                    "generate",
                    "--input",
                    str(PROJECT_ROOT / "examples" / "repack_case.json"),
                    "--output-dir",
                    str(output_dir),
                    "--output-prefix",
                    "repack_case",
                ]
            )
            self.assertEqual(exit_code, 0)
            results_path = output_dir / "repack_case_results.json"
            self.assertTrue(results_path.exists())
            self.assertTrue((output_dir / "repack_case_sensitivity.csv").exists())
            result = json.loads(results_path.read_text(encoding="utf-8"))
            self.assertEqual(result["base_case"]["terms"]["mode"], "repack")
            self.assertTrue(result["base_case"]["validation"]["all_passed"])


if __name__ == "__main__":
    unittest.main()
