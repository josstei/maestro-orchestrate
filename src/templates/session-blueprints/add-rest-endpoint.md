---
{
  "id": "add-rest-endpoint",
  "title": "Add REST Endpoint",
  "phases": [
    {
      "name": "Design endpoint contract",
      "agent": "architect",
      "parallel": false,
      "blocked_by": []
    },
    {
      "name": "Specify request and response API shape",
      "agent": "api-designer",
      "parallel": false,
      "blocked_by": [1]
    },
    {
      "name": "Implement endpoint behavior",
      "agent": "coder",
      "parallel": false,
      "blocked_by": [2]
    },
    {
      "name": "Add endpoint coverage",
      "agent": "tester",
      "parallel": false,
      "blocked_by": [3]
    },
    {
      "name": "Review endpoint changes",
      "agent": "code-reviewer",
      "parallel": false,
      "blocked_by": [4]
    }
  ],
  "design_outline": "Define the route contract, update the implementation behind the existing application boundary, cover success and failure behavior, and review the resulting API surface before delivery."
}
---
# Add REST Endpoint

Use this blueprint for API work that adds a new REST endpoint to an existing service.
