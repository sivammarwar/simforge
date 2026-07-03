import React, { useState } from 'react';
import './LandingPage.css';

/* =========================================================================
   SimForge — Landing Page
   One file, on purpose: this used to be spread across a dozen components
   (Hero, TextScroll, Highlights, Team, Features, CTA, StartButton, plus
   three separate "fancy" widgets — ChromaGrid, CircularGallery,
   CircularTextButton, and a 3D Lanyard). All of that motion and machinery
   has been removed in favor of a plain, readable page that looks like it
   was laid out by hand. Keeping it as one file makes it easy to read the
   whole page top to bottom and to maintain without hunting across files.
   ========================================================================= */

/* ---------- content -------------------------------------------------- */

const DOMAINS = [
  { code: 'CKT', name: 'Circuits', note: 'Voltage dividers, filters, RLC networks.', icon: 'circuit' },
  { code: 'STR', name: 'Structures', note: 'Beams, trusses, stress and deflection.', icon: 'beam' },
  { code: 'FLD', name: 'Fluids', note: 'Pipe flow, pressure drop, basic CFD.', icon: 'fluid' },
  { code: 'THM', name: 'Thermal', note: 'Heat transfer and temperature budgets.', icon: 'thermal' },
  { code: 'PWR', name: 'Power', note: 'Loads, supplies, distribution.', icon: 'power' },
  { code: 'PHY', name: 'Physics', note: 'Kinematics, forces, energy.', icon: 'physics' },
  { code: 'CTL', name: 'Control', note: 'Loops, gains, step response.', icon: 'control' },
  { code: 'MAT', name: 'Materials', note: 'Properties, fatigue, selection.', icon: 'material' },
  { code: 'AER', name: 'Aerospace', note: 'Airfoils, lift, drag, Mach.', icon: 'aero' }
];

const PROCESS = [
  { label: 'You describe the problem', body: 'In your own words — a beam that\u2019s too thin, a filter that isn\u2019t working, a wing at Mach 2. No forms, no menus.' },
  { label: 'SimForge reads it', body: 'It works out which domain you\u2019re in and what kind of problem this actually is, then builds the right model.' },
  { label: 'A real solver runs it', body: 'The model is routed to the appropriate solver and comes back as numbers, a plot, and a plain explanation.' }
];

const NOTES = [
  'Engineering simulation that actually understands you.',
  'No PhD required.',
  'No tears.',
  'Just results.',
  'Talk dirty to your physics.',
  'We won\u2019t judge.',
  'Why date humans when you can talk to simulations?',
  'Stop clicking.',
  'Start talking.',
  'SimForge speaks your language.',
  'Literally.',
  'Just type what you want.',
  'Watch the physics happen.',
  '\u201cHey SimForge, what happens if I make this beam 20% thinner?\u201d',
  '\u201cShow me the airflow on this wing at Mach 2.\u201d',
  '\u201cMake this bridge less likely to collapse. Please.\u201d',
  'And boom.',
  'Results.',
  'Visual. Numerical. Instant.',
  'No manuals.',
  'No waiting.',
  'No praying.',
  'Just results.',
  'Mechanics.',
  'Fluids.',
  'Thermal.',
  'Circuits.',
  'Aerospace.',
  'Semiconductors.',
  'We got you.',
  'Type your problem.',
  'SimForge does the math.',
  'You look like a genius.',
  'It\u2019s that simple.',
  'Seriously.',
  'For students.',
  'Because textbooks are boring.',
  'And simulations are sexy.',
  'Because you have better things to do than click menus.',
  'For startups.',
  'Because you can\u2019t afford expensive software.',
  'For anyone.',
  'Because why not?',
  'Engineering software stuck in 1995?',
  'Complex. Expensive. Ugly. Boring.',
  'We built SimForge to change that.',
  'We want engineers to fall in love with simulation again.',
  'We want students to actually enjoy learning physics.',
  'And we want startups to build faster, cheaper, and smarter.',
  'Is that too much to ask?',
  'Less frustration than your ex.',
  'More reliable than your morning coffee.',
  'Smarter than your average engineering professor.',
  'Cheaper than therapy.',
  'And more effective.',
  '\u201cI talked to SimForge about my beam deflection.\u201d',
  '\u201cIt didn\u2019t judge me.\u201d',
  '\u201cMy professor thinks I\u2019m a genius.\u201d',
  '\u201cLittle does he know, SimForge did all the work.\u201d',
  '\u201cI used SimForge for my startup.\u201d',
  '\u201cWe saved $50,000 on software.\u201d',
  '\u201cAlso, it\u2019s kinda hot.\u201d',
  'Fake testimonials.',
  'But they could be real.',
  'One day.',
  'Ready to fall in love?',
  'Get started now.',
  'It\u2019s free.',
  'It\u2019s fun.',
  'And it\u2019s about time.',
  'No credit card.',
  'No commitment.',
  'Just physics and flirting.',
  'We promise not to send you spam.',
  'Just good vibes and sexy simulations.',
  'Made with care, caffeine, and a little bit of delusion.'
];

// A small fixed set of tilt angles so each handwritten line leans a
// slightly different way, the way notes actually look when someone
// scribbles a page over several sittings \u2014 cycled by index, so it
// stays identical on every render (no layout jitter, no animation).
const TILTS = [-1.6, 1.1, -0.7, 1.8, -1.3, 0.6, -2, 1.4, -0.4, 0.9];

const TEAM = [
  { name: 'Aditya Kumar', role: 'Founder & Lead AI Engineer', image: 'https://i.pravatar.cc/300?img=1' },
  { name: 'Priya Sharma', role: 'Mechanical Engineering', image: 'https://i.pravatar.cc/300?img=5' },
  { name: 'Raj Patel', role: 'Electrical & Power Systems', image: 'https://i.pravatar.cc/300?img=8' },
  { name: 'Dr. Sarah Chen', role: 'Research Director', image: 'https://i.pravatar.cc/300?img=9' },
  { name: 'Michael Torres', role: 'Aerospace Engineer', image: 'https://i.pravatar.cc/300?img=12' },
  { name: 'Emily Zhang', role: 'Control Systems', image: 'https://i.pravatar.cc/300?img=16' },
  { name: 'David Kim', role: 'Materials Science', image: 'https://i.pravatar.cc/300?img=20' },
  { name: 'Lisa Johnson', role: 'Fluid Dynamics', image: 'https://i.pravatar.cc/300?img=25' }
];

/* ---------- small hand-drawn icon set (deliberately a little uneven) -- */

function Icon({ name }) {
  const common = { viewBox: '0 0 48 48', className: 'sketch-icon', 'aria-hidden': true };
  switch (name) {
    case 'circuit':
      return (
        <svg {...common}>
          <path d="M6 24h9M33 24h9M15 24a3 3 0 106 0 3 3 0 00-6 0zM27 24a3 3 0 106 0 3 3 0 00-6 0z" />
          <path d="M24 12v6M24 30v6M18 12h12M18 36h12" />
        </svg>
      );
    case 'beam':
      return (
        <svg {...common}>
          <path d="M6 34h36M10 34V20l8-8h12l8 8v14" />
          <path d="M18 34V22M30 34V22M14 34l4-6M34 34l-4-6" />
        </svg>
      );
    case 'fluid':
      return (
        <svg {...common}>
          <path d="M6 20c4-4 8 4 12 0s8-4 12 0 8 4 12 0" />
          <path d="M6 30c4-4 8 4 12 0s8-4 12 0 8 4 12 0" />
        </svg>
      );
    case 'thermal':
      return (
        <svg {...common}>
          <path d="M21 8v22a6 6 0 106 0V8a3 3 0 00-6 0z" />
          <path d="M21 26h6" />
        </svg>
      );
    case 'power':
      return (
        <svg {...common}>
          <path d="M26 6L12 27h9l-3 15 16-23h-10z" />
        </svg>
      );
    case 'physics':
      return (
        <svg {...common}>
          <ellipse cx="24" cy="24" rx="18" ry="7" transform="rotate(20 24 24)" />
          <ellipse cx="24" cy="24" rx="18" ry="7" transform="rotate(-20 24 24)" />
          <circle cx="24" cy="24" r="2.6" />
        </svg>
      );
    case 'control':
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="15" />
          <path d="M24 24l9-6" />
          <circle cx="24" cy="24" r="2" />
        </svg>
      );
    case 'material':
      return (
        <svg {...common}>
          <path d="M24 6l16 9v18l-16 9-16-9V15z" />
          <path d="M24 6v18M8 15l16 9 16-9M24 24v18" />
        </svg>
      );
    case 'aero':
      return (
        <svg {...common}>
          <path d="M6 26l36-16-14 18 3 12-8-9-9 4 4-8z" />
        </svg>
      );
    default:
      return null;
  }
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="btn-arrow" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/* ---------- page ------------------------------------------------------ */

export default function LandingPage({ onNavigateToApp }) {
  return (
    <div className="landing-page">
      <Hero onNavigateToApp={onNavigateToApp} />
      <Process />
      <Notes />
      <Domains />
      <Team />
      <CTA onNavigateToApp={onNavigateToApp} />
      <Footer />
    </div>
  );
}

/* ---------- hero -------------------------------------------------------
   The signature element of the page: a hero that reads like the cover
   sheet of a lab notebook — ruled lines, a hand-underlined title, and a
   stamped "index tab" button instead of a glowing pill. */

function Hero({ onNavigateToApp }) {
  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <p className="hero-eyebrow">Field notes on SimForge</p>

        <h1 className="hero-title">
          Engineering problems,
          <br />
          solved in <span className="underline-ink">plain English.</span>
        </h1>

        <p className="hero-sub">
          Describe a circuit, a beam, an airfoil, a control loop. SimForge works out what
          kind of problem it is, builds the right model, and hands back numbers you can
          check by hand if you want to.
        </p>

        <button type="button" className="stamp-button" onClick={onNavigateToApp}>
          Start a problem
          <ArrowIcon />
        </button>

        <p className="hero-list">
          {DOMAINS.map((d, i) => (
            <span key={d.code}>
              {d.name}
              {i < DOMAINS.length - 1 && <span className="hero-list-dot"> &middot; </span>}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

/* ---------- process ----------------------------------------------------
   This is a genuine sequence (input -> reasoning -> output), so numbering
   is earned here rather than decorative. */

function Process() {
  return (
    <section className="process">
      <h2 className="section-kicker">How it actually works</h2>
      <ol className="process-list">
        {PROCESS.map((step, i) => (
          <li key={step.label} className="process-item">
            <span className="process-number">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3 className="process-label">{step.label}</h3>
              <p className="process-body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- notes -------------------------------------------------------
   The full flirty margin-notes page, set as if actually handwritten:
   every line gets a small fixed tilt and sits on its own, no scroll-jacked
   reveal, no fading in and out \u2014 just a page you can read top to bottom
   at your own pace. */

function Notes() {
  return (
    <section className="notes">
      <span className="tape tape-left" aria-hidden="true" />
      <span className="tape tape-right" aria-hidden="true" />
      <h2 className="notes-title">A note, scribbled between simulations</h2>
      <ul className="notes-list">
        {NOTES.map((line, i) => {
          const isQuote = line.trim().startsWith('\u201c');
          const tilt = `${TILTS[i % TILTS.length]}deg`;
          return (
            <li
              key={line}
              className={`notes-item${isQuote ? ' is-quote' : ''}`}
              style={{ '--tilt': tilt }}
            >
              {line}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- domains ------------------------------------------------------
   Native <details> gives a real expand/collapse without any animation
   library — one line becomes a short description on click. */

function Domains() {
  return (
    <section className="domains" id="domains">
      <h2 className="section-kicker">Nine domains</h2>
      <div className="domains-grid">
        {DOMAINS.map((d) => (
          <details className="domain-card" key={d.code}>
            <summary>
              <Icon name={d.icon} />
              <span className="domain-name">{d.name}</span>
              <span className="domain-code">{d.code}</span>
            </summary>
            <p className="domain-note">{d.note}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- team --------------------------------------------------------
   Square photos with a folded paper corner instead of the old glowing,
   mouse-tracking gradient cards. */

function Team() {
  return (
    <section className="team" id="team">
      <h2 className="section-kicker">Who built this</h2>
      <p className="team-sub">Engineers, researchers, and people who got tired of clunky simulation software.</p>
      <div className="team-grid">
        {TEAM.map((person) => (
          <figure className="team-card" key={person.name}>
            <div className="team-photo">
              <img src={person.image} alt={person.name} loading="lazy" />
            </div>
            <figcaption>
              <span className="team-name">{person.name}</span>
              <span className="team-role">{person.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ---------- CTA ---------------------------------------------------------- */

function CTA({ onNavigateToApp }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setEmail('');
    }, 3000);
  };

  return (
    <section className="cta">
      <h2 className="cta-title">Start solving problems today</h2>
      <p className="cta-sub">No credit card. Free while we're in early access.</p>

      <button type="button" className="stamp-button" onClick={onNavigateToApp}>
        Get early access
        <ArrowIcon />
      </button>

      <p className="cta-or">or leave your email and we'll write to you</p>

      <form className="cta-form" onSubmit={handleSubmit}>
        <input
          type="email"
          className="cta-input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="cta-submit">
          {submitted ? 'Added \u2014 thank you' : 'Join the list'}
        </button>
      </form>
    </section>
  );
}

/* ---------- footer --------------------------------------------------------
   Same architecture as a typical product footer \u2014 a brand column with a
   social row, three link columns with headings and lists, then a centered
   bottom bar \u2014 just restyled in ink and paper instead of a dark SaaS
   theme, and with hand-drawn line icons instead of glowing brand marks. */

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="social-icon" aria-hidden="true">
      <path d="M3 5h18v14H3z" />
      <path d="M3 6l9 7 9-7" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="social-icon" aria-hidden="true">
      <path d="M8 6L2 12l6 6M16 6l6 6-6 6" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 32 32" className="pen-icon" aria-hidden="true">
      <path d="M6 26l1.6-6.4L21 6.2a2.4 2.4 0 013.4 0l1.4 1.4a2.4 2.4 0 010 3.4L12.4 24.4 6 26z" />
      <path d="M18.5 9.5l4 4" />
    </svg>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-column footer-column--brand">
          <h3 className="footer-brand">SimForge</h3>
          <p className="footer-tagline">
            A note left at the bottom of the page: thank you for reading this far.
            Now go describe a problem and see what happens.
          </p>
          <div className="footer-social">
            <a href="https://github.com/" className="social-link" aria-label="GitHub">
              <CodeIcon />
            </a>
            <a href="mailto:hello@simforge.app" className="social-link" aria-label="Email">
              <MailIcon />
            </a>
          </div>
        </div>

        <div className="footer-column">
          <h4 className="footer-heading">Product</h4>
          <ul className="footer-links">
            <li><a href="#domains">Domains</a></li>
            <li><a href="#top">Start a problem</a></li>
          </ul>
        </div>

        <div className="footer-column">
          <h4 className="footer-heading">Company</h4>
          <ul className="footer-links">
            <li><a href="#team">The team</a></li>
            <li><a href="mailto:hello@simforge.app">Say hello</a></li>
          </ul>
        </div>

        <div className="footer-column">
          <h4 className="footer-heading">Get in touch</h4>
          <ul className="footer-links">
            <li><a href="mailto:hello@simforge.app">hello@simforge.app</a></li>
            <li><a href="https://github.com/">github.com/simforge</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <PenIcon />
        <span>&copy; {new Date().getFullYear()} SimForge — written and drawn by hand, not by template.</span>
      </div>
    </footer>
  );
}