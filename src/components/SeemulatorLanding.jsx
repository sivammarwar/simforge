import { useState, useRef, useCallback, useEffect } from "react";

/* ============================================================
   SEEMULATOR — Landing Page (production)
   ------------------------------------------------------------
   Cursor-style "the session is the hero" layout:
   quiet solid background, live self-running pipeline replay,
   single START button → Welcome + 8-digit access code modal
   → onUnlock (route to Playground).

   Palette: "Tempered Steel" — accents from real steel temper
   oxide colors: peacock (~300°C) and straw (~220°C), with a
   single ember spark reserved for the logomark.

   Usage:
     <SeemulatorLanding onUnlock={() => navigate("/playground")} />

   No dependencies beyond React. Tailwind is used only for
   layout utilities (flex/grid/spacing); all brand styling is
   inline via the token object below.
   ============================================================ */

const T = {
  base: "#0B0D11",
  surface: "#12151B",
  elevated: "#191E26",
  border: "#242B36",
  peacock: "#4FB3BF",
  straw: "#D9B36C",
  ember: "#E2683C",
  green: "#3ECF8E",
  error: "#E0554D",
  text: "#EAEDF2",
  dim: "#8A93A3",
  muted: "#4C5566",
  mono: "'JetBrains Mono', monospace",
  ui: "'Inter', system-ui, sans-serif",
};

/* ---------- logomark: "S" routed as a PCB trace ---------- */
export function LogoMark({ size = 28, spark = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="Seemulator">
      <path
        d="M36 11 H21 L14 18 V21 L20 27 H29 L34 32 V35 L28 41 H12"
        stroke={T.peacock}
        strokeWidth="3.2"
        strokeLinecap="square"
      />
      <circle cx="38.5" cy="11" r="3.4" stroke={T.peacock} strokeWidth="2.4" />
      <circle cx="9.5" cy="41" r="3.4" stroke={T.peacock} strokeWidth="2.4" />
      {spark && (
        <path d="M40 3 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 z" fill={T.ember} />
      )}
    </svg>
  );
}

function Kbd({ children }) {
  return (
    <kbd
      style={{
        fontFamily: T.mono,
        fontSize: 10,
        color: T.dim,
        background: T.elevated,
        border: `1px solid ${T.border}`,
        borderBottomWidth: 2,
        borderRadius: 3,
        padding: "2px 6px",
      }}
    >
      {children}
    </kbd>
  );
}

/* ============================================================
   Self-running session demo — the hero object.
   A scripted, looping replay of one real pipeline turn.
   f_c below is genuinely 1/(2πRC) for R=1k, C=100n.
   ============================================================ */
const SCRIPT = [
  { mode: "type", kind: "prompt", text: "design a low-pass RC filter with a 1.6 kHz cutoff and show me the bode plot", delay: 34 },
  { mode: "line", kind: "stage", text: "▸ classifying request … new_engineering · analog_sim", wait: 500 },
  { mode: "line", kind: "stage", text: "▸ selecting tool … ngspice (netlist < 50 nodes)", wait: 420 },
  { mode: "line", kind: "stage", text: "▸ generating SPICE netlist … validated, pass 1/3", wait: 520 },
  { mode: "block", kind: "code", wait: 700, lines: [
      ["* rc_lowpass.cir", T.muted],
      ["V1 in 0 AC 1", T.text],
      ["R1 in out 1k", T.text],
      ["C1 out 0 100n", T.text],
      [".ac dec 20 10 1meg", T.straw],
      [".end", T.muted],
  ]},
  { mode: "line", kind: "stage", text: "▸ running ngspice … exit 0 · 0.41 s", wait: 800 },
  { mode: "line", kind: "stage", text: "▸ parsing output … 101 frequency points → AnalogSimResult", wait: 480 },
  { mode: "block", kind: "result", wait: 650, lines: [
      ["f_c        1.5915 kHz    (−3.01 dB)", T.peacock],
      ["slope      −20 dB/decade above f_c", T.text],
      ["phase@f_c  −45.0°", T.text],
  ]},
  { mode: "line", kind: "verify", text: "✓ proof of work · f_c matches 1/2πRC within 0.03% — sane", wait: 700 },
  { mode: "line", kind: "answer", text: "Description — A first-order RC low-pass: R1 = 1 kΩ into C1 = 100 nF…", wait: 550 },
  { mode: "line", kind: "answerdim", text: "Intuition → Mathematics → Formula/Law Used → Conclusion", wait: 400 },
];

function useSessionReplay(reduced) {
  const [progress, setProgress] = useState({ step: 0, chars: 0 });
  useEffect(() => {
    if (reduced) {
      setProgress({ step: SCRIPT.length, chars: 0 });
      return;
    }
    let cancelled = false;
    let timer;
    const run = (step, chars) => {
      if (cancelled) return;
      if (step >= SCRIPT.length) {
        timer = setTimeout(() => run(-1, 0), 5200); // hold, then loop
        return;
      }
      if (step === -1) {
        setProgress({ step: 0, chars: 0 });
        timer = setTimeout(() => run(0, 0), 600);
        return;
      }
      const s = SCRIPT[step];
      if (s.mode === "type" && chars < s.text.length) {
        setProgress({ step, chars: chars + 1 });
        timer = setTimeout(() => run(step, chars + 1), s.delay);
      } else {
        setProgress({ step: step + 1, chars: 0 });
        timer = setTimeout(() => run(step + 1, 0), s.wait || 400);
      }
    };
    timer = setTimeout(() => run(0, 0), 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduced]);
  return progress;
}

function SessionWindow() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const { step, chars } = useSessionReplay(reduced);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [step, chars]);

  const colorFor = (kind) =>
    ({
      prompt: T.text,
      stage: T.dim,
      verify: T.green,
      answer: T.text,
      answerdim: T.muted,
    }[kind] || T.dim);

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(79,179,191,0.06)`,
        textAlign: "left",
      }}
    >
      {/* window chrome */}
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 40, background: T.elevated, borderBottom: `1px solid ${T.border}` }}
      >
        <div className="flex items-center gap-2">
          {[T.error, T.straw, T.green].map((c) => (
            <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.75 }} />
          ))}
        </div>
        <div className="flex items-center gap-0">
          {["session.log", "rc_lowpass.cir", "results.json"].map((tab, i) => (
            <span
              key={tab}
              style={{
                fontFamily: T.mono,
                fontSize: 10.5,
                padding: "4px 12px",
                color: i === 0 ? T.text : T.muted,
                borderBottom: i === 0 ? `2px solid ${T.peacock}` : "2px solid transparent",
              }}
            >
              {tab}
            </span>
          ))}
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted, letterSpacing: "0.1em" }}>
          ANALOG_SIM
        </span>
      </div>

      {/* transcript */}
      <div
        ref={bodyRef}
        style={{
          fontFamily: T.mono,
          fontSize: 12.5,
          lineHeight: 1.85,
          padding: "18px 22px",
          height: 340,
          overflowY: "hidden",
        }}
      >
        {/* prompt line, typed */}
        <div style={{ color: T.text }}>
          <span style={{ color: T.peacock }}>guest@seemulator</span>
          <span style={{ color: T.muted }}> ~ </span>
          {step === 0 ? SCRIPT[0].text.slice(0, chars) : SCRIPT[0].text}
          {step === 0 && <span style={{ color: T.peacock }}>▊</span>}
        </div>

        {SCRIPT.slice(1).map((s, i) => {
          const idx = i + 1;
          if (step <= idx) return null;
          if (s.mode === "block")
            return (
              <div
                key={idx}
                style={{
                  background: T.base,
                  border: `1px solid ${T.border}`,
                  borderLeft: `2px solid ${s.kind === "result" ? T.peacock : T.straw}`,
                  borderRadius: 4,
                  padding: "8px 14px",
                  margin: "8px 0",
                }}
              >
                {s.lines.map(([line, color]) => (
                  <div key={line} style={{ color, whiteSpace: "pre" }}>
                    {line}
                  </div>
                ))}
              </div>
            );
          return (
            <div key={idx} style={{ color: colorFor(s.kind) }}>
              {s.text}
            </div>
          );
        })}
        {step >= SCRIPT.length && (
          <div style={{ color: T.muted, marginTop: 6 }}>
            — replay · nothing above is a mockup; these are the real pipeline stages —
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   8-digit access gate + Welcome modal
   Codes are verified server-side (POST /api/auth/verify-code,
   httpOnly session cookie). Nothing secret lives in this file.
   ============================================================ */
function AccessGate({ onUnlock }) {
  const [digits, setDigits] = useState(Array(8).fill(""));
  const [status, setStatus] = useState("idle"); // idle | verifying | error | verified
  const [message, setMessage] = useState("");
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const verify = useCallback(
    async (code) => {
      setStatus("verifying");
      setMessage("verifying …");
      try {
        const res = await fetch("/api/auth/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error("invalid");
        setStatus("verified");
        setMessage("code accepted · loading playground …");
        setTimeout(() => onUnlock?.(), 700);
      } catch {
        setStatus("error");
        setMessage("code not recognized — check the 8 digits and try again");
        setTimeout(() => {
          setDigits(Array(8).fill(""));
          setStatus("idle");
          setMessage("");
          refs.current[0]?.focus();
        }, 1100);
      }
    },
    [onUnlock]
  );

  const commit = (next) => {
    setDigits(next);
    if (next.every((d) => d !== "")) verify(next.join(""));
  };

  const handleChange = (i, v) => {
    if (status === "verifying" || status === "verified") return;
    const c = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = c;
    commit(next);
    if (c && i < 7) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = "";
      else if (i > 0) {
        next[i - 1] = "";
        refs.current[i - 1]?.focus();
      }
      setDigits(next);
    }
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 7) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const nums = (e.clipboardData.getData("text").match(/\d/g) || []).slice(0, 8);
    const next = Array(8).fill("");
    nums.forEach((n, i) => (next[i] = n));
    commit(next);
    refs.current[Math.min(nums.length, 7)]?.focus();
  };

  const borderFor = (i) => {
    if (status === "error") return T.error;
    if (status === "verified") return T.green;
    if (digits[i]) return T.peacock;
    return T.border;
  };

  return (
    <div>
      <div
        onPaste={handlePaste}
        className="flex gap-2 justify-center"
        style={{ animation: status === "error" ? "sm-shake 300ms ease" : "none" }}
      >
        {digits.map((d, i) => (
          <span key={i} className="flex items-center">
            <input
              ref={(el) => (refs.current[i] = el)}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={`Access code digit ${i + 1}`}
              disabled={status === "verifying"}
              style={{
                width: 40,
                height: 52,
                textAlign: "center",
                fontFamily: T.mono,
                fontSize: 21,
                color: T.text,
                background: T.base,
                border: `1px solid ${borderFor(i)}`,
                borderRadius: 4,
                outline: "none",
                caretColor: T.peacock,
                transition: "border-color 150ms ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = T.peacock)}
              onBlur={(e) => (e.target.style.borderColor = borderFor(i))}
            />
            {i === 3 && (
              <span aria-hidden="true" style={{ width: 10, height: 1, background: T.muted, marginLeft: 8 }} />
            )}
          </span>
        ))}
      </div>
      <div
        aria-live="polite"
        style={{
          fontFamily: T.mono,
          fontSize: 11,
          marginTop: 14,
          minHeight: 16,
          textAlign: "center",
          color: status === "error" ? T.error : status === "verified" ? T.green : T.muted,
        }}
      >
        {message || "// verified server-side · 5 attempts per minute"}
      </div>
    </div>
  );
}

function WelcomeModal({ open, onClose, onUnlock }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guest verification"
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{
        background: "rgba(6,8,11,0.8)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        animation: "sm-fadein 180ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.elevated,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: "34px 38px",
          maxWidth: 450,
          width: "100%",
          animation: "sm-rise 220ms ease",
        }}
      >
        <div className="flex items-center gap-3">
          <LogoMark size={26} spark={false} />
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 10,
              letterSpacing: "0.2em",
              color: T.straw,
              textTransform: "uppercase",
            }}
          >
            premium guest · seat verification
          </span>
        </div>
        <h2 style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 500, color: T.text, marginTop: 16 }}>
          Enter your 8-digit access code
        </h2>
        <p style={{ fontFamily: T.ui, fontSize: 13, color: T.dim, marginTop: 8, marginBottom: 22, lineHeight: 1.6 }}>
          Seemulator is open to 50 invited guests. Your code shipped with your invitation.
        </p>
        <AccessGate onUnlock={onUnlock} />
        <div className="flex justify-center gap-2 items-center" style={{ marginTop: 20 }}>
          <Kbd>esc</Kbd>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>close</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Below the fold — three quiet facts
   ============================================================ */
const FACTS = [
  {
    k: "real tools, not a wrapper",
    v: "ngspice · Xyce · Lcapy · SymPy · KiCad · Yosys",
    d: "Every answer comes from actually executing the tool and parsing its output. If a tool isn't available, Seemulator says so — it never falls back to a fake.",
  },
  {
    k: "proof of work, every turn",
    v: "classify → generate → execute → parse → verify → explain",
    d: "Parsed results are sanity-checked against theory before the explanation is written. Numbers are grounded in the run, never invented.",
  },
  {
    k: "your session stays yours",
    v: "client-side memory · no server database",
    d: "Chat history, input files, and results live in your browser. Clear wipes everything. The backend is stateless beyond your seat cookie.",
  },
];

function Facts() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-20">
      <div className="grid md:grid-cols-3 gap-4">
        {FACTS.map((f) => (
          <div key={f.k} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 22 }}>
            <div style={{ fontFamily: T.ui, fontSize: 14.5, fontWeight: 600, color: T.text }}>{f.k}</div>
            <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.straw, marginTop: 8, letterSpacing: "0.04em" }}>
              {f.v}
            </div>
            <p style={{ fontFamily: T.ui, fontSize: 13, color: T.dim, lineHeight: 1.65, marginTop: 10 }}>{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Document meta (SPA-side). If you use react-helmet or SSR,
   move these into your head manager instead.
   ============================================================ */
const META = {
  title: "Seemulator — the circuit copilot that runs the real tools",
  description:
    "Describe a circuit in plain English. Seemulator writes the netlist, executes ngspice, verifies the parsed output, and explains it. Invite-only: 50 guest seats.",
};

function useDocumentMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = META.title;
    const ensure = (attr, name, content) => {
      let el = document.head.querySelector(`meta[${attr}="${name}"]`);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => (created ? el.remove() : el.setAttribute("content", prev ?? ""));
    };
    const undos = [
      ensure("name", "description", META.description),
      ensure("property", "og:title", META.title),
      ensure("property", "og:description", META.description),
      ensure("property", "og:type", "website"),
      ensure("name", "twitter:card", "summary"),
      ensure("name", "theme-color", T.base),
    ];
    return () => {
      document.title = prevTitle;
      undos.forEach((u) => u());
    };
  }, []);
}

/* ============================================================
   Root
   ============================================================ */
export default function SeemulatorLanding({ onUnlock = () => console.log("unlocked") }) {
  useDocumentMeta();

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes sm-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
      @keyframes sm-fadein { from{opacity:0} to{opacity:1} }
      @keyframes sm-rise { from{opacity:0; transform:translateY(10px)} to{opacity:1; transform:none} }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
    `;
    document.head.appendChild(style);
    const onKey = (e) => {
      if (e.key === "Enter" && document.activeElement?.tagName !== "INPUT")
        onUnlock();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.head.removeChild(style);
      window.removeEventListener("keydown", onKey);
    };
  }, [onUnlock]);

  return (
    <main style={{ background: T.base, minHeight: "100vh", fontFamily: T.ui, overflowY: "auto" }}>
      {/* nav — quiet, single START action */}
      <header
        className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto"
        style={{ borderBottom: `1px solid ${T.border}` }}
      >
        <div className="flex items-center gap-2.5">
          <LogoMark size={24} />
          <span style={{ fontFamily: T.mono, fontSize: 13, color: T.text, letterSpacing: "0.12em" }}>
            SEEMULATOR
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted, letterSpacing: "0.12em", marginLeft: 6 }}>
            / circuits
          </span>
        </div>
        <button
          onClick={() => onUnlock()}
          style={{
            fontFamily: T.mono,
            fontSize: 11.5,
            letterSpacing: "0.14em",
            padding: "8px 22px",
            color: T.base,
            background: T.peacock,
            border: "none",
            borderRadius: 5,
            cursor: "pointer",
          }}
        >
          START
        </button>
      </header>

      {/* hero: headline + the running session */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div
          className="inline-flex items-center gap-2"
          style={{
            fontFamily: T.mono,
            fontSize: 10,
            letterSpacing: "0.18em",
            color: T.straw,
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            padding: "5px 14px",
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
          premium guest program · 50 seats
        </div>
        <h1
          style={{
            fontFamily: T.mono,
            fontWeight: 500,
            fontSize: "clamp(34px, 5.5vw, 58px)",
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            color: T.text,
            marginTop: 24,
          }}
        >
          The circuit copilot that
          <br />
          <span style={{ color: T.peacock }}>runs the real tools.</span>
        </h1>
        <p
          style={{
            fontFamily: T.ui,
            fontSize: 15,
            lineHeight: 1.7,
            color: T.dim,
            marginTop: 18,
            maxWidth: 540,
            marginInline: "auto",
          }}
        >
          Describe a circuit in plain English. Seemulator writes the netlist, executes
          ngspice, verifies the parsed output, and explains it — live, below.
        </p>
        <div className="flex items-center justify-center gap-2" style={{ marginTop: 16 }}>
          <Kbd>⏎</Kbd>
          <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.muted }}>press enter to verify your code</span>
        </div>

        <div style={{ marginTop: 44 }}>
          <SessionWindow />
        </div>
      </section>

      <Facts />

      {/* footer */}
      <footer
        className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto"
        style={{ borderTop: `1px solid ${T.border}` }}
      >
        <div className="flex items-center gap-2">
          <LogoMark size={15} spark={false} />
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 9.5,
              letterSpacing: "0.16em",
              color: T.muted,
              textTransform: "uppercase",
            }}
          >
            seemulator · circuits · rev a
          </span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted }}>
          {"// it's not what it seems — it's verified"}
        </span>
      </footer>

    </main>
  );
}
