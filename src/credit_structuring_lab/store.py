"""SQLite persistence for comparing scenario summaries across model runs."""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any, Mapping


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL,
    model_name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('cln', 'repack')),
    input_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenario_results (
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    scenario_order INTEGER NOT NULL,
    scenario_name TEXT NOT NULL,
    credit_spread_bps REAL NOT NULL,
    recovery_rate_pct REAL NOT NULL,
    discount_rate_pct REAL NOT NULL,
    coupon_rate_pct REAL NOT NULL,
    hazard_rate_pct REAL NOT NULL,
    fair_coupon_rate_pct REAL NOT NULL,
    survival_to_maturity_pct REAL NOT NULL,
    investor_value_pct REAL NOT NULL,
    investor_npv REAL NOT NULL,
    issuer_npv REAL NOT NULL,
    validation_passed INTEGER NOT NULL CHECK (validation_passed IN (0, 1)),
    PRIMARY KEY (run_id, scenario_order)
);

CREATE INDEX IF NOT EXISTS idx_scenario_comparison
ON scenario_results (scenario_name, run_id);
"""


# This parameterised query is the canonical comparison query used by the CLI.
# Pass the same scenario name twice, or None twice for every scenario, then a row limit.
COMPARE_RUNS_SQL = """
SELECT
    r.generated_at,
    r.run_id,
    r.model_name,
    r.mode,
    s.scenario_name,
    s.credit_spread_bps,
    s.recovery_rate_pct,
    s.fair_coupon_rate_pct,
    s.investor_value_pct,
    s.investor_npv,
    s.issuer_npv
FROM scenario_results AS s
JOIN runs AS r ON r.run_id = s.run_id
WHERE (? IS NULL OR s.scenario_name = ?)
ORDER BY r.generated_at DESC, s.scenario_order ASC
LIMIT ?
"""


def initialise_database(database_path: str | Path) -> None:
    """Create the run store schema if it does not already exist."""

    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as connection:
        with connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.executescript(SCHEMA_SQL)


def persist_run(
    database_path: str | Path,
    *,
    run_id: str,
    generated_at: str,
    model_name: str,
    mode: str,
    input_payload: Mapping[str, Any],
    scenarios: list[Mapping[str, Any]],
) -> None:
    """Insert one model run and all of its scenario summary rows atomically."""

    initialise_database(database_path)
    with closing(sqlite3.connect(database_path)) as connection:
        with connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute(
                """
                INSERT INTO runs (run_id, generated_at, model_name, mode, input_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    generated_at,
                    model_name,
                    mode,
                    json.dumps(input_payload, sort_keys=True),
                ),
            )
            connection.executemany(
                """
                INSERT INTO scenario_results (
                    run_id,
                    scenario_order,
                    scenario_name,
                    credit_spread_bps,
                    recovery_rate_pct,
                    discount_rate_pct,
                    coupon_rate_pct,
                    hazard_rate_pct,
                    fair_coupon_rate_pct,
                    survival_to_maturity_pct,
                    investor_value_pct,
                    investor_npv,
                    issuer_npv,
                    validation_passed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        run_id,
                        order,
                        scenario["scenario"],
                        scenario["credit_spread_bps"],
                        scenario["recovery_rate_pct"],
                        scenario["discount_rate_pct"],
                        scenario["coupon_rate_pct"],
                        scenario["hazard_rate_pct"],
                        scenario["fair_coupon_rate_pct"],
                        scenario["survival_to_maturity_pct"],
                        scenario["investor_value_pct"],
                        scenario["investor_npv"],
                        scenario["issuer_npv"],
                        int(bool(scenario["validation_passed"])),
                    )
                    for order, scenario in enumerate(scenarios)
                ],
            )


def compare_runs(
    database_path: str | Path,
    scenario_name: str | None = "Base case",
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return recent scenario rows for side-by-side run comparison."""

    if limit <= 0:
        raise ValueError("limit must be positive")
    initialise_database(database_path)
    with closing(sqlite3.connect(database_path)) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            COMPARE_RUNS_SQL,
            (scenario_name, scenario_name, int(limit)),
        ).fetchall()
    return [dict(row) for row in rows]
