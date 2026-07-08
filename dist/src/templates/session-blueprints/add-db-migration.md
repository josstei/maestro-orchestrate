---
{
  "id": "add-db-migration",
  "title": "Add Database Migration",
  "phases": [
    {
      "name": "Design schema migration",
      "agent": "data-engineer",
      "parallel": false,
      "blocked_by": []
    },
    {
      "name": "Implement migration and data access updates",
      "agent": "coder",
      "parallel": false,
      "blocked_by": [1]
    },
    {
      "name": "Add migration coverage",
      "agent": "tester",
      "parallel": false,
      "blocked_by": [2]
    },
    {
      "name": "Review migration safety",
      "agent": "code-reviewer",
      "parallel": false,
      "blocked_by": [3]
    }
  ],
  "design_outline": "Define the schema change and rollout constraints, implement the migration with application-level data access changes, cover forward and rollback-sensitive behavior, and review the safety of the database change."
}
---
# Add Database Migration

Use this blueprint for database changes that require a migration and coordinated application updates.
