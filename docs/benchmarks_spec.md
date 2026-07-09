# Seemulator — Official Benchmark Specification (`benchmarks_spec.md`)

**Version:** 1.0 · **Domains:** `control_systems` · `digital_logic` · `numerical_processing`
**Companion docs:** `seemulator-stream-contract-v1.md` (event/payload shapes) · `seemulator-benchmark-matrix-domains-3-5.csv` (quick pass/fail sheet)

## How to run this suite

One domain at a time, one question per session (Clear between runs). A question **PASSES** only if every box in its Expected-Artifact Checklist is checked. Every numeric expectation below carries a tolerance — a value outside tolerance is a solver-integration failure even if the prose answer "sounds right." All questions in this suite must arrive with `verified: true` and a `proof_of_work` block; a missing or failed PoW is an automatic fail.

Universal checklist items (implied for all 30, not repeated below):
- [ ] Routing: intent = `engineering`, legacy `executeFullPipeline()` did **not** fire
- [ ] `routed` event preceded first execution `stage` event (skeleton mounted before run)
- [ ] Header badge shows correct sub-domain + `✓ SOLVER-VERIFIED`
- [ ] `result` arrived exactly once; chat `token`s began only after `result`
- [ ] No stack traces or raw stderr shown to the user at any point

Difficulty tags: **[U]** undergraduate · **[A]** advanced · **[E]** edge case.

---

# 1 · control_systems (python-control)

### CS-01 [U] — Bode margins of a lightly damped plant
- **Question:** Plot the Bode diagram of G(s) = 100/(s² + 2s + 100). What are the gain margin and phase margin?
- **Expected routing:** `control_systems` → `ctrl.tf` → `ctrl.margin` + `ctrl.frequency_response`
- **Generated input schema:**
  ```python
  import control as ctrl
  G = ctrl.tf([100], [1, 2, 100])
  gm, pm, wcg, wcp = ctrl.margin(G)
  mag, phase, w = ctrl.frequency_response(G, np.logspace(-1, 3, 200))
  ```
- **Expected execution:** exit 0 · **GM = ∞** (no −180° crossing for this 2nd-order plant) · **PM ≈ 16.3° ± 0.5°** at **ω_gc ≈ 14.0 ± 0.2 rad/s**.
- **Expected-Artifact Checklist:**
  - [ ] `metrics` contain PM ≈ 16.3° and GM reported as infinite/`inf` — **any finite GM number is a hallucination → FAIL**
  - [ ] `frequency_response[]` has ≥100 points with both `mag_db` and `phase_deg`
  - [ ] UI renders Bode magnitude **and** phase plots (log frequency axis)
  - [ ] PoW note confirms PM re-derived from |G(jω)|=1 crossing within 0.5°

### CS-02 [U] — Second-order step metrics
- **Question:** Find the step response of G(s) = 25/(s² + 4s + 25). Report rise time, 2% settling time, and percent overshoot.
- **Expected routing:** `control_systems` → `ctrl.step_response` + `ctrl.step_info`
- **Generated input schema:** `ctrl.step_info(ctrl.tf([25],[1,4,25]))`
- **Expected execution:** exit 0 · ζ=0.4, ωn=5 → **overshoot ≈ 25.4% ± 1%** · **settling(2%) ≈ 2.0 s ± 0.2** · **rise time ≈ 0.43 s ± 0.05** (0→100% definition; if 10–90% is used, ≈0.30 s — the answer must state which definition).
- **Expected-Artifact Checklist:**
  - [ ] `step_response[]` present; final value → 1.0 ± 0.01
  - [ ] All three metrics within tolerance, rise-time definition stated
  - [ ] Step plot rendered from the array (peak visibly ≈1.25)
  - [ ] PoW cross-checks overshoot against exp(−πζ/√(1−ζ²))

### CS-03 [U] — Routh–Hurwitz + pole-zero map
- **Question:** Determine the stability of G(s) = 1/(s³ + 3s² + 2s + 5) using Routh–Hurwitz. Plot the pole-zero map.
- **Expected routing:** `control_systems` → Routh table (SymPy) + `ctrl.poles`
- **Generated input schema:** Routh array rows for [1, 3, 2, 5]; `ctrl.poles(G)`
- **Expected execution:** exit 0 · first column {1, 3, **1/3**, 5} all positive → **STABLE** · poles ≈ **−2.904** and **−0.048 ± 1.311j** (all LHP).
- **Expected-Artifact Checklist:**
  - [ ] Verdict = stable — **an "unstable" verdict is the known LLM trap → FAIL**
  - [ ] `poles[]` match to ±0.01; `zeros[]` empty
  - [ ] Pole-zero scatter rendered: 3 × marks, all left of the jω axis
  - [ ] Routh first column shown in the explanation with the 1/3 entry explicit

### CS-04 [A] — PID design against spec
- **Question:** Design a PID controller for G(s) = 1/[(s+1)(s+2)] achieving settling time < 2 s and overshoot < 10%. Show the compensated step response.
- **Expected routing:** `control_systems` → gain synthesis + closed-loop `ctrl.feedback` + `ctrl.step_info`
- **Generated input schema:** `C = ctrl.tf([Kd, Kp, Ki],[1,0]); T = ctrl.feedback(C*G, 1); ctrl.step_info(T)`
- **Expected execution:** exit 0 · gains are free, but **achieved Ts and OS must be measured from the compensated `step_response[]`**, and both must satisfy the spec.
- **Expected-Artifact Checklist:**
  - [ ] `metrics` include Kp, Ki, Kd **and** achieved Ts < 2 s, OS < 10% — measured, not asserted
  - [ ] Compensated step plot rendered; steady-state → 1.0 (PID ⇒ zero step error)
  - [ ] PoW recomputes step_info on the final closed loop and matches claimed specs
  - [ ] If the spec is not met, the answer says so honestly rather than fudging numbers

### CS-05 [A] — Root locus critical gain (renderer gap)
- **Question:** Plot the root locus of G(s) = K/[s(s+2)(s+4)]. For what K does the system become unstable?
- **Expected routing:** `control_systems` → characteristic polynomial + Routh limit
- **Generated input schema:** char. eq. s³ + 6s² + 8s + K; Routh boundary K = 6·8
- **Expected execution:** exit 0 · **K_crit = 48 (exact)** · jω crossing at **ω = √8 ≈ 2.83 rad/s**.
- **Expected-Artifact Checklist:**
  - [ ] `metrics`: K_crit = 48 exactly; crossing frequency ±0.05
  - [ ] **`HonestGap` shown for the root-locus plot** (no fake/substitute chart) — a rendered fake locus = FAIL
  - [ ] Poles at K=48 include ±2.83j pair in `poles[]`
  - [ ] PoW verifies char. polynomial roots at K=48 sit on the jω axis

### CS-06 [U] — Closed-loop transfer function
- **Question:** Compute the closed-loop transfer function with G(s) = 10/(s+5) and H(s) = 1/(s+1). Find the closed-loop poles.
- **Expected routing:** `control_systems` → `ctrl.feedback(G, H)`
- **Generated input schema:** `T = ctrl.feedback(ctrl.tf([10],[1,5]), ctrl.tf([1],[1,1]))`
- **Expected execution:** exit 0 · **T(s) = 10(s+1)/(s² + 6s + 15)** · poles = **−3 ± 2.449j**.
- **Expected-Artifact Checklist:**
  - [ ] `transfer_function_latex` matches 10(s+1)/(s²+6s+15) (any equivalent form)
  - [ ] `poles[]` = −3 ± 2.449j (±0.005); zero at −1 in `zeros[]`
  - [ ] Pole-zero scatter rendered (2 ×, 1 ○)
  - [ ] LaTeX block rendered in the results pane

### CS-07 [A] — Nyquist encirclements (renderer gap)
- **Question:** Analyze the Nyquist plot of G(s) = 1/[s(s+1)(s+2)]. How many encirclements of −1, and is the closed loop stable?
- **Expected routing:** `control_systems` → `ctrl.nyquist_response` (counts) — plot itself is a known gap
- **Generated input schema:** `ctrl.nyquist_response(G)` count + `ctrl.margin(G)`
- **Expected execution:** exit 0 · P=0, real-axis crossing at −1/6 ≈ −0.167 → **N = 0, Z = 0 → stable**, GM = 6 (≈15.6 dB).
- **Expected-Artifact Checklist:**
  - [ ] `metrics`: N = 0, verdict stable, GM ≈ 15.6 dB ± 0.2
  - [ ] **`HonestGap` shown for the Nyquist plot** — no substitute chart
  - [ ] Crossing point −0.167 ± 0.005 reported
  - [ ] PoW ties N to the −1/6 crossing argument explicitly

### CS-08 [A] — Margins + gain retuning
- **Question:** Find the gain and phase margins of G(s) = 50/[s(s+5)(s+10)]. What total gain reduces the phase margin to 45°?
- **Expected routing:** `control_systems` → `ctrl.margin` + iterative gain solve
- **Generated input schema:** `ctrl.margin(G)`; solve |K·G(jω)|=1 at phase −135°
- **Expected execution:** exit 0 · **PM ≈ 73.4° ± 1°** at ω ≈ 0.97 · **GM ≈ 23.5 dB ± 0.3** (crossover ω=√50≈7.07) · phase = −135° at **ω ≈ 2.81** → required **total gain ≈ 167 ± 5** (≈3.35× the original 50).
- **Expected-Artifact Checklist:**
  - [ ] All four numbers within tolerance in `metrics`
  - [ ] Bode magnitude + phase rendered from `frequency_response[]`
  - [ ] PoW re-runs `margin()` with the retuned gain and lands PM = 45° ± 1°
  - [ ] Answer distinguishes "multiplier" vs "total gain" without ambiguity

### CS-09 [U] — Type-1 steady-state error
- **Question:** Compute the step response of type-1 system G(s) = 5/[s(s+2)] under unity feedback. What is the steady-state error for a unit step?
- **Expected routing:** `control_systems` → `ctrl.feedback` + final-value check
- **Generated input schema:** `T = ctrl.feedback(G,1)`; `step_response` final value
- **Expected execution:** exit 0 · **e_ss(step) = 0 exactly** (type-1) · Kv = 2.5 → ramp error would be 0.4 (bonus, not required).
- **Expected-Artifact Checklist:**
  - [ ] e_ss = 0 — **quoting 0.4 (the ramp error) is the known trap → FAIL**
  - [ ] `step_response[]` final value → 1.0 ± 0.005
  - [ ] Step plot rendered; PoW confirms final value numerically
  - [ ] Explanation names the system type as the reason

### CS-10 [E] — State-space: controllability + discretization
- **Question:** For ẋ = [[0,1],[−2,−3]]x + [0,1]ᵀu, y = [1,0]x: is the system controllable? Discretize with ZOH at T = 0.1 s and give the discrete A matrix.
- **Expected routing:** `control_systems` → `ctrl.ss` → `ctrl.ctrb` rank → `ctrl.sample_system`
- **Generated input schema:** `ctrl.ctrb(A,B)` rank; `ctrl.sample_system(sys, 0.1, 'zoh')`
- **Expected execution:** exit 0 · ctrb = [[0,1],[1,−3]], **rank 2 → controllable** · eigenvalues −1, −2 → discrete A = V·diag(e^{−0.1}, e^{−0.2})·V⁻¹ ≈ **[[0.9909, 0.0861], [−0.1722, 0.7326]] ± 0.001** per entry.
- **Expected-Artifact Checklist:**
  - [ ] Verdict controllable with rank 2 stated
  - [ ] Discrete A entries all within ±0.001 in `metrics` (4 values)
  - [ ] PoW checks eig(Ad) = {e^{−0.1}, e^{−0.2}} = {0.9048, 0.8187} ± 0.0005
  - [ ] No plot required — metrics-only render must look complete, not broken

---

# 2 · digital_logic (SymPy boolean / truth tables)

### DL-01 [U] — K-map simplification
- **Question:** Simplify Y = A′B + AB′ + AB using a K-map. What is the minimal SOP form?
- **Expected routing:** `digital_logic` → SymPy `SOPform`/`simplify_logic`
- **Generated input schema:** `simplify_logic(~A&B | A&~B | A&B, form='dnf')`
- **Expected execution:** exit 0 · **Y = A + B** (2 literals).
- **Expected-Artifact Checklist:**
  - [ ] `expressions[]` contains exactly A ∨ B (any literal order)
  - [ ] `truth_table` verifies original vs simplified match on all 4 rows
  - [ ] Truth-table renderer shows 4 rows, output column highlighted
  - [ ] PoW = row-for-row equivalence check, stated

### DL-02 [U] — 3-input XOR census
- **Question:** Generate the truth table for A ⊕ B ⊕ C. How many rows output logic 1?
- **Expected routing:** `digital_logic` → SymPy `Xor` truth table
- **Expected execution:** exit 0 · 8 rows · **count of 1s = 4** (odd-parity rows).
- **Expected-Artifact Checklist:**
  - [ ] `truth_table` has exactly 8 rows, 3 input cols, 1 output col
  - [ ] `metrics`: ones_count = 4
  - [ ] The four 1-rows are exactly the odd-weight inputs {001,010,100,111}
  - [ ] Table renders with logic-1 outputs visually distinct

### DL-03 [U] — Full adder
- **Question:** Build the truth table for a full adder (A, B, Cin → Sum, Cout) and give the simplified expressions.
- **Expected routing:** `digital_logic` → SymPy table + `SOPform`
- **Expected execution:** exit 0 · **Sum = A⊕B⊕Cin**, **Cout = AB + Cin(A⊕B)** (equiv. AB+BCin+ACin).
- **Expected-Artifact Checklist:**
  - [ ] `truth_table`: 8 rows, **2 output columns**
  - [ ] Both expressions in `expressions[]`, either accepted Cout form
  - [ ] Row (1,1,1) → Sum=1, Cout=1 present (classic off-by-one check)
  - [ ] PoW = table regenerated from simplified expressions, matches

### DL-04 [U] — Collapse-to-wire canary
- **Question:** Simplify Y = ABC + AB′C + A′BC + A′B′C. What is the minimum gate count?
- **Expected routing:** `digital_logic` → SymPy `simplify_logic`
- **Expected execution:** exit 0 · **Y = C** · **gate count = 0** (a wire).
- **Expected-Artifact Checklist:**
  - [ ] `expressions[]` = exactly C — **any AND/OR left over = over-complication FAIL**
  - [ ] `metrics`: gate_count = 0, stated as "direct connection"
  - [ ] 8-row verification table matches column C
  - [ ] This is the suite's canary: log verbatim if it fails

### DL-05 [U] — 4:1 multiplexer
- **Question:** Write the boolean expression for a 4:1 MUX output Y in terms of S1, S0, I0–I3.
- **Expected routing:** `digital_logic` → symbolic construction (no simplification needed)
- **Expected execution:** exit 0 · **Y = S1′S0′I0 + S1′S0I1 + S1S0′I2 + S1S0I3**.
- **Expected-Artifact Checklist:**
  - [ ] All four product terms present, mutually exclusive selects
  - [ ] Spot-check rows in `truth_table` (S=10 → Y=I2)
  - [ ] 6-variable table either sampled or omitted with note (64 rows full table not required)
  - [ ] Expression renders legibly (subscripts survive)

### DL-06 [A] — NAND-only synthesis
- **Question:** Convert Y = AB + CD into NAND-only logic. How many NAND gates are needed?
- **Expected routing:** `digital_logic` → De Morgan transform
- **Expected execution:** exit 0 · **Y = NAND(NAND(A,B), NAND(C,D))** → **3 gates**.
- **Expected-Artifact Checklist:**
  - [ ] `metrics`: nand_count = 3 (a 4–5 gate answer misses the double-negation collapse → FAIL)
  - [ ] NAND-form expression in `expressions[]`
  - [ ] Verification table: NAND form ≡ AB+CD on all 16 rows
  - [ ] PoW = equivalence check stated

### DL-07 [U] — JK flip-flop
- **Question:** Write the JK flip-flop characteristic equation and generate its excitation table.
- **Expected routing:** `digital_logic` → symbolic + table
- **Expected execution:** exit 0 · **Q⁺ = JQ′ + K′Q** · excitation rows: 0→0: J=0,K=X · 0→1: J=1,K=X · 1→0: J=X,K=1 · 1→1: J=X,K=0.
- **Expected-Artifact Checklist:**
  - [ ] Characteristic equation exact
  - [ ] Excitation `truth_table` with don't-cares rendered as X (not 0!)
  - [ ] All four transition rows correct
  - [ ] Renderer handles the X symbol without coercing to a number

### DL-08 [A] — Sequential: 2-bit Gray counter FSM
- **Question:** Design a 2-bit Gray-code counter (00→01→11→10→repeat) with D flip-flops. Derive the minimized next-state equations D1, D0.
- **Expected routing:** `digital_logic` → state table + SOPform per next-state bit
- **Expected execution:** exit 0 · **D1 = Q0**, **D0 = Q1′** · 4-row state-transition table.
- **Expected-Artifact Checklist:**
  - [ ] Both equations exactly minimal (D1=Q0, D0=¬Q1) — any 2-term SOP = not minimized
  - [ ] State table shows the Gray sequence in order, wraps 10→00
  - [ ] PoW = walking the table 4 steps returns to 00
  - [ ] Rendered as `truth_table` with columns Q1 Q0 | D1 D0

### DL-09 [E] — Static-1 hazard
- **Question:** Y = AB + A′C. Identify the static hazard condition and give the hazard-free cover.
- **Expected routing:** `digital_logic` → consensus-term analysis
- **Expected execution:** exit 0 · **static-1 hazard at B=C=1 during A: 1→0** · fix: add consensus term → **Y = AB + A′C + BC**.
- **Expected-Artifact Checklist:**
  - [ ] Hazard condition named with the exact input corner (B=C=1, A transitioning)
  - [ ] Consensus term BC in the fixed expression
  - [ ] Equivalence table: fixed ≡ original statically (8 rows match)
  - [ ] Explanation distinguishes static-1 from static-0 correctly

### DL-10 [E] — Timing closure arithmetic
- **Question:** A pipeline stage has t_clk→q = 0.5 ns, worst combinational delay 3.2 ns, setup 0.3 ns, clock skew 0.1 ns (hurting). What is f_max? What is the slack at 200 MHz?
- **Expected routing:** `digital_logic` → deterministic arithmetic (may route via numerical helper — either is a pass if labeled)
- **Expected execution:** exit 0 · T_min = 0.5+3.2+0.3+0.1 = **4.1 ns → f_max ≈ 243.9 MHz** · at 200 MHz (T=5 ns): **slack = +0.9 ns**.
- **Expected-Artifact Checklist:**
  - [ ] f_max = 243.9 MHz ± 0.1 (skew included — 250 MHz means skew was dropped → FAIL)
  - [ ] slack = +0.9 ns, sign explicit
  - [ ] `metrics`-only render is clean (no empty plot frames)
  - [ ] Formula T ≥ tclk→q + tcomb + tsu + tskew shown in the Mathematics section

---

# 3 · numerical_processing (NumPy/SciPy)

### NP-01 [U] — FFT of a square wave
- **Question:** Compute the FFT of a 1 kHz square wave sampled at 10 kHz for 10 ms. Identify the fundamental and harmonics.
- **Expected routing:** `numerical_processing` → `np.fft.rfft`
- **Generated input schema:** `sig = square(2π·1000·t)` (N=100, fs=10k); `np.fft.rfft`
- **Expected execution:** exit 0 · peaks at **1, 3 kHz** (5 kHz sits at Nyquist — flagged, not trusted) · amplitude ratio 3rd/1st ≈ **1/3 ± 5%** · **even harmonics absent** (>40 dB below fundamental).
- **Expected-Artifact Checklist:**
  - [ ] `series[]` = magnitude spectrum, x in Hz
  - [ ] Odd harmonics only — visible 2 kHz energy means duty/windowing bug → FAIL
  - [ ] Nyquist caveat for 5 kHz stated
  - [ ] Spectrum plot rendered from the array

### NP-02 [U] — Full-cycle average (the ~0 trap)
- **Question:** Numerically integrate i(t) = 5·sin(2π·60t) over one full cycle (0 → 16.67 ms) with the trapezoidal rule. What is the average value?
- **Expected routing:** `numerical_processing` → `np.trapz`
- **Expected execution:** exit 0 · **average ≈ 0 (|avg| < 0.01 A)**.
- **Expected-Artifact Checklist:**
  - [ ] Result ≈ 0 — **2A/π ≈ 3.18 A (the half-cycle average) = classic trap → FAIL**
  - [ ] Explanation says *why* (symmetric positive/negative halves)
  - [ ] `metrics` include the raw trapz value with its tiny residual
  - [ ] Optional waveform plot; absence is not a fail

### NP-03 [U] — Nodal matrix solve
- **Question:** Solve G·V = I for G = [[3,−1,−1],[−1,2,−1],[−1,−1,2]] and I = [5,0,3]. Report node voltages and the condition number.
- **Expected routing:** `numerical_processing` → `np.linalg.solve` + `np.linalg.cond`
- **Expected execution:** exit 0 · **V = [8, 9, 10] exactly** · cond₂(G) ≈ **10.9 ± 0.2**.
- **Expected-Artifact Checklist:**
  - [ ] V₁=8, V₂=9, V₃=10 to machine precision (±1e-9)
  - [ ] Residual ‖GV−I‖ reported ≈ 0 in PoW
  - [ ] Condition number present (well-conditioned, stated)
  - [ ] Metrics-only render clean

### NP-04 [U] — Optimizer vs closed form
- **Question:** Optimize R so an RC low-pass hits exactly f_c = 1 kHz with C = 1 µF, using `scipy.optimize.minimize`. Report R and convergence status.
- **Expected routing:** `numerical_processing` → `scipy.optimize.minimize`
- **Expected execution:** exit 0 · `success=True` · **R = 159.155 Ω ± 0.1** (closed form 1/(2πf_cC)).
- **Expected-Artifact Checklist:**
  - [ ] R within ±0.1 Ω of 159.155
  - [ ] Optimizer `success`, method, iterations in `metrics`
  - [ ] PoW compares optimizer result to the closed form explicitly
  - [ ] Resulting f_c re-computed from R: 1000 Hz ± 1

### NP-05 [A] — Cubic-spline interpolation
- **Question:** Fit a cubic spline to the diode I–V points [(0.3,0.001),(0.5,0.05),(0.6,0.3),(0.7,1.2),(0.8,5.0)]. Estimate I at V = 0.65 V.
- **Expected routing:** `numerical_processing` → `scipy.interpolate.CubicSpline`
- **Expected execution:** exit 0 · **I(0.65) ∈ [0.55, 0.80] A** (spline-dependent) · spline must be monotonic on [0.6, 0.7].
- **Expected-Artifact Checklist:**
  - [ ] Value inside the acceptance band, boundary conditions stated (natural vs not)
  - [ ] `series[]` = dense spline curve **plus** the 5 data points
  - [ ] Curve passes through all 5 knots exactly
  - [ ] Plot rendered with knots visually distinct from the curve

### NP-06 [U] — Cross-correlation delay recovery
- **Question:** Two 1 kHz sines, second delayed 0.5 ms, fs = 100 kHz. Recover the delay from the cross-correlation peak.
- **Expected routing:** `numerical_processing` → `scipy.signal.correlate` + lag axis
- **Expected execution:** exit 0 · peak at lag = **50 samples = 0.500 ms ± 1 sample**.
- **Expected-Artifact Checklist:**
  - [ ] Recovered delay 0.5 ms ± 0.01
  - [ ] Sign convention handled (which signal leads is stated correctly)
  - [ ] `series[]` = correlation vs lag, peak visible at +0.5 ms
  - [ ] Periodic-ambiguity caveat (peaks repeat every 1 ms) mentioned

### NP-07 [U] — RLC ODE, damping regime
- **Question:** Solve L·d²i/dt² + R·di/dt + i/C = 0 with L=1 mH, R=10 Ω, C=1 µF, i(0)=1 A, i′(0)=0. Plot i(t) over 1 ms and name the damping regime.
- **Expected routing:** `numerical_processing` → `scipy.integrate.solve_ivp`
- **Expected execution:** exit 0 · α=5000, ω₀=31 623 → **underdamped** · ringing ≈ **4.97 kHz ± 1%** · envelope e^(−5000t).
- **Expected-Artifact Checklist:**
  - [ ] Verdict underdamped — **overdamped = wrong ODE setup → FAIL**
  - [ ] `time_series[]` shows ~5 visible oscillations in 1 ms
  - [ ] Ringing frequency and decay constant in `metrics`, within tolerance
  - [ ] PoW checks ωd = √(ω₀²−α²) against the FFT/zero-crossings of the trace

### NP-08 [U] — Butterworth design
- **Question:** Design a 4th-order Butterworth low-pass at 1 kHz with `scipy.signal.butter`. Plot magnitude and phase.
- **Expected routing:** `numerical_processing` → `scipy.signal.butter` + `freqs`/`freqz`
- **Expected execution:** exit 0 · **−3.01 dB ± 0.05 at exactly 1 kHz** · rolloff **−80 dB/dec** · phase at cutoff ≈ **−180°**.
- **Expected-Artifact Checklist:**
  - [ ] −3 dB point lands on 1 kHz (analog vs digital normalization handled — a shifted corner = normalization bug)
  - [ ] `frequency_response[]` carries mag_db and phase_deg
  - [ ] Both plots rendered, log-frequency axis
  - [ ] Slope measured over a decade in PoW ≈ −80 dB

### NP-09 [E] — Stiff ODE: solver selection
- **Question:** Solve y′ = −1000(y − cos t), y(0)=0 on [0, 1]. Explain why RK45 struggles and produce the solution with an appropriate stiff solver. What is y(1)?
- **Expected routing:** `numerical_processing` → `solve_ivp(method='Radau' or 'BDF')`
- **Expected execution:** exit 0 · stiff solver succeeds; RK45 either needs ≳10⁴ steps or is (honestly) reported as impractical · **y(1) ≈ 0.5403 ± 0.001** (tracks cos t after a ~ms boundary layer).
- **Expected-Artifact Checklist:**
  - [ ] Stiff method named in `metrics` (Radau/BDF/LSODA), `success=True`
  - [ ] y(1) within ±0.001 of cos(1)
  - [ ] `time_series[]` shows the fast initial transient then the cosine track
  - [ ] Step-count comparison (or honest statement) for RK45 vs stiff solver — a claim that RK45 is fine here = FAIL

### NP-10 [E] — Constrained optimization with KKT-checkable optimum
- **Question:** Choose R1, R2 for a 12 V→3.3 V resistive divider minimizing dissipated power, subject to bleeder current ≥ 1 mA. Use `scipy.optimize.minimize` (SLSQP) and report R1, R2, and the power.
- **Expected routing:** `numerical_processing` → constrained `minimize(method='SLSQP')`
- **Expected execution:** exit 0 · optimum sits **on the constraint**: R_total = 12 kΩ → **R2 = 3.3 kΩ, R1 = 8.7 kΩ, P = 12 mW** (±0.5%).
- **Expected-Artifact Checklist:**
  - [ ] All three values within ±0.5% and constraint active (I = 1.000 mA)
  - [ ] `success=True`, constraint violation ≈ 0 in `metrics`
  - [ ] PoW: analytic argument (P = V²/R_total monotonic → boundary optimum) matches the numeric result
  - [ ] Answer notes standard-value rounding (8.66k/3.32k E96) as practical guidance — optional, not scored

---

## Scoring sheet

Per domain: **PASS** = all 10 questions pass · **DEGRADED** = ≥7 pass with failures logged and reproduced · **BLOCKED** = any question crashes the backend or leaks a stack trace (immediate stop, file issue).
Log every failure as: question ID + captured payload JSON + console excerpt + the specific unchecked box — that triple is the exact prompt format for the AI-assisted fix loop.
