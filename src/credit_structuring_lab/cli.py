"""Command-line interface for generating and comparing model runs."""

from __future__ import annotations

import argparse
import csv
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from .model import StructureTerms, run_analysis
from .store import compare_runs, persist_run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="credit-structuring-lab",
        description="Run transparent CLN and simple repack analytics",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate = subparsers.add_parser(
        "generate", help="calculate outputs and persist the scenario run"
    )
    generate.add_argument("--input", required=True, type=Path, help="input JSON file")
    generate.add_argument(
        "--output-dir", type=Path, default=Path("outputs"), help="output directory"
    )
    generate.add_argument(
        "--output-prefix",
        default="base_case",
        help="filename prefix; defaults preserve base_case_results.json and sensitivity.csv",
    )

    compare = subparsers.add_parser(
        "compare", help="compare scenario summaries stored in SQLite"
    )
    compare.add_argument(
        "--database",
        type=Path,
        default=Path("outputs/model_runs.sqlite"),
        help="SQLite model run store",
    )
    compare.add_argument(
        "--scenario",
        default="Base case",
        help="scenario name; use ALL to include every scenario",
    )
    compare.add_argument("--limit", type=int, default=20, help="maximum rows")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "generate":
        return _generate(args.input, args.output_dir, args.output_prefix)
    if args.command == "compare":
        scenario = None if args.scenario.upper() == "ALL" else args.scenario
        rows = compare_runs(args.database, scenario_name=scenario, limit=args.limit)
        print(json.dumps(rows, indent=2))
        return 0
    raise RuntimeError(f"unsupported command {args.command}")


def _generate(input_path: Path, output_dir: Path, output_prefix: str) -> int:
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", output_prefix) is None:
        raise ValueError(
            "output_prefix must contain only letters, numbers, underscores or hyphens"
        )
    with input_path.open("r", encoding="utf-8") as handle:
        payload: dict[str, Any] = json.load(handle)
    terms = StructureTerms.from_dict(payload)
    analysis = run_analysis(
        terms,
        scenario_specs=payload.get("scenarios"),
        sensitivity_spec=payload.get("sensitivity"),
    )
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    run_id = f"{generated_at[:10].replace('-', '')}-{uuid.uuid4().hex[:12]}"
    result = {
        "run": {"run_id": run_id, "generated_at": generated_at},
        **analysis,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    results_path = output_dir / f"{output_prefix}_results.json"
    sensitivity_name = (
        "sensitivity.csv"
        if output_prefix == "base_case"
        else f"{output_prefix}_sensitivity.csv"
    )
    sensitivity_path = output_dir / sensitivity_name
    database_path = output_dir / "model_runs.sqlite"
    _write_json(results_path, result)
    _write_sensitivity_csv(sensitivity_path, analysis["sensitivity"])
    crosscheck_path: Path | None = None
    if terms.mode == "cln" and output_prefix == "base_case":
        crosscheck_path = output_dir / "excel_crosscheck.json"
        _write_json(crosscheck_path, _excel_crosscheck(analysis))
    persist_run(
        database_path,
        run_id=run_id,
        generated_at=generated_at,
        model_name=terms.name,
        mode=terms.mode,
        input_payload=payload,
        scenarios=analysis["scenarios"],
    )
    generated_files = {
        "run_id": run_id,
        "results": str(results_path),
        "sensitivity": str(sensitivity_path),
        "database": str(database_path),
        "validation_passed": analysis["base_case"]["validation"]["all_passed"],
    }
    if crosscheck_path is not None:
        generated_files["excel_crosscheck"] = str(crosscheck_path)
    print(json.dumps(generated_files, indent=2))
    return 0


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _write_sensitivity_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        raise ValueError("sensitivity output is empty")
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def _excel_crosscheck(analysis: Mapping[str, Any]) -> dict[str, Any]:
    base_case = analysis["base_case"]
    metrics = base_case["metrics"]
    economics = base_case["economics"]
    return {
        "model_price_pct": economics["investor_value_pct"] / 100.0,
        "fair_coupon": metrics["fair_coupon_rate_pct"] / 100.0,
        "default_probability": metrics["cumulative_default_probability_pct"] / 100.0,
        "investor_npv": economics["investor_npv"],
        "issuer_npv": economics["issuer_npv"],
        "validation_ok": bool(base_case["validation"]["all_passed"]),
    }

if __name__ == "__main__":
    raise SystemExit(main())
