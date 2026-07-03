# Smart Brain Flow

This is the intended controller architecture for SimForge. Chat is the primary interface; every other pane is a tool surface.

```mermaid
flowchart TD
  A["User sends chat message"] --> B["Conversation Gate"]
  B -->|"Greeting / thanks / small talk"| C["Friendly animated reply only"]
  B -->|"Engineering intent"| D["Intent Router"]

  D --> E["Detect domain"]
  E --> E1["Circuits"]
  E --> E2["Structural"]
  E --> E3["Thermal"]
  E --> E4["Aerodynamics"]
  E --> E5["Control"]
  E --> E6["Materials"]
  E --> E7["Power Systems"]

  D --> F["Detect problem type"]
  F --> F1["Design"]
  F --> F2["Analysis"]
  F --> F3["Simulation"]
  F --> F4["Parameter update"]
  F --> F5["Explanation only"]

  D --> G["Check required inputs"]
  G -->|"Missing critical values"| H["Ask one focused clarification"]
  G -->|"Enough information"| I["Create / update model"]

  I --> J["Select tool"]
  J --> J1["Deterministic solver"]
  J --> J2["Groq reasoning"]
  J --> J3["Guardrail calculator"]
  J --> J4["Connector / material database"]

  J --> K["Run workflow"]
  K --> L["Update Model pane"]
  K --> M["Update Schematic / visualization"]
  K --> N["Update Results pane"]
  K --> O["Write animated chat summary"]

  O --> P["Suggest next action"]
  P --> P1["Tune a parameter"]
  P --> P2["Run comparison"]
  P --> P3["Explain result"]
  P --> P4["Export / save"]
```

## Implementation Rules

- Never run a default solver unless the detected problem type matches that solver.
- Always show the detected category and planned action in chat.
- Ask for clarification only when a missing value dominates the answer.
- Use deterministic guardrails for common high-risk engineering tasks.
- Keep tool panes synchronized with chat decisions.
