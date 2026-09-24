# Incident rules

Documented fully in M4. Thresholds live in `config/engine.json`.

## Detection (summary)

| Pattern | Rule |
|---|---|
| Zone incident | ≥ 3 distinct `actor_hash` in one zone within 10 min |
| Campus-wide | ≥ 3 zones each with ≥ 2 distinct actors within 15 min |
| App-specific | ≥ 70% same app across ≥ 3 zones → `provider_side_suspected` |

Reports are weighted by `report.weight`. Ops Ack / Investigating / Resolved buttons only store timestamps, never who pressed them.
