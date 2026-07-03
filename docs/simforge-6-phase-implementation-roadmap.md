# SimForge 6-Phase Implementation Roadmap

Goal: build SimForge into "the Cursor for Engineering": a browser-based platform where users describe engineering problems in natural language, the system selects the right domain/tool, runs real simulations where available, falls back safely when needed, and returns synchronized chat, model, schematic, plots, metrics, and recommendations.

## Current Baseline

The current app is a strong MVP foundation:

- React/Vite frontend with onboarding, chat, formulated model, schematic/results, validation, TRIZ, and session-local history.
- Express/Groq backend with chat endpoint, guardrails, logging, prompt management, and initial external solver adapter endpoints.
- Deterministic analytical solvers for circuits, structural/physics mechanics, aerospace, thermal, control, materials, and power.
- Real external execution currently works for `ngspice` and SciPy mechanics on this machine.
- `python-control` is detected as available.
- CalculiX, XFOIL, OpenFOAM, Elmer, LTspice are not installed locally.
- `pandapower` is present but blocked by a Python dependency conflict.

This roadmap describes the files and structure needed to reach the final production vision.

---

## Target Folder Structure

```text
siva/
  src/
    App.jsx
    components/
      ReasoningPane.jsx
      ModelPane.jsx
      ResultsPane.jsx
      Onboarding.jsx
      TopBar.jsx
      ValidationDashboard.jsx
    services/
      chatOrchestrator.js
      solvers.js
      visualizationRegistry.js
      llmClient.js
      benchmarks.js
      triz.js
      memory.js
      connectors.js

  server/
    index.js
    prompts/
      system_prompt_groq.md
    services/
      externalSolvers.js
      solverRegistry.js              # create
      modelCompiler.js               # create
      resultParsers.js               # create
      simulationQueue.js             # create later
      validationRunner.js            # create
      groqService.js
      llmFactory.js
      engineeringGuardrails.js
    solvers/                         # create
      circuits/
        ngspiceAdapter.js
        netlistTemplates.js
        ngspiceParser.js
      structural/
        calculixAdapter.js
        inpTemplates.js
        ccxParser.js
      aerospace/
        xfoilAdapter.js
        xfoilTemplates.js
        xfoilParser.js
        openfoamAdapter.js
      thermal/
        elmerAdapter.js
        sifTemplates.js
        elmerParser.js
      control/
        pythonControlAdapter.js
      power/
        pandapowerAdapter.js
      physics/
        scipyMechanicsAdapter.js

  validation/
    benchmarks/
      circuits.json
      structural.json
      physics.json
      thermal.json
      aerospace.json
      control.json
      materials.json
      power.json
    reports/

  docker/
    Dockerfile.api                   # create
    Dockerfile.solvers               # create
    docker-compose.yml               # create

  docs/
    smart-brain-flow.md
    simforge-6-phase-implementation-roadmap.md
```

---

## Phase 1: Stabilize the Current MVP

Purpose: make the current app reliable before expanding more tools.

### Work Items

- Fix all current runtime errors and state-sync bugs.
- Ensure the flow works both ways:
  - Reasoning chat -> Formulated Model -> Schematic + Results
  - Formulated Model edits -> Reasoning chat + Schematic + Results
- Keep every domain launch clean with no fake default problem.
- Ensure chat greetings do not trigger solvers.
- Ensure Run/Stop typing behavior is stable.
- Ensure Clear resets chat, model, schematic, results, history for the active session.

### Files to Edit

- `src/App.jsx`
- `src/components/ReasoningPane.jsx`
- `src/components/ModelPane.jsx`
- `src/components/ResultsPane.jsx`
- `src/components/Onboarding.jsx`
- `src/services/chatOrchestrator.js`
- `src/services/solvers.js`
- `src/services/memory.js`

### Completion Criteria

- `npm run build` passes.
- No console errors during basic chat, parameter tuning, run simulation, clear, home, and domain switch.
- Voltage divider, pulley, spring-pulley, wing, thermal, PID, material, and transformer examples all produce synchronized panes.

---

## Phase 2: Build the Smart Brain Controller

Purpose: make chat the real command center, like Cursor/Codex for engineering.

### Work Items

- Replace ad hoc intent detection with a structured workflow controller.
- Add a unified `Intent` object:
  - `domain`
  - `problem_type`
  - `action`
  - `confidence`
  - `required_inputs`
  - `missing_inputs`
  - `solver_preference`
  - `visualization_type`
- Add problem schemas per domain.
- Add safe clarification logic: ask only when a missing input blocks correctness.
- Add parameter-tuning parser that can update any field from chat.
- Add model versioning so every run knows which model produced it.

### Files to Edit/Create

- Edit `src/services/chatOrchestrator.js`
- Edit `src/App.jsx`
- Edit `server/prompts/system_prompt_groq.md`
- Create `src/services/domainSchemas.js`
- Create `src/services/workflowController.js`
- Create `src/services/parameterUpdateEngine.js`
- Create `server/services/intentRouter.js`

### Completion Criteria

- Any user message produces one of:
  - friendly chat only
  - clarification
  - model creation
  - model update
  - solve/run
  - explanation
- No stale previous-problem answers.
- Every chat-triggered parameter change updates model, schematic, and results.

---

## Phase 3: Real Tool Execution Layer

Purpose: move from analytical MVP to real simulation tools with deterministic fallback.

### Work Items

- Turn `server/services/externalSolvers.js` into a modular adapter registry.
- Add per-domain solver adapters.
- Add deck/file generators:
  - `.cir` for ngspice/LTspice-compatible circuits
  - `.inp` for CalculiX
  - XFOIL command batch files
  - OpenFOAM case directories
  - Elmer `.sif`
  - Python scripts for `python-control`
  - Python scripts for `pandapower`
- Add result parsers for each tool.
- Add capability detection endpoint.
- Add fallback chain:
  1. Real external tool
  2. Internal deterministic solver
  3. Analytical formula
  4. LLM explanation
  5. Clarification question

### Files to Edit/Create

- Edit `server/index.js`
- Refactor `server/services/externalSolvers.js`
- Create `server/services/solverRegistry.js`
- Create `server/services/modelCompiler.js`
- Create `server/services/resultParsers.js`
- Create:
  - `server/solvers/circuits/ngspiceAdapter.js`
  - `server/solvers/circuits/netlistTemplates.js`
  - `server/solvers/circuits/ngspiceParser.js`
  - `server/solvers/structural/calculixAdapter.js`
  - `server/solvers/structural/inpTemplates.js`
  - `server/solvers/structural/ccxParser.js`
  - `server/solvers/aerospace/xfoilAdapter.js`
  - `server/solvers/aerospace/openfoamAdapter.js`
  - `server/solvers/thermal/elmerAdapter.js`
  - `server/solvers/control/pythonControlAdapter.js`
  - `server/solvers/power/pandapowerAdapter.js`
  - `server/solvers/physics/scipyMechanicsAdapter.js`

### Completion Criteria

- `/api/solver-capabilities` shows installed/missing tools correctly.
- `/api/simulate` runs real tools when installed.
- `ngspice` is fully working for voltage divider and RC filter.
- Missing tools return useful install/config messages without breaking the app.
- Every external run returns unified JSON:

```json
{
  "success": true,
  "tool": "ngspice",
  "executed": true,
  "run_dir": "...",
  "artifacts": [],
  "result": {
    "metrics": [],
    "plots": {},
    "plain_summary": ""
  }
}
```

---

## Phase 4: Visualization and Diagram System

Purpose: replace one-off SVG code with a real visualization architecture.

### Work Items

- Move diagram logic out of `ResultsPane.jsx`.
- Create a real diagram registry with separate renderers.
- Support:
  - circuits schematics
  - FBDs
  - pulley/spring/incline diagrams
  - beam/truss/frame diagrams
  - thermal networks
  - wing/nozzle diagrams
  - control block diagrams
  - power one-line diagrams
- Keep all diagrams zoomable, pannable, and responsive.
- Add explicit diagram fallback cards:
  - ready
  - in development
  - coming soon

### Files to Edit/Create

- Refactor `src/components/ResultsPane.jsx`
- Edit `src/services/visualizationRegistry.js`
- Create:
  - `src/visualizations/VisualizationRenderer.jsx`
  - `src/visualizations/DiagramFrame.jsx`
  - `src/visualizations/DiagramFallback.jsx`
  - `src/visualizations/circuits/VoltageDividerDiagram.jsx`
  - `src/visualizations/circuits/BuckConverterDiagram.jsx`
  - `src/visualizations/physics/PulleyDiagram.jsx`
  - `src/visualizations/physics/SpringPulleyDiagram.jsx`
  - `src/visualizations/physics/InclineDiagram.jsx`
  - `src/visualizations/physics/CircularMotionDiagram.jsx`
  - `src/visualizations/physics/CollisionDiagram.jsx`
  - `src/visualizations/structural/BeamDiagram.jsx`
  - `src/visualizations/aerospace/WingDiagram.jsx`
  - `src/visualizations/aerospace/NozzleDiagram.jsx`
  - `src/visualizations/control/BlockDiagram.jsx`
  - `src/visualizations/power/OneLineDiagram.jsx`

### Completion Criteria

- Results pane no longer contains hundreds of lines of domain-specific SVG logic.
- Every supported problem has a specific visualization component.
- Unsupported visualizations show transparent fallback, not fake diagrams.

---

## Phase 5: Industrial Validation and Quality Gates

Purpose: prove correctness and prevent regressions.

### Work Items

- Build a benchmark suite for every domain.
- Add expected numerical ranges and evidence requirements.
- Add scoring:
  - correctness
  - completeness
  - communication
  - speed
- Add automated validation endpoint.
- Store reports locally first, then in cloud later.
- Validate real tool result vs internal solver result.

### Files to Edit/Create

- Edit `src/services/benchmarks.js`
- Edit `src/components/ValidationDashboard.jsx`
- Create `server/services/validationRunner.js`
- Create:
  - `validation/benchmarks/circuits.json`
  - `validation/benchmarks/structural.json`
  - `validation/benchmarks/physics.json`
  - `validation/benchmarks/thermal.json`
  - `validation/benchmarks/aerospace.json`
  - `validation/benchmarks/control.json`
  - `validation/benchmarks/materials.json`
  - `validation/benchmarks/power.json`

### Completion Criteria

- `POST /api/validate-solvers` checks installed tools and benchmark readiness.
- A benchmark run produces a JSON report.
- Release gate:
  - 90% of benchmarks score >= 85
  - 80% solve in <= 10 seconds for analytical/simple runs
  - no wrong-domain responses in benchmark suite

---

## Phase 6: Cloud Production Platform

Purpose: reach the final vision: browser only, real tools in cloud, no local installation.

### Work Items

- Containerize backend and solver tools.
- Split API and solver workers.
- Add queue-based simulation jobs for heavy tools.
- Add caching for repeated simulations.
- Add auth and project storage.
- Add file/artifact storage for decks, logs, plots, exported results.
- Add telemetry:
  - solve time
  - fallback level used
  - tool failure reason
  - user satisfaction
  - domain accuracy
- Add deployment.

### Files to Edit/Create

- Create:
  - `docker/Dockerfile.api`
  - `docker/Dockerfile.solvers`
  - `docker/docker-compose.yml`
  - `server/services/simulationQueue.js`
  - `server/services/artifactStore.js`
  - `server/services/cacheStore.js`
  - `server/services/authService.js`
  - `server/services/telemetry.js`
  - `server/routes/simulations.js`
  - `server/routes/projects.js`
  - `server/routes/artifacts.js`
- Eventually migrate from Express JS to the target Fastify + TypeScript architecture if desired:
  - `server/src/index.ts`
  - `server/src/routes/*`
  - `server/src/solvers/*`

### Completion Criteria

- User opens website and needs no local tools.
- Real solver containers run in backend.
- Heavy simulations are queued and streamed back.
- Artifacts are downloadable.
- System has persistent projects, auth, and reliable deployment.

---

## Recommended Order of Work

1. Finish Phase 1 completely.
2. Finish Phase 2 so the brain is reliable.
3. Fully complete `ngspice` first as the reference external-tool adapter.
4. Add CalculiX second.
5. Add XFOIL third.
6. Add Python Control and pandapower.
7. Add OpenFOAM and Elmer after the deck/artifact pipeline is mature.
8. Refactor visualization components.
9. Build validation suite.
10. Containerize and deploy.

## Definition of Done for the End Goal

SimForge reaches the end goal when:

- Users interact primarily through chat.
- The app selects the correct domain and problem type automatically.
- Real cloud tools run without user installation.
- Every simulation has synchronized model, schematic, plot, metrics, and chat explanation.
- Fallbacks are honest and useful.
- Benchmarks prove correctness.
- The UI feels like an engineering IDE, not a collection of demos.

