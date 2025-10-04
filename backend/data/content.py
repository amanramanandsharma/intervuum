# data/content.py

# Keyed by role
RUBRICS = {
    "Senior Data Engineer": """
Evaluation Dimensions & Signals:
1) System Design: ingestion, storage, orchestration, reliability, cost/latency tradeoffs.
2) Data/SQL: window functions, joins, modeling, performance tuning.
3) Problem Solving: ambiguity handling, constraints, metrics, validation.
4) Behavioral: ownership, comms, collaboration, conflict handling.
Signals by level: Junior→Senior→Staff focus on scale, tradeoffs, SLOs, and measurable impact.
""".strip()
}

# Keyed by (candidate_name, role)
RESUMES = {
    ("Rohan Mehta", "Senior Data Engineer"): """
Rohan Mehta — Senior Data Engineer
- Led migration from batch ETL (Airflow+Spark) to streaming (Flink/Kafka) for order events (200K eps).
- Built SCD Type-2 dimensional model for customer & orders; reduced BI latency from 24h to 15m.
- Optimized Snowflake costs 30% via clustering, result caching, and pruning strategies.
- Designed CDC ingestion with Debezium + Kafka for operational DBs (MySQL/Postgres).
- Mentored 4 engineers; drove incident postmortems and oncall runbooks.
""".strip()
}
