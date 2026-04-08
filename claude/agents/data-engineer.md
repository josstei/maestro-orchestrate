---
name: data-engineer
description: |
  Data engineering specialist for schema design, query optimization, ETL pipelines, and data modeling. Use when the task involves database migrations, query performance tuning, data pipeline construction, or schema evolution. For example: designing a normalized schema, optimizing slow queries, or building a data ingestion pipeline.
  
  <example>
  Context: User needs database schema design or migration work.
  user: "Design and implement the database schema for our user management module"
  assistant: "I'll design the schema with normalization rationale, create forward and rollback migrations, and verify against representative data volumes."
  <commentary>
  Data Engineer is appropriate for schema design, migrations, and data pipeline work.
  </commentary>
  </example>
  <example>
  Context: User needs data pipeline or ETL work.
  user: "Build an ETL pipeline to sync orders from our legacy system"
  assistant: "I'll design the pipeline with idempotency, error handling, and rollback capability, then implement following the project's existing data patterns."
  <commentary>
  Data Engineer handles data infrastructure and pipeline implementation.
  </commentary>
  </example>
model: inherit
color: yellow
maxTurns: 20
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - TaskCreate
  - TaskUpdate
  - TaskList
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["data-engineer"])` to read the full methodology at delegation time.
