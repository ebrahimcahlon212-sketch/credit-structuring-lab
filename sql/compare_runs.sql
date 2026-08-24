-- Compare recent base-case valuations stored by the model CLI.
SELECT
    r.generated_at,
    r.model_name,
    r.mode,
    s.credit_spread_bps,
    s.recovery_rate_pct,
    s.fair_coupon_rate_pct,
    s.investor_value_pct,
    s.investor_npv,
    s.issuer_npv
FROM scenario_results AS s
JOIN runs AS r
    ON r.run_id = s.run_id
WHERE s.scenario_name = 'Base case'
ORDER BY r.generated_at DESC
LIMIT 20;
