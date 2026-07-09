# Seemulator — Stream Event Contract & Debugging Protocol (v1)

**Audience:** Shivam (backend, `orchestrator.py`) + Alina (frontend, `SeemulatorPlayground.jsx`)
**Scope:** the exact SSE events the frontend expects from `POST /api/circuits/solve/stream`, the ordering guarantees, the re-run request shape, and the pass/fail debugging matrix for benchmark domains 3–5.

---

## 1. Transport

Chunked HTTP / SSE framing over the existing POST endpoint. Each frame:

```
event: <name>
data: <single-line JSON>

```

The frontend parser tolerates partial frames (buffers until newline) and ignores unknown event names, so adding new events later is non-breaking.

---

## 2. Events

### 2.1 `stage` — one per pipeline transition (never a generic spinner)
```json
{ "key": "execution", "label": "running ngspice … " }
```
Required `key` values, in pipeline order:
`classify` → `tool_select` → `input_generation` → `validation` → `execution` → `parsing` → `proof_of_work` → `explanation`

`label` is what the user sees (plain language, may include tool name and timing). Emit one `stage` at the **start** of each phase.

### 2.2 `routed` — the critical one (Task 1 depends on its timing)
```json
{
  "sub_domain": "control_systems",
  "tools": ["python-control"],
  "will_execute": true,
  "verified": true
}
```
**MUST be emitted immediately after CALL 1 returns, BEFORE any execution starts.**
This is what mounts the results-pane skeleton and flips the header badge — if it arrives late (or with the result), the "sudden popping" bug comes back by definition.

- `will_execute: false` → smalltalk / clarify-only / follow-up-from-cache turns; skeleton does not mount.
- `verified: true` for the five real-solver domains (analog_sim, symbolic_analysis, control_systems, digital_logic, numerical_processing); `false` for the five stubs (rf_em, pcb_realization, fpga_realization, semiconductor_device, physical_design). The frontend renders the **"LLM-COMPUTED — no solver verification"** badge from this flag, and the ✓ proof-of-work mark from `verified && proof_of_work` in the result.

### 2.3 `model` — populates the Formulated Model pane
```json
{
  "input_file": "* rc_lowpass.cir\nV1 in 0 AC 1\nR1 in out 1k\n…",
  "parameters": [
    { "id": "R1", "name": "R1 (series resistor)", "value": "1k", "unit": "Ω",
      "min": 100, "max": 100000, "file_anchor": "R1 in out" }
  ]
}
```
Emit after input generation (and echo back on re-runs so the pane re-syncs). `min`/`max` are optional — when present the UI adds a slider. `file_anchor` follows the existing anchor-editing pattern.

### 2.4 `token` — CALL 2 streamed answer text
```json
{ "text": "Description — A first-order RC low-pass…" }
```
Prefer true provider token streaming; chunked fallback acceptable.

### 2.5 `result` — final payload, exactly once, before `done`
Discriminated on `sub_domain`. Common envelope:
```json
{
  "sub_domain": "control_systems",
  "tool_used": "python-control",
  "verified": true,
  "proof_of_work": { "passed": true, "note": "PM matches margin() within 0.1°" },
  "metrics": [ { "name": "phase margin", "value": "48.2", "unit": "°" } ],
  "validation": { "status": "ok", "issues": [] },

  "frequency_response": [ { "freq": 10.0, "mag_db": -0.02, "phase_deg": -1.1 } ],
  "time_series":        [ { "t": 0.0, "v": 0.0 } ],
  "step_response":      [ { "t": 0.0, "y": 0.0 } ],
  "series":             [ { "x": 0.0, "y": 0.0 } ],
  "poles": ["-2+9.8j", "-2-9.8j"], "zeros": [],
  "transfer_function_latex": "\\frac{25}{s^2+4s+25}",
  "truth_table": { "inputs": ["A","B","Cin"], "outputs": ["Sum","Cout"], "rows": [[0,0,0,0,0]] },
  "expressions": [ { "name": "Sum", "latex": "A \\oplus B \\oplus C_{in}" } ],
  "schematic_svg": "<svg…>", "waveform_svg": null
}
```
Only include the arrays that exist — the frontend renders strictly from what's present (never invents a plot). All numeric arrays must come from the actual solver run.

### 2.6 `error` — plain language, never a stack trace
```json
{ "message": "ngspice reported a floating node at 'out'. Add a ground reference or a load resistor.", "stage_key": "validation" }
```

### 2.7 `done`
```
data: [DONE]
```

---

## 3. Ordering guarantee (per turn)

```
stage(classify) → routed → stage(input_generation) → model
→ stage(validation) → stage(execution) → stage(parsing)
→ stage(proof_of_work) → result → stage(explanation) → token* → done
```

Invariants the frontend relies on:
1. `routed` precedes any execution work.
2. `model` precedes `result`.
3. `result` arrives exactly once and before `done`.
4. `token`s may interleave only after `result` (answer explains real numbers).
5. On any failure: `error` then `done` — no partial `result`.

**Open question for v2 (multi-sub-domain turns):** when CALL 1 selects several domains in the thread pool, proposal: `routed.sub_domains: [..]` plus one `result` per domain; frontend will tab them. Not needed for the current debugging pass — confirm before implementing.

---

## 4. Re-run request shape (Task 2 — bypasses chat)

```json
POST /api/circuits/solve/stream
{
  "rerun": true,
  "app": "seemulator",
  "provider": "gemini",
  "sub_domain": "analog_sim",
  "input_file": "<current active file with edits applied>",
  "parameters": [ { "id": "R1", "value": "10k", "…": "…" } ],
  "history": [ /* last 30 messages */ ]
}
```
On `rerun: true` the backend skips CALL 1 classification (sub-domain is pinned), applies `parameters` to `input_file` (all diffs in one pass), and runs the same event sequence starting at `routed` (echoed) → `stage(validation)` → …
Normal chat turns also carry `parameters` + `active_input_file` so manual UI edits are in the AI context ("what's the cutoff now?" answers from the edited value).

---

## 5. Debugging protocol (one domain at a time)

For each benchmark question log five things:
1. **Routing** — intent class + CALL 1 selection (and that the legacy `executeFullPipeline` fork did NOT fire)
2. **Input** — the generated netlist/expression/script (verbatim)
3. **Execution** — exit code, duration, stderr head
4. **Payload** — which arrays/fields the `result` actually contained
5. **Render** — which UI blocks appeared (metrics / plot / table / schematic) + console errors

Compare 4 & 5 against the expected-artifact matrix (CSV alongside this doc). A question **passes** only if payload and render both match expectation. Feed failures to the AI as: console log + payload JSON + expected row + one-line analysis.

### Known renderer gaps the matrix will hit (pre-flagged)
- **Root locus** (control Q5) and **Nyquist** (control Q7): no current plot type — needs either a dedicated series shape or "plot not yet available" honest fallback.
- **Spectrogram** (numerical Q6): 2D heatmap — Plotly heatmap trace needed.
- **Truth tables / boolean expressions** (all of digital_logic): `CircuitsResultsPane` is metrics/plots-oriented — digital needs its own view (`truth_table` + `expressions` fields above).
