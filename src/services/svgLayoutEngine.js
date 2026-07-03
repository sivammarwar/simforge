/**
 * svgLayoutEngine.js — Stage 2: Scene graph → SVG
 *
 * Architecture: AI decides WHAT exists (scene graph). This file decides WHERE
 * pixels go using a library of pure geometric primitives. No LLM touches
 * coordinates. Every position is computed via real trig.
 *
 * Domains covered: Physics, Circuits, Structural, Fluids, Semiconductors,
 *                  Aerospace, Thermal, Control, Materials, Power
 *
 * Primitive library (Section A) — pure functions, no side-effects, unit-testable.
 * Symbol renderers   (Section B) — composites built from primitives.
 * Domain layouts     (Section C) — scene-graph consumers per domain.
 * Entry point        (Section D) — renderSceneGraph(sceneGraph, domain).
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const CANVAS = { width: 400, height: 260, marginX: 15, marginY: 10, maxX: 385, maxY: 250 };

export const COLORS = {
  background:      '#0D0F12',
  componentBorder: '#3B82F6',
  componentFill:   '#1E293B',
  componentFill2:  '#0F172A',
  wire:            '#E2E8F0',
  ground:          '#6B7280',
  // Physics forces
  forceArrow:      '#EF4444',   // gravity / applied (red)
  normalForce:     '#10B981',   // normal (green)
  friction:        '#F59E0B',   // friction (amber)
  tension:         '#A78BFA',   // tension / rope (violet)
  springColor:     '#06B6D4',   // spring (cyan)
  // Structural
  beamColor:       '#3B82F6',
  loadArrow:       '#EF4444',
  reactionArrow:   '#10B981',
  momentArc:       '#F59E0B',
  // Thermal
  hot:             '#EF4444',
  cold:            '#3B82F6',
  // Semiconductor / device layers
  nType:           '#3B82F6',
  pType:           '#EF4444',
  oxide:           '#A3E635',
  metal:           '#9CA3AF',
  substrate:       '#374151',
  // Fluid
  fluidBlue:       '#0EA5E9',
  // Power / Energy
  phaseA:          '#EF4444',
  phaseB:          '#F59E0B',
  phaseC:          '#3B82F6',
  // Misc
  accent:          '#8B5CF6',
  text:            '#E2E8F0',
  textDim:         '#94A3B8',
  highlight:       '#FCD34D',
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A — GEOMETRIC PRIMITIVES
// Pure functions: (numbers) → SVG string fragment.
// All angles in degrees (converted to radians internally).
// ─────────────────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;

/**
 * P1. pivotPoint — returns {x,y} — the anchor for all rotate-relative-to ops.
 * No SVG output; used as a data primitive by other functions.
 */
export function pivotPoint(x, y) { return { x, y }; }

/**
 * P2. rotatePoint — rotate point (px,py) around pivot (ox,oy) by angleDeg.
 * Returns {x,y}.
 */
export function rotatePoint(px, py, ox, oy, angleDeg) {
  const a = angleDeg * RAD;
  const dx = px - ox, dy = py - oy;
  return {
    x: ox + dx * Math.cos(a) - dy * Math.sin(a),
    y: oy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/**
 * P3. rigidLink — straight line from (x1,y1) to (x2,y2).
 * Optional markerEnd id, stroke color, dasharray.
 */
export function rigidLink(x1, y1, x2, y2, stroke = COLORS.wire, sw = 2, markerEnd = '', dash = '') {
  const me = markerEnd ? ` marker-end="url(#${markerEnd})"` : '';
  const da = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${sw}"${da}${me}/>`;
}

/**
 * P4. vectorFromPoint — force / velocity arrow from origin, angle in degrees
 * (SVG convention: 0° = right, 90° = down, 270° = up).
 * length scales with magnitude (clamped 28–65 px).
 */
export function vectorFromPoint(ox, oy, angleDeg, magnitude, color = COLORS.forceArrow, markerId = 'arrow-red', label = '', sw = 2.5) {
  const length = Math.min(65, Math.max(28, parseFloat(magnitude) * 0.6 || 40));
  const a = angleDeg * RAD;
  const ex = ox + length * Math.cos(a);
  const ey = oy + length * Math.sin(a);
  const lx = ox + (length + 10) * Math.cos(a);
  const ly = oy + (length + 10) * Math.sin(a);
  let svg = `<line x1="${r(ox)}" y1="${r(oy)}" x2="${r(ex)}" y2="${r(ey)}" stroke="${color}" stroke-width="${sw}" marker-end="url(#${markerId})"/>`;
  if (label) svg += labelText(lx, ly, label, 9, color);
  return svg;
}

/**
 * P5. curvedVector — arc arrow for torques / moments / angular velocity.
 * Draws an arc of radius `rad` centred on (cx,cy) from startDeg to endDeg,
 * with an arrowhead at the end.
 */
export function curvedVector(cx, cy, rad, startDeg, endDeg, color = COLORS.momentArc, label = '') {
  const s = startDeg * RAD, e = endDeg * RAD;
  const x1 = cx + rad * Math.cos(s), y1 = cy + rad * Math.sin(s);
  const x2 = cx + rad * Math.cos(e), y2 = cy + rad * Math.sin(e);
  const sweep = ((endDeg - startDeg) % 360 + 360) % 360 > 180 ? 1 : 0;
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  let svg = `<path d="M ${r(x1)} ${r(y1)} A ${rad} ${rad} 0 ${large} ${sweep} ${r(x2)} ${r(y2)}" stroke="${color}" stroke-width="2" fill="none" marker-end="url(#arrow-moment)"/>`;
  if (label) {
    const mx = cx + (rad + 12) * Math.cos(((startDeg + endDeg) / 2) * RAD);
    const my = cy + (rad + 12) * Math.sin(((startDeg + endDeg) / 2) * RAD);
    svg += labelText(mx, my, label, 9, color);
  }
  return svg;
}

/**
 * P6. rotatedSurface — a rectangle (incline, beam segment, plate) rotated about
 * its left-bottom corner by angleDeg. Returns SVG polygon.
 */
export function rotatedSurface(x0, y0, width, height, angleDeg, fill = COLORS.componentFill, stroke = COLORS.componentBorder, sw = 2) {
  const corners = [
    { x: x0,         y: y0 },
    { x: x0 + width, y: y0 },
    { x: x0 + width, y: y0 - height },
    { x: x0,         y: y0 - height },
  ].map(p => rotatePoint(p.x, p.y, x0, y0, -angleDeg)); // negative: SVG y-axis flipped
  const pts = corners.map(p => `${r(p.x)},${r(p.y)}`).join(' ');
  return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

/**
 * P7. labeledShape — a rectangle with centred label and optional sub-label.
 */
export function labeledShape(cx, cy, w, h, label, sublabel = '', fill = COLORS.componentFill, stroke = COLORS.componentBorder, sw = 2, fontSize = 11) {
  const x = cx - w / 2, y = cy - h / 2;
  let svg = `<rect x="${r(x)}" y="${r(y)}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="2"/>`;
  svg += `<text x="${r(cx)}" y="${r(cy + fontSize * 0.4)}" text-anchor="middle" fill="${COLORS.text}" font-size="${fontSize}" font-family="monospace" font-weight="bold">${label}</text>`;
  if (sublabel) svg += `<text x="${r(cx)}" y="${r(cy + fontSize * 1.4)}" text-anchor="middle" fill="${COLORS.textDim}" font-size="${fontSize - 2}" font-family="monospace">${sublabel}</text>`;
  return svg;
}

/**
 * P8. labelCollisionCheck — returns true if two axis-aligned bounding boxes overlap.
 * Used to shift labels before emitting them.
 */
export function labelCollisionCheck(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

// Helper: round to 2 dp
function r(v) { return Math.round(v * 100) / 100; }

// Helper: SVG text node
function labelText(x, y, text, size = 10, fill = COLORS.text, anchor = 'middle') {
  return `<text x="${r(x)}" y="${r(y)}" text-anchor="${anchor}" fill="${fill}" font-size="${size}" font-family="monospace">${text}</text>`;
}

// Helper: dashed line
function dashedLine(x1, y1, x2, y2, color = COLORS.textDim, dash = '4,3') {
  return rigidLink(x1, y1, x2, y2, color, 1, '', dash);
}

// Helper: hatching ground lines below a point or along a line
function groundHatch(x, y, width = 30) {
  let svg = rigidLink(x - width / 2, y, x + width / 2, y, COLORS.ground, 2);
  for (let i = 0; i < 5; i++) {
    const xi = x - width / 2 + i * (width / 4);
    svg += rigidLink(xi, y, xi - 6, y + 6, COLORS.ground, 1);
  }
  return svg;
}

// Helper: polyline from array of {x,y}
function polyline(points, stroke = COLORS.wire, sw = 2, fill = 'none') {
  const pts = points.map(p => `${r(p.x)},${r(p.y)}`).join(' ');
  return `<polyline points="${pts}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"/>`;
}

// Helper: circle
function circle(cx, cy, rr, fill = COLORS.componentFill, stroke = COLORS.componentBorder, sw = 2) {
  return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${rr}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

// Helper: text along angle (for incline labels etc.)
function angledText(cx, cy, text, angleDeg, fill = COLORS.text, size = 9) {
  return `<text x="${r(cx)}" y="${r(cy)}" text-anchor="middle" fill="${fill}" font-size="${size}" font-family="monospace" transform="rotate(${-angleDeg},${r(cx)},${r(cy)})">${text}</text>`;
}

// Helper: triangle polygon
function triangle(x1, y1, x2, y2, x3, y3, fill = COLORS.componentFill, stroke = COLORS.componentBorder, sw = 2) {
  return `<polygon points="${r(x1)},${r(y1)} ${r(x2)},${r(y2)} ${r(x3)},${r(y3)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

// Helper: zigzag spring from (x1,y1) to (x2,y2), n coils
function springPath(x1, y1, x2, y2, coils = 6, amplitude = 8) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux; // normal
  const step = len / (coils * 2 + 2);
  const pts = [{ x: x1, y: y1 }];
  for (let i = 0; i < coils * 2; i++) {
    const t = (i + 1) * step;
    const sign = i % 2 === 0 ? 1 : -1;
    pts.push({ x: x1 + ux * t + nx * amplitude * sign, y: y1 + uy * t + ny * amplitude * sign });
  }
  pts.push({ x: x2, y: y2 });
  return polyline(pts, COLORS.springColor, 2);
}

// Helper: damper symbol (parallel with internal piston)
function damperSymbol(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy * 6, ny = ux * 6;
  let svg = rigidLink(x1, y1, mx - ux * 5, my - uy * 5, COLORS.textDim, 2);
  svg += `<rect x="${r(mx - ux * 12 - 5)}" y="${r(my - uy * 12 - 5)}" width="10" height="10" fill="${COLORS.componentFill}" stroke="${COLORS.textDim}" stroke-width="1.5" transform="rotate(${Math.atan2(dy, dx) / RAD},${r(mx)},${r(my)})"/>`;
  svg += rigidLink(mx + ux * 5, my + uy * 5, x2, y2, COLORS.textDim, 2);
  return svg;
}

// Helper: pulley circle at (cx,cy) with radius rr
function pulleySymbol(cx, cy, rr = 14) {
  return circle(cx, cy, rr, COLORS.componentFill2, COLORS.tension, 2) + circle(cx, cy, 3, COLORS.tension, COLORS.tension, 1);
}

// Helper: arrow marker defs
function arrowDefs() {
  const mk = (id, color) =>
    `<marker id="${id}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${color}"/></marker>`;
  return `<defs>
    ${mk('arrow-red',    COLORS.forceArrow)}
    ${mk('arrow-green',  COLORS.normalForce)}
    ${mk('arrow-amber',  COLORS.friction)}
    ${mk('arrow-violet', COLORS.tension)}
    ${mk('arrow-cyan',   COLORS.springColor)}
    ${mk('arrow-blue',   COLORS.componentBorder)}
    ${mk('arrow-white',  COLORS.wire)}
    ${mk('arrow-yellow', COLORS.highlight)}
    ${mk('arrow-moment', COLORS.momentArc)}
    ${mk('arrow-hot',    COLORS.hot)}
    ${mk('arrow-cold',   COLORS.cold)}
    ${mk('arrow-phaseA', COLORS.phaseA)}
    ${mk('arrow-phaseB', COLORS.phaseB)}
    ${mk('arrow-phaseC', COLORS.phaseC)}
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${COLORS.forceArrow}"/></marker>
  </defs>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B — SYMBOL RENDERERS
// Each renders one engineering symbol. Built from Section A primitives.
// ─────────────────────────────────────────────────────────────────────────────

// ── B1: CIRCUIT SYMBOLS ──────────────────────────────────────────────────────

/** Horizontal resistor zig-zag centred at (cx,cy), length 36px */
export function renderResistor(cx, cy, value = '') {
  const x = cx - 18;
  const pts = [
    { x, y: cy }, { x: x + 4, y: cy - 7 }, { x: x + 8, y: cy + 7 },
    { x: x + 12, y: cy - 7 }, { x: x + 16, y: cy + 7 }, { x: x + 20, y: cy - 7 },
    { x: x + 24, y: cy + 7 }, { x: x + 28, y: cy - 7 }, { x: x + 36, y: cy },
  ];
  let svg = polyline(pts, COLORS.componentBorder, 2);
  if (value) svg += labelText(cx, cy - 13, value, 9);
  return svg;
}

/** Vertical capacitor at (cx,cy), plate gap 5px */
export function renderCapacitor(cx, cy, value = '') {
  let svg = rigidLink(cx - 12, cy, cx - 2, cy, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 2,  cy, cx + 12, cy, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 2, cy - 8, cx - 2, cy + 8, COLORS.componentBorder, 2.5);
  svg += rigidLink(cx + 2, cy - 8, cx + 2, cy + 8, COLORS.componentBorder, 2.5);
  if (value) svg += labelText(cx, cy - 13, value, 9);
  return svg;
}

/** Inductor (series of bumps) horizontal at (cx,cy) */
export function renderInductor(cx, cy, value = '') {
  let svg = '';
  const x0 = cx - 18;
  svg += rigidLink(x0, cy, x0 + 4, cy, COLORS.componentBorder, 2);
  for (let i = 0; i < 4; i++) {
    const bx = x0 + 4 + i * 8;
    svg += `<path d="M ${bx} ${cy} Q ${bx+4} ${cy-10} ${bx+8} ${cy}" stroke="${COLORS.componentBorder}" stroke-width="2" fill="none"/>`;
  }
  svg += rigidLink(x0 + 36, cy, x0 + 40, cy, COLORS.componentBorder, 2);
  if (value) svg += labelText(cx, cy - 14, value, 9);
  return svg;
}

/** Voltage source circle at (cx,cy) */
export function renderVoltageSource(cx, cy, value = '') {
  let svg = circle(cx, cy, 14, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += labelText(cx - 4, cy - 2, '+', 11, '#10B981', 'middle');
  svg += labelText(cx + 4, cy + 7, '−', 11, '#EF4444', 'middle');
  if (value) svg += labelText(cx, cy + 26, value, 9);
  return svg;
}

/** Current source at (cx,cy) */
export function renderCurrentSource(cx, cy, value = '') {
  let svg = circle(cx, cy, 14, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += vectorFromPoint(cx, cy + 8, 270, 10, COLORS.normalForce, 'arrow-green');
  if (value) svg += labelText(cx, cy + 26, value, 9);
  return svg;
}

/** AC source at (cx,cy) */
export function renderACSource(cx, cy, value = '') {
  let svg = circle(cx, cy, 14, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += `<path d="M ${cx-8} ${cy} Q ${cx-4} ${cy-8} ${cx} ${cy} Q ${cx+4} ${cy+8} ${cx+8} ${cy}" stroke="${COLORS.normalForce}" stroke-width="1.5" fill="none"/>`;
  if (value) svg += labelText(cx, cy + 26, value, 9);
  return svg;
}

/** Ground symbol at (x,y) — hangs downward */
export function renderGround(x, y) {
  let svg = rigidLink(x, y, x, y + 6, COLORS.ground, 2);
  svg += rigidLink(x - 10, y + 6, x + 10, y + 6, COLORS.ground, 2.5);
  svg += rigidLink(x - 6,  y + 10, x + 6,  y + 10, COLORS.ground, 2);
  svg += rigidLink(x - 2,  y + 14, x + 2,  y + 14, COLORS.ground, 1.5);
  return svg;
}

/** Diode at (cx,cy) horizontal — anode left */
export function renderDiode(cx, cy, value = '', type = 'normal') {
  let svg = rigidLink(cx - 18, cy, cx - 8, cy, COLORS.componentBorder, 2);
  svg += triangle(cx - 8, cy - 8, cx - 8, cy + 8, cx + 8, cy, COLORS.componentFill, COLORS.componentBorder, 2);
  if (type === 'zener') {
    svg += rigidLink(cx + 8, cy - 10, cx + 8, cy + 10, COLORS.componentBorder, 2.5);
    svg += rigidLink(cx + 8, cy - 10, cx + 5, cy - 13, COLORS.componentBorder, 2);
    svg += rigidLink(cx + 8, cy + 10, cx + 11, cy + 13, COLORS.componentBorder, 2);
  } else if (type === 'led') {
    svg += rigidLink(cx + 8, cy - 8, cx + 8, cy + 8, COLORS.componentBorder, 2.5);
    svg += vectorFromPoint(cx + 4, cy - 6, 315, 12, COLORS.highlight, 'arrow-yellow');
    svg += vectorFromPoint(cx + 8, cy - 8, 315, 12, COLORS.highlight, 'arrow-yellow');
  } else if (type === 'schottky') {
    svg += rigidLink(cx + 8, cy - 8, cx + 8, cy + 8, COLORS.componentBorder, 2.5);
    svg += rigidLink(cx + 8, cy - 8, cx + 5, cy - 8, COLORS.componentBorder, 2);
    svg += rigidLink(cx + 8, cy + 8, cx + 11, cy + 8, COLORS.componentBorder, 2);
  } else {
    svg += rigidLink(cx + 8, cy - 8, cx + 8, cy + 8, COLORS.componentBorder, 2.5);
  }
  svg += rigidLink(cx + 8, cy, cx + 18, cy, COLORS.componentBorder, 2);
  if (value) svg += labelText(cx, cy - 14, value, 9);
  return svg;
}

/** NPN BJT at (cx,cy) */
export function renderNPN(cx, cy, label = '') {
  let svg = circle(cx, cy, 16, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 16, cy, cx - 6, cy, COLORS.componentBorder, 2); // base
  svg += rigidLink(cx - 6, cy - 10, cx - 6, cy + 10, COLORS.componentBorder, 2.5); // base line
  svg += rigidLink(cx - 6, cy - 8, cx + 10, cy - 16, COLORS.componentBorder, 2); // collector
  svg += rigidLink(cx - 6, cy + 8, cx + 10, cy + 16, COLORS.componentBorder, 2); // emitter
  // Arrow on emitter
  svg += triangle(cx + 8, cy + 14, cx + 4, cy + 18, cx + 12, cy + 19, COLORS.componentBorder, COLORS.componentBorder);
  if (label) svg += labelText(cx + 18, cy, label, 9);
  return svg;
}

/** PNP BJT at (cx,cy) */
export function renderPNP(cx, cy, label = '') {
  let svg = circle(cx, cy, 16, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 16, cy, cx - 6, cy, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 6, cy - 10, cx - 6, cy + 10, COLORS.componentBorder, 2.5);
  svg += rigidLink(cx - 6, cy - 8, cx + 10, cy - 16, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 6, cy + 8, cx + 10, cy + 16, COLORS.componentBorder, 2);
  svg += triangle(cx + 2, cy + 6, cx - 2, cy + 10, cx + 6, cy + 12, COLORS.componentBorder, COLORS.componentBorder);
  if (label) svg += labelText(cx + 18, cy, label, 9);
  return svg;
}

/** N-channel MOSFET at (cx,cy) */
export function renderNMOS(cx, cy, label = '') {
  let svg = circle(cx, cy, 16, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 16, cy, cx - 10, cy, COLORS.componentBorder, 2); // gate
  svg += rigidLink(cx - 10, cy - 12, cx - 10, cy + 12, COLORS.componentBorder, 2.5); // gate plate
  svg += rigidLink(cx - 7, cy - 10, cx + 4, cy - 10, COLORS.componentBorder, 2); // drain body
  svg += rigidLink(cx - 7, cy + 10, cx + 4, cy + 10, COLORS.componentBorder, 2); // source body
  svg += rigidLink(cx - 7, cy - 10, cx - 7, cy + 10, COLORS.componentBorder, 2); // channel
  svg += rigidLink(cx + 4, cy - 10, cx + 4, cy - 2, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 4, cy + 10, cx + 4, cy + 2, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 4, cy, cx + 16, cy, COLORS.componentBorder, 2);
  // Arrow (n-channel inward)
  svg += triangle(cx - 4, cy - 1, cx - 4, cy + 5, cx + 1, cy + 2, COLORS.componentBorder, COLORS.componentBorder);
  if (label) svg += labelText(cx + 20, cy, label, 9);
  return svg;
}

/** P-channel MOSFET at (cx,cy) */
export function renderPMOS(cx, cy, label = '') {
  let svg = renderNMOS(cx, cy, label);
  // Invert arrow direction — add bubble on gate
  svg += circle(cx - 12, cy, 3, 'none', COLORS.componentBorder, 1.5);
  return svg;
}

/** CMOS Inverter pair (PMOS on top, NMOS on bottom) */
export function renderCMOSInverter(cx, cy) {
  let svg = renderPMOS(cx, cy - 30);
  svg += renderNMOS(cx, cy + 30);
  svg += rigidLink(cx, cy - 14, cx, cy + 14, COLORS.wire, 1.5);
  svg += labelText(cx - 28, cy, 'IN', 9, COLORS.textDim, 'end');
  svg += labelText(cx + 28, cy, 'OUT', 9, COLORS.textDim, 'start');
  return svg;
}

/** Op-Amp triangle at (cx,cy) pointing right */
export function renderOpAmp(cx, cy, label = '') {
  const pts = `${cx - 20},${cy - 20} ${cx - 20},${cy + 20} ${cx + 20},${cy}`;
  let svg = `<polygon points="${pts}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += labelText(cx - 14, cy - 6, '+', 10, '#10B981');
  svg += labelText(cx - 14, cy + 9, '−', 10, '#EF4444');
  if (label) svg += labelText(cx + 28, cy, label, 9);
  return svg;
}

/** Transformer at (cx,cy) */
export function renderTransformer(cx, cy, turnsRatio = '') {
  // Primary coils (left)
  for (let i = 0; i < 3; i++) {
    svg_tmp = `<path d="M ${cx-22} ${cy-16+i*12} Q ${cx-18} ${cy-22+i*12} ${cx-14} ${cy-16+i*12} Q ${cx-10} ${cy-10+i*12} ${cx-6} ${cy-16+i*12}" stroke="${COLORS.componentBorder}" stroke-width="2" fill="none"/>`;
    if (i === 0) { var svg = svg_tmp; } else { svg += svg_tmp; }
  }
  // Core lines
  svg += rigidLink(cx - 4, cy - 18, cx - 4, cy + 20, COLORS.ground, 2.5);
  svg += rigidLink(cx + 4, cy - 18, cx + 4, cy + 20, COLORS.ground, 2.5);
  // Secondary coils (right)
  for (let i = 0; i < 3; i++) {
    svg += `<path d="M ${cx+6} ${cy-16+i*12} Q ${cx+10} ${cy-22+i*12} ${cx+14} ${cy-16+i*12} Q ${cx+18} ${cy-10+i*12} ${cx+22} ${cy-16+i*12}" stroke="${COLORS.componentBorder}" stroke-width="2" fill="none"/>`;
  }
  if (turnsRatio) svg += labelText(cx, cy + 26, turnsRatio, 9);
  return svg;
}

/** Switch open/closed at (cx,cy) horizontal */
export function renderSwitch(cx, cy, closed = false) {
  let svg = rigidLink(cx - 14, cy, cx - 6, cy, COLORS.componentBorder, 2);
  svg += circle(cx - 6, cy, 2, COLORS.componentBorder, COLORS.componentBorder);
  svg += circle(cx + 6, cy, 2, COLORS.componentBorder, COLORS.componentBorder);
  if (closed) {
    svg += rigidLink(cx - 6, cy, cx + 6, cy, COLORS.componentBorder, 2);
  } else {
    svg += rigidLink(cx - 6, cy, cx + 4, cy - 8, COLORS.componentBorder, 2);
  }
  svg += rigidLink(cx + 6, cy, cx + 14, cy, COLORS.componentBorder, 2);
  return svg;
}

/** SCR (Thyristor) at (cx,cy) */
export function renderSCR(cx, cy, label = '') {
  let svg = triangle(cx - 8, cy - 8, cx - 8, cy + 8, cx + 6, cy, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 6, cy - 8, cx + 6, cy + 8, COLORS.componentBorder, 2.5);
  svg += rigidLink(cx + 6, cy + 4, cx + 14, cy + 12, COLORS.componentBorder, 2); // gate
  svg += rigidLink(cx - 8, cy, cx - 18, cy, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 6, cy, cx + 18, cy, COLORS.componentBorder, 2);
  if (label) svg += labelText(cx, cy - 16, label, 9);
  return svg;
}

/** TRIAC at (cx,cy) */
export function renderTRIAC(cx, cy, label = '') {
  let svg = triangle(cx - 8, cy - 10, cx - 8, cy + 2, cx + 6, cy - 4, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += triangle(cx + 6, cy + 2, cx + 6, cy - 10, cx - 8, cy - 4, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 1, cy - 10, cx - 1, cy + 2, COLORS.componentBorder, 2.5);
  svg += rigidLink(cx - 1, cy - 2, cx + 10, cy + 8, COLORS.componentBorder, 2); // gate
  svg += rigidLink(cx - 8, cy - 4, cx - 18, cy - 4, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 6, cy - 4, cx + 18, cy - 4, COLORS.componentBorder, 2);
  if (label) svg += labelText(cx, cy + 18, label, 9);
  return svg;
}

/** 555 Timer block at (cx,cy) */
export function render555Timer(cx, cy, mode = 'astable') {
  let svg = labeledShape(cx, cy, 60, 50, '555', mode, COLORS.componentFill, COLORS.componentBorder, 2, 12);
  // Pin stubs
  svg += rigidLink(cx - 30, cy - 14, cx - 38, cy - 14, COLORS.wire, 1.5);
  svg += rigidLink(cx - 30, cy,      cx - 38, cy,      COLORS.wire, 1.5);
  svg += rigidLink(cx - 30, cy + 14, cx - 38, cy + 14, COLORS.wire, 1.5);
  svg += rigidLink(cx + 30, cy - 14, cx + 38, cy - 14, COLORS.wire, 1.5);
  svg += rigidLink(cx + 30, cy,      cx + 38, cy,      COLORS.wire, 1.5);
  svg += labelText(cx - 44, cy - 14, 'Vcc', 8, COLORS.textDim, 'end');
  svg += labelText(cx - 44, cy,      'THR', 8, COLORS.textDim, 'end');
  svg += labelText(cx - 44, cy + 14, 'DIS', 8, COLORS.textDim, 'end');
  svg += labelText(cx + 44, cy - 14, 'OUT', 8, COLORS.textDim, 'start');
  svg += labelText(cx + 44, cy,      'RST', 8, COLORS.textDim, 'start');
  return svg;
}

/** PLL block diagram at (cx,cy) */
export function renderPLL(cx, cy) {
  let svg = labeledShape(cx - 70, cy, 36, 22, 'PD', 'Phase Det', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += labeledShape(cx,       cy, 36, 22, 'LPF', 'Loop Filt', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += labeledShape(cx + 70,  cy, 36, 22, 'VCO', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 10);
  svg += rigidLink(cx - 52, cy, cx - 18, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx + 18, cy, cx + 52, cy, COLORS.wire, 1.5);
  // Feedback
  svg += rigidLink(cx + 88, cy, cx + 88, cy + 28, COLORS.wire, 1.5);
  svg += rigidLink(cx - 88, cy + 28, cx + 88, cy + 28, COLORS.wire, 1.5);
  svg += rigidLink(cx - 88, cy + 28, cx - 88, cy, COLORS.wire, 1.5);
  svg += vectorFromPoint(cx - 88, cy, 90, 8, COLORS.wire, 'arrow-white');
  svg += labelText(cx - 90, cy - 10, 'IN', 8, COLORS.textDim, 'end');
  svg += labelText(cx + 100, cy, 'OUT', 8, COLORS.textDim, 'start');
  return svg;
}

/** Generic logic gate (box with label) at (cx,cy) */
export function renderLogicGate(cx, cy, gateType = 'AND', inputs = 2) {
  let svg = labeledShape(cx, cy, 44, 30, gateType, '', COLORS.componentFill, COLORS.componentBorder, 2, 10);
  const step = 20 / inputs;
  for (let i = 0; i < inputs; i++) {
    const iy = cy - 10 + (i + 0.5) * step * inputs / (inputs);
    svg += rigidLink(cx - 22, iy, cx - 32, iy, COLORS.wire, 1.5);
  }
  svg += rigidLink(cx + 22, cy, cx + 32, cy, COLORS.wire, 1.5);
  if (gateType === 'NOT') { svg += circle(cx + 22, cy, 4, COLORS.componentFill, COLORS.componentBorder, 1.5); }
  return svg;
}

/** Flip-flop block at (cx,cy), type = SR | D | JK */
export function renderFlipFlop(cx, cy, type = 'D') {
  let svg = labeledShape(cx, cy, 50, 50, type, 'FF', COLORS.componentFill, COLORS.componentBorder, 2, 12);
  const pins = type === 'SR' ? ['S', 'R'] : type === 'JK' ? ['J', 'K'] : ['D', 'CLK'];
  svg += rigidLink(cx - 25, cy - 10, cx - 35, cy - 10, COLORS.wire, 1.5);
  svg += rigidLink(cx - 25, cy + 10, cx - 35, cy + 10, COLORS.wire, 1.5);
  svg += rigidLink(cx + 25, cy - 10, cx + 35, cy - 10, COLORS.wire, 1.5);
  svg += rigidLink(cx + 25, cy + 10, cx + 35, cy + 10, COLORS.wire, 1.5);
  svg += labelText(cx - 40, cy - 10, pins[0], 8, COLORS.textDim, 'end');
  svg += labelText(cx - 40, cy + 10, pins[1], 8, COLORS.textDim, 'end');
  svg += labelText(cx + 40, cy - 10, 'Q',  8, COLORS.textDim, 'start');
  svg += labelText(cx + 40, cy + 10, 'Q̄', 8, COLORS.textDim, 'start');
  return svg;
}

/** Optocoupler at (cx,cy) */
export function renderOptocoupler(cx, cy) {
  let svg = circle(cx, cy, 20, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += renderDiode(cx - 6, cy - 4, '', 'led');   // LED side
  svg += renderNPN(cx + 6, cy + 4, '');             // Phototransistor side
  svg += dashedLine(cx - 2, cy - 2, cx + 2, cy + 2, COLORS.highlight, '2,2');
  svg += labelText(cx, cy + 28, 'OPTO', 8);
  return svg;
}

/** Hall Effect sensor block */
export function renderHallSensor(cx, cy) {
  let svg = labeledShape(cx, cy, 40, 26, 'HALL', '', COLORS.componentFill, COLORS.componentBorder, 2, 9);
  svg += vectorFromPoint(cx, cy - 18, 270, 14, COLORS.accent, 'arrow-blue'); // B field
  svg += labelText(cx + 6, cy - 22, 'B', 8, COLORS.accent);
  return svg;
}

/** Varistor at (cx,cy) */
export function renderVaristor(cx, cy, value = '') {
  let svg = renderResistor(cx, cy, value);
  svg += rigidLink(cx - 10, cy + 8, cx + 10, cy - 8, COLORS.highlight, 1.5);
  svg += labelText(cx, cy + 14, 'MOV', 8, COLORS.highlight);
  return svg;
}

/** Thermistor at (cx,cy), type = NTC | PTC */
export function renderThermistor(cx, cy, type = 'NTC') {
  let svg = renderResistor(cx, cy, '');
  svg += labelText(cx - 10, cy + 12, type, 8, COLORS.hot);
  return svg;
}

/** Charge pump voltage doubler */
export function renderChargePump(cx, cy) {
  let svg = labeledShape(cx, cy, 50, 30, 'CP', 'V×2', COLORS.componentFill, COLORS.componentBorder, 2, 10);
  svg += renderCapacitor(cx - 30, cy - 16, 'C1');
  svg += renderCapacitor(cx + 30, cy - 16, 'C2');
  svg += rigidLink(cx - 25, cy, cx - 50, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx + 25, cy, cx + 50, cy, COLORS.wire, 1.5);
  svg += labelText(cx - 55, cy, 'Vin', 8, COLORS.textDim, 'end');
  svg += labelText(cx + 55, cy, 'Vout', 8, COLORS.textDim, 'start');
  return svg;
}

/** Gate driver circuit */
export function renderGateDriver(cx, cy) {
  let svg = labeledShape(cx - 30, cy, 36, 26, 'GD', 'Gate Drv', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += renderNMOS(cx + 40, cy - 20);
  svg += rigidLink(cx - 12, cy, cx + 22, cy - 20, COLORS.wire, 1.5);
  svg += labelText(cx - 55, cy, 'PWM', 8, COLORS.textDim, 'end');
  return svg;
}

/** EMI filter at (cx,cy) */
export function renderEMIFilter(cx, cy) {
  let svg = renderInductor(cx - 20, cy, '');
  svg += renderCapacitor(cx + 10, cy + 10, '');
  svg += rigidLink(cx - 40, cy, cx - 38, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx + 28, cy, cx + 40, cy, COLORS.wire, 1.5);
  svg += labelText(cx, cy + 24, 'EMI Filter', 8, COLORS.textDim);
  return svg;
}

/** Snubber circuit at (cx,cy) */
export function renderSnubber(cx, cy) {
  let svg = renderResistor(cx, cy - 10, 'Rs');
  svg += renderCapacitor(cx + 20, cy - 10, 'Cs');
  svg += labelText(cx + 10, cy + 8, 'Snubber', 8, COLORS.textDim);
  return svg;
}

/** Crystal oscillator symbol at (cx,cy) */
export function renderCrystal(cx, cy, value = '') {
  let svg = rigidLink(cx - 14, cy, cx - 6, cy, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 6, cy - 8, cx - 6, cy + 8, COLORS.componentBorder, 2.5);
  svg += `<rect x="${cx - 4}" y="${cy - 7}" width="8" height="14" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += rigidLink(cx + 4, cy - 8, cx + 4, cy + 8, COLORS.componentBorder, 2.5);
  svg += rigidLink(cx + 4, cy, cx + 14, cy, COLORS.componentBorder, 2);
  if (value) svg += labelText(cx, cy - 14, value, 9);
  return svg;
}

/** RF mixer (ring of 4 diodes) at (cx,cy) */
export function renderRFMixer(cx, cy) {
  let svg = circle(cx, cy, 20, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += labelText(cx, cy + 4, 'MIX', 9);
  svg += rigidLink(cx - 20, cy, cx - 30, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx + 20, cy, cx + 30, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx, cy - 20, cx, cy - 30, COLORS.wire, 1.5);
  svg += labelText(cx - 34, cy, 'RF', 8, COLORS.textDim, 'end');
  svg += labelText(cx + 34, cy, 'IF', 8, COLORS.textDim, 'start');
  svg += labelText(cx, cy - 34, 'LO', 8, COLORS.textDim);
  return svg;
}

/** Transmission line distributed model at (cx,cy) */
export function renderTransmissionLine(cx, cy, length = 200) {
  const sections = 3;
  const step = length / sections;
  let svg = '';
  for (let i = 0; i < sections; i++) {
    const x = cx - length / 2 + i * step;
    svg += renderInductor(x + step / 4, cy - 14, i === 0 ? 'L' : '');
    svg += renderCapacitor(x + step / 2, cy + 10, i === 0 ? 'C' : '');
    svg += renderResistor(x + step / 4, cy - 30, i === 0 ? 'R' : '');
    svg += rigidLink(x, cy - 14, x + step / 2, cy - 14, COLORS.wire, 1.5);
    svg += rigidLink(x + step / 2, cy - 14, x + step / 2, cy + 2, COLORS.wire, 1.5);
    svg += rigidLink(x + step / 2, cy + 18, x + step / 2, cy + 28, COLORS.wire, 1.5);
    svg += rigidLink(x, cy + 28, x + step, cy + 28, COLORS.wire, 1.5);
  }
  svg += labelText(cx, cy + 40, 'Transmission Line (Distributed)', 8, COLORS.textDim);
  return svg;
}

/** Phototransistor at (cx,cy) */
export function renderPhototransistor(cx, cy) {
  let svg = renderNPN(cx, cy, '');
  svg += vectorFromPoint(cx - 14, cy - 20, 135, 14, COLORS.highlight, 'arrow-yellow');
  svg += vectorFromPoint(cx - 6,  cy - 20, 135, 14, COLORS.highlight, 'arrow-yellow');
  svg += labelText(cx, cy + 24, 'Photo-T', 8, COLORS.textDim);
  return svg;
}

// ── B2: PHYSICS SYMBOLS ──────────────────────────────────────────────────────

/** Block (mass) at (cx,cy) with optional mass label */
export function renderBlock(cx, cy, mass = '', w = 40, h = 40) {
  return labeledShape(cx, cy, w, h, mass, '', COLORS.componentFill, COLORS.componentBorder, 2, 11);
}

/** Incline surface: base at (bx,by), length L, angle θ degrees */
export function renderIncline(bx, by, length, angleDeg, friction = false) {
  const tip = rotatePoint(bx + length, by, bx, by, -angleDeg);
  // Surface
  let svg = rigidLink(bx, by, tip.x, tip.y, COLORS.ground, 3);
  // Ground under base
  svg += groundHatch(bx + length / 2, by + 6, length);
  // Angle label
  const arcR = 28;
  svg += `<path d="M ${bx + arcR} ${by} A ${arcR} ${arcR} 0 0 0 ${r(bx + arcR * Math.cos(angleDeg * RAD))} ${r(by - arcR * Math.sin(angleDeg * RAD))}" stroke="${COLORS.textDim}" stroke-width="1" fill="none"/>`;
  svg += labelText(bx + arcR + 12, by - 8, `${angleDeg}°`, 9, COLORS.textDim);
  if (friction) {
    // Short cross-hatch lines on surface
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const px = bx + (tip.x - bx) * t;
      const py = by + (tip.y - by) * t;
      const np = rotatePoint(px + 5, py + 4, px, py, -angleDeg);
      svg += rigidLink(px, py, np.x, np.y, COLORS.friction, 1);
    }
  }
  return svg;
}

/**
 * P9. renderDoubleIncline — two slopes rising to a shared peak (∧ shape).
 * Left slope rises at angle1 from the left base; right slope rises at angle2
 * from the right base. The peak is computed from the left slope geometry.
 * Returns {svg, peakX, peakY, leftBase, rightBase} so the caller can place
 * blocks and the pulley at the correct computed positions.
 *
 * Canvas layout: left base at (lbx, baseY), right base at (rbx, baseY).
 * Peak is where the two slopes meet (shared apex = top of left slope).
 */
export function renderDoubleIncline(lbx, rbx, baseY, angle1Deg, angle2Deg, friction1 = false, friction2 = false) {
  // Compute peak from left slope: rise from lbx going right and up
  const halfSpan = (rbx - lbx) / 2;
  // Peak X is chosen so both slopes look balanced given their angles
  const h1 = halfSpan * Math.tan(angle1Deg * RAD);
  const h2 = halfSpan * Math.tan(angle2Deg * RAD);
  // Use weighted midpoint: peak where left slope height meets right slope height
  // peakX = lbx + L1*cos(a1) where L1 = h/sin(a1) and h is peak height
  // Simplification: compute peak as intersection of the two slope lines
  // Left slope: y = baseY - (x - lbx)*tan(a1)
  // Right slope: y = baseY - (rbx - x)*tan(a2)
  // Solve: (x - lbx)*tan(a1) = (rbx - x)*tan(a2)
  const t1 = Math.tan(angle1Deg * RAD);
  const t2 = Math.tan(angle2Deg * RAD);
  const peakX = (lbx * t1 + rbx * t2) / (t1 + t2);
  const peakH = (peakX - lbx) * t1;
  const peakY = baseY - peakH;

  let svg = '';

  // Left slope surface (rises right)
  svg += rigidLink(lbx, baseY, peakX, peakY, COLORS.ground, 3);
  // Right slope surface (descends right)
  svg += rigidLink(peakX, peakY, rbx, baseY, COLORS.ground, 3);
  // Ground base
  svg += rigidLink(lbx - 10, baseY, rbx + 10, baseY, COLORS.ground, 2);
  svg += groundHatch((lbx + rbx) / 2, baseY + 4, rbx - lbx + 20);

  // Left angle arc + label
  const arcR = 24;
  svg += `<path d="M ${lbx + arcR} ${baseY} A ${arcR} ${arcR} 0 0 0 ${r(lbx + arcR * Math.cos(angle1Deg * RAD))} ${r(baseY - arcR * Math.sin(angle1Deg * RAD))}" stroke="${COLORS.textDim}" stroke-width="1" fill="none"/>`;
  svg += labelText(lbx + arcR + 10, baseY - 8, `θ₁=${angle1Deg}°`, 8, COLORS.textDim);

  // Right angle arc + label (measured from right base, angle opens left)
  svg += `<path d="M ${rbx - arcR} ${baseY} A ${arcR} ${arcR} 0 0 1 ${r(rbx - arcR * Math.cos(angle2Deg * RAD))} ${r(baseY - arcR * Math.sin(angle2Deg * RAD))}" stroke="${COLORS.textDim}" stroke-width="1" fill="none"/>`;
  svg += labelText(rbx - arcR - 10, baseY - 8, `θ₂=${angle2Deg}°`, 8, COLORS.textDim, 'end');

  // Friction hatch marks on left slope
  if (friction1) {
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const px = lbx + (peakX - lbx) * t;
      const py = baseY + (peakY - baseY) * t;
      const np = rotatePoint(px + 5, py + 4, px, py, -angle1Deg);
      svg += rigidLink(px, py, np.x, np.y, COLORS.friction, 1);
    }
  }
  // Friction hatch marks on right slope (angle goes the other way)
  if (friction2) {
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const px = peakX + (rbx - peakX) * t;
      const py = peakY + (baseY - peakY) * t;
      const np = rotatePoint(px + 5, py + 4, px, py, angle2Deg);
      svg += rigidLink(px, py, np.x, np.y, COLORS.friction, 1);
    }
  }

  return { svg, peakX, peakY, lbx, rbx, baseY, angle1Deg, angle2Deg };
}

/**
 * Place a block (mass) flush on the LEFT slope of a double incline,
 * at fractional position t (0=base, 1=peak) along that slope.
 * Returns {svg, cx, cy} — centre of block on canvas.
 */
export function placeBlockOnLeftSlope(geom, t, mass = '', w = 36, h = 36) {
  const { lbx, baseY, peakX, peakY, angle1Deg } = geom;
  const cx = lbx + (peakX - lbx) * t;
  const cy = baseY + (peakY - baseY) * t;
  const corners = [
    rotatePoint(cx - w / 2, cy - h / 2, cx, cy, -angle1Deg),
    rotatePoint(cx + w / 2, cy - h / 2, cx, cy, -angle1Deg),
    rotatePoint(cx + w / 2, cy + h / 2, cx, cy, -angle1Deg),
    rotatePoint(cx - w / 2, cy + h / 2, cx, cy, -angle1Deg),
  ];
  const pts = corners.map(p => `${r(p.x)},${r(p.y)}`).join(' ');
  let svg = `<polygon points="${pts}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += angledText(cx, cy, mass, angle1Deg, COLORS.text, 10);
  return { svg, cx, cy };
}

/**
 * Place a block flush on the RIGHT slope of a double incline,
 * at fractional position t (0=peak, 1=base) along that slope.
 * Returns {svg, cx, cy}.
 */
export function placeBlockOnRightSlope(geom, t, mass = '', w = 36, h = 36) {
  const { peakX, peakY, rbx, baseY, angle2Deg } = geom;
  const cx = peakX + (rbx - peakX) * t;
  const cy = peakY + (baseY - peakY) * t;
  // Right slope tilts the other way (-angle2Deg from horizontal, mirrored)
  const corners = [
    rotatePoint(cx - w / 2, cy - h / 2, cx, cy, angle2Deg),
    rotatePoint(cx + w / 2, cy - h / 2, cx, cy, angle2Deg),
    rotatePoint(cx + w / 2, cy + h / 2, cx, cy, angle2Deg),
    rotatePoint(cx - w / 2, cy + h / 2, cx, cy, angle2Deg),
  ];
  const pts = corners.map(p => `${r(p.x)},${r(p.y)}`).join(' ');
  let svg = `<polygon points="${pts}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += angledText(cx, cy, mass, -angle2Deg, COLORS.text, 10);
  return { svg, cx, cy };
}

/** Rope / string from (x1,y1) to (x2,y2) */
export function renderRope(x1, y1, x2, y2, label = '') {
  let svg = rigidLink(x1, y1, x2, y2, COLORS.tension, 2, 'arrow-violet');
  if (label) svg += labelText((x1 + x2) / 2 + 6, (y1 + y2) / 2, label, 9, COLORS.tension);
  return svg;
}

/** Pendulum: pivot at (px,py), length L, angle from vertical */
export function renderPendulum(px, py, length, angleDeg, mass = '') {
  const endX = px + length * Math.sin(angleDeg * RAD);
  const endY = py + length * Math.cos(angleDeg * RAD);
  let svg = circle(px, py, 4, COLORS.ground, COLORS.ground, 2); // pivot
  svg += rigidLink(px, py, endX, endY, COLORS.tension, 2);
  svg += circle(endX, endY, 12, COLORS.componentFill, COLORS.componentBorder, 2);
  if (mass) svg += labelText(endX, endY + 4, mass, 9);
  return svg;
}

/** Circular orbit/path dashed circle at (cx,cy) radius r */
export function renderOrbit(cx, cy, orbitR, label = '') {
  let svg = `<circle cx="${r(cx)}" cy="${r(cy)}" r="${orbitR}" fill="none" stroke="${COLORS.textDim}" stroke-width="1" stroke-dasharray="4,3"/>`;
  if (label) svg += labelText(cx + orbitR + 6, cy, label, 9, COLORS.textDim, 'start');
  return svg;
}

/** Spring+damper mounted vertically: top at (x,y1), bottom at (x,y2) */
export function renderSpringDamper(x, y1, y2, label = '') {
  const mx = x + 16;
  let svg = springPath(x, y1, x, y2 - 10);
  svg += damperSymbol(mx, y1 + 10, mx, y2 - 10);
  svg += rigidLink(x, y2 - 10, x, y2, COLORS.textDim, 1.5);
  svg += rigidLink(mx, y2 - 10, mx, y2, COLORS.textDim, 1.5);
  if (label) svg += labelText(x + 24, (y1 + y2) / 2, label, 9, COLORS.springColor);
  return svg;
}

/** Wheel/disk at (cx,cy) with radius r, showing rotation arrow */
export function renderWheel(cx, cy, rad = 18, torqueLabel = '') {
  let svg = circle(cx, cy, rad, COLORS.componentFill2, COLORS.componentBorder, 2);
  svg += circle(cx, cy, 4, COLORS.ground, COLORS.ground, 2);
  svg += curvedVector(cx, cy, rad - 4, 30, 260, COLORS.momentArc, torqueLabel);
  return svg;
}

/** Projectile trajectory parabola from (x0,y0) */
export function renderProjectileTrajectory(x0, y0, vx = 60, vy = -40, steps = 12) {
  const g = 4; // px per step² (scaled)
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    pts.push({ x: x0 + vx * i / steps * 2, y: y0 + vy * i / steps * 2 + 0.5 * g * Math.pow(i / steps * 2, 2) });
  }
  return polyline(pts, COLORS.highlight, 1.5) +
    vectorFromPoint(x0, y0, Math.atan2(vy, vx) / RAD, 28, COLORS.forceArrow, 'arrow-red', 'v₀');
}

// ── B3: STRUCTURAL SYMBOLS ───────────────────────────────────────────────────

/** Horizontal beam from (x1,y) to (x2,y) */
export function renderBeam(x1, x2, y, depth = 12) {
  return `<rect x="${r(x1)}" y="${r(y - depth / 2)}" width="${r(x2 - x1)}" height="${depth}" fill="${COLORS.componentFill}" stroke="${COLORS.beamColor}" stroke-width="2"/>`;
}

/** Pinned support (triangle) at (x,y) pointing up */
export function renderPinnedSupport(x, y) {
  let svg = triangle(x, y, x - 14, y + 18, x + 14, y + 18, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += groundHatch(x, y + 20, 30);
  return svg;
}

/** Roller support at (x,y) */
export function renderRollerSupport(x, y) {
  let svg = triangle(x, y, x - 12, y + 16, x + 12, y + 16, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += circle(x - 8, y + 20, 4, COLORS.componentFill, COLORS.componentBorder, 1.5);
  svg += circle(x,     y + 20, 4, COLORS.componentFill, COLORS.componentBorder, 1.5);
  svg += circle(x + 8, y + 20, 4, COLORS.componentFill, COLORS.componentBorder, 1.5);
  svg += groundHatch(x, y + 26, 30);
  return svg;
}

/** Fixed (wall) support at x, vertical beam at y */
export function renderFixedSupport(x, y, side = 'left') {
  const d = side === 'left' ? -1 : 1;
  let svg = `<rect x="${r(x - 8)}" y="${r(y - 20)}" width="8" height="40" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="1.5"/>`;
  for (let i = 0; i < 5; i++) {
    svg += rigidLink(x - 8 * d, y - 16 + i * 8, x - 16 * d, y - 10 + i * 8, COLORS.ground, 1);
  }
  return svg;
}

/** Point load arrow at (x, beamY), direction 'down'|'up', magnitude label */
export function renderPointLoad(x, beamY, direction = 'down', magnitude = '', color = COLORS.loadArrow) {
  const dy = direction === 'down' ? 1 : -1;
  const y1 = beamY - dy * 40;
  const y2 = beamY - dy * 2;
  const marker = direction === 'down' ? 'arrow-red' : 'arrow-green';
  let svg = rigidLink(x, y1, x, y2, color, 2.5, marker);
  if (magnitude) svg += labelText(x + 6, y1 + (dy > 0 ? 10 : -4), magnitude, 9, color, 'start');
  return svg;
}

/** Distributed load (UDL) from x1 to x2 above beamY */
export function renderUDL(x1, x2, beamY, magnitude = '', direction = 'down') {
  const dy = direction === 'down' ? 1 : -1;
  const topY = beamY - dy * 36;
  let svg = rigidLink(x1, topY, x2, topY, COLORS.loadArrow, 1.5);
  const n = Math.max(3, Math.round((x2 - x1) / 20));
  for (let i = 0; i <= n; i++) {
    const x = x1 + (x2 - x1) * i / n;
    const mark = i === n ? 'arrow-red' : '';
    svg += rigidLink(x, topY, x, beamY - dy * 2, COLORS.loadArrow, 1.5, mark);
  }
  if (magnitude) svg += labelText((x1 + x2) / 2, topY - 6, magnitude, 9, COLORS.loadArrow);
  return svg;
}

/** Moment arc at (x,beamY) with label */
export function renderMoment(x, beamY, magnitude = '', clockwise = true) {
  return curvedVector(x, beamY, 16, clockwise ? 30 : 210, clockwise ? 320 : 510, COLORS.momentArc, magnitude);
}

/** Triangular load: zero at x1, max at x2 */
export function renderTriangularLoad(x1, x2, beamY, magnitude = '') {
  const topY = beamY - 38;
  let svg = `<polygon points="${r(x1)},${r(beamY)} ${r(x2)},${r(topY)} ${r(x2)},${r(beamY)}" fill="rgba(239,68,68,0.12)" stroke="${COLORS.loadArrow}" stroke-width="1.5"/>`;
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const x = x1 + (x2 - x1) * t;
    const yTop = beamY - 38 * t;
    svg += rigidLink(x, yTop, x, beamY - 2, COLORS.loadArrow, 1.5, 'arrow-red');
  }
  if (magnitude) svg += labelText(x2 + 4, topY, magnitude, 9, COLORS.loadArrow, 'start');
  return svg;
}

/** Truss node at (x,y) */
export function renderTrussNode(x, y, label = '') {
  let svg = circle(x, y, 4, COLORS.componentBorder, COLORS.componentBorder, 1);
  if (label) svg += labelText(x, y - 8, label, 8, COLORS.textDim);
  return svg;
}

/** Truss member from (x1,y1) to (x2,y2), force type */
export function renderTrussMember(x1, y1, x2, y2, forceType = 'neutral', label = '') {
  const color = forceType === 'tension' ? COLORS.forceArrow : forceType === 'compression' ? COLORS.normalForce : COLORS.wire;
  let svg = rigidLink(x1, y1, x2, y2, color, 2);
  if (label) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    svg += labelText(mx + 4, my - 4, label, 8, color);
  }
  return svg;
}

/** Column with axial load at (cx, y_top), height H */
export function renderColumn(cx, yTop, height, load = '', type = 'pinned-pinned') {
  let svg = rigidLink(cx, yTop, cx, yTop + height, COLORS.componentBorder, 4);
  // End conditions
  if (type.startsWith('fixed')) {
    svg += `<rect x="${cx - 12}" y="${yTop - 6}" width="24" height="8" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="1.5"/>`;
  } else {
    svg += circle(cx, yTop, 5, COLORS.componentFill, COLORS.componentBorder, 2);
  }
  if (type.endsWith('fixed')) {
    svg += `<rect x="${cx - 12}" y="${yTop + height - 2}" width="24" height="8" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="1.5"/>`;
  } else {
    svg += circle(cx, yTop + height, 5, COLORS.componentFill, COLORS.componentBorder, 2);
  }
  if (load) svg += renderPointLoad(cx, yTop, 'down', load);
  return svg;
}

/** Cross-section profile at (cx,cy), type = rectangle|I|T|circle */
export function renderCrossSection(cx, cy, type = 'rectangle', w = 30, h = 40) {
  if (type === 'rectangle') {
    return `<rect x="${cx-w/2}" y="${cy-h/2}" width="${w}" height="${h}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  }
  if (type === 'I') {
    return `<rect x="${cx-w/2}" y="${cy-h/2}" width="${w}" height="6" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>` +
           `<rect x="${cx-3}" y="${cy-h/2+6}" width="6" height="${h-12}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>` +
           `<rect x="${cx-w/2}" y="${cy+h/2-6}" width="${w}" height="6" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  }
  if (type === 'circle') return circle(cx, cy, w / 2, COLORS.componentFill, COLORS.componentBorder, 2);
  return labeledShape(cx, cy, w, h, type, '', COLORS.componentFill, COLORS.componentBorder, 2, 9);
}

/** Mohr's circle at (cx,cy) with σ and τ axes */
export function renderMohrsCircle(cx, cy, rad = 40, sigma1 = '', sigma2 = '', tau = '') {
  let svg = rigidLink(cx - rad - 14, cy, cx + rad + 14, cy, COLORS.textDim, 1, '', '');
  svg += rigidLink(cx, cy - rad - 12, cx, cy + rad + 12, COLORS.textDim, 1);
  svg += circle(cx, cy, rad, 'rgba(59,130,246,0.08)', COLORS.componentBorder, 1.5);
  svg += circle(cx - rad, cy, 4, COLORS.forceArrow, COLORS.forceArrow);
  svg += circle(cx + rad, cy, 4, COLORS.normalForce, COLORS.normalForce);
  svg += labelText(cx + rad + 16, cy, 'σ', 9, COLORS.textDim, 'start');
  svg += labelText(cx, cy - rad - 16, 'τ', 9, COLORS.textDim);
  if (sigma1) svg += labelText(cx + rad + 2, cy - 10, sigma1, 8, COLORS.normalForce, 'start');
  if (sigma2) svg += labelText(cx - rad - 2, cy - 10, sigma2, 8, COLORS.forceArrow, 'end');
  if (tau)    svg += labelText(cx + 6, cy - rad + 4, tau, 8, COLORS.highlight, 'start');
  return svg;
}

// ── B4: FLUID SYMBOLS ────────────────────────────────────────────────────────

/** Horizontal pipe section from (x1,y) to (x2,y), diameter d */
export function renderPipe(x1, x2, y, diameter = 10) {
  const hr = diameter / 2;
  let svg = rigidLink(x1, y - hr, x2, y - hr, COLORS.componentBorder, 1.5);
  svg += rigidLink(x1, y + hr, x2, y + hr, COLORS.componentBorder, 1.5);
  svg += `<rect x="${x1}" y="${y-hr}" width="${x2-x1}" height="${diameter}" fill="rgba(14,165,233,0.08)"/>`;
  return svg;
}

/** Pipe expansion from d1 to d2 at (cx,y) */
export function renderExpansion(cx, y, d1 = 8, d2 = 16) {
  const r1 = d1 / 2, r2 = d2 / 2;
  return `<polygon points="${cx-8},${y-r1} ${cx+8},${y-r2} ${cx+8},${y+r2} ${cx-8},${y+r1}" fill="rgba(14,165,233,0.1)" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
}

/** Pipe contraction from d1 to d2 at (cx,y) */
export function renderContraction(cx, y, d1 = 16, d2 = 8) {
  return renderExpansion(cx, y, d2, d1);
}

/** Pump symbol at (cx,cy) */
export function renderPump(cx, cy, label = '') {
  let svg = circle(cx, cy, 18, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += vectorFromPoint(cx, cy, 0, 12, COLORS.fluidBlue, 'arrow-blue');
  svg += rigidLink(cx - 18, cy, cx - 28, cy, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 18, cy, cx + 28, cy, COLORS.componentBorder, 2);
  if (label) svg += labelText(cx, cy + 28, label, 9);
  return svg;
}

/** Valve symbol (butterfly / generic) at (cx,cy) */
export function renderValve(cx, cy, type = 'gate', label = '') {
  let svg = '';
  if (type === 'gate' || type === 'ball') {
    svg += triangle(cx, cy - 10, cx - 10, cy + 6, cx + 10, cy + 6, COLORS.componentFill, COLORS.componentBorder, 2);
    svg += triangle(cx, cy + 10, cx - 10, cy - 6, cx + 10, cy - 6, COLORS.componentFill, COLORS.componentBorder, 2);
  } else if (type === 'butterfly') {
    svg += circle(cx, cy, 10, COLORS.componentFill, COLORS.componentBorder, 2);
    svg += rigidLink(cx - 7, cy - 7, cx + 7, cy + 7, COLORS.wire, 2);
  } else if (type === 'check') {
    svg += renderDiode(cx, cy, '', 'normal');
  } else {
    svg += `<rect x="${cx-10}" y="${cy-10}" width="20" height="20" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
    svg += rigidLink(cx, cy - 10, cx, cy - 18, COLORS.wire, 2); // actuator stem
  }
  svg += rigidLink(cx - 20, cy, cx - 10, cy, COLORS.componentBorder, 2);
  svg += rigidLink(cx + 10, cy, cx + 20, cy, COLORS.componentBorder, 2);
  if (label) svg += labelText(cx, cy + 18, label, 8);
  return svg;
}

/** Flow arrow indicator at (x,y) direction right=0 / left=180 */
export function renderFlowArrow(x, y, direction = 0, label = '') {
  return vectorFromPoint(x, y, direction, 16, COLORS.fluidBlue, 'arrow-blue', label);
}

/** Velocity profile (parabolic for laminar) at (x,y) facing right */
export function renderVelocityProfile(x, y, pipeR = 20, label = 'v') {
  const n = 7;
  let svg = '';
  for (let i = 0; i <= n; i++) {
    const ry = -pipeR + 2 * pipeR * i / n;
    const vlen = 30 * (1 - (ry / pipeR) ** 2); // parabolic
    svg += rigidLink(x, y + ry, x + vlen, y + ry, COLORS.fluidBlue, 1.5, i === Math.floor(n / 2) ? 'arrow-blue' : '');
  }
  svg += labelText(x + 36, y, label, 9, COLORS.fluidBlue, 'start');
  return svg;
}

/** Manometer U-tube at (cx, cy) with fluid levels */
export function renderManometer(cx, cy, h1 = 20, h2 = 35, fluid = COLORS.fluidBlue, label = 'ΔP') {
  const tw = 14, gap = 24;
  // Left tube
  let svg = rigidLink(cx - gap / 2 - tw, cy - 40, cx - gap / 2 - tw, cy + 30, COLORS.componentBorder, 1.5);
  svg += rigidLink(cx - gap / 2,     cy - 40, cx - gap / 2,     cy + 30, COLORS.componentBorder, 1.5);
  // Bottom U
  svg += `<path d="M ${cx-gap/2-tw} ${cy+30} Q ${cx} ${cy+44} ${cx+gap/2+tw} ${cy+30}" stroke="${COLORS.componentBorder}" stroke-width="1.5" fill="none"/>`;
  // Right tube
  svg += rigidLink(cx + gap / 2,     cy - 40, cx + gap / 2,     cy + 30, COLORS.componentBorder, 1.5);
  svg += rigidLink(cx + gap / 2 + tw, cy - 40, cx + gap / 2 + tw, cy + 30, COLORS.componentBorder, 1.5);
  // Fluid
  svg += `<rect x="${cx-gap/2-tw+1}" y="${cy+30-h1}" width="${tw-2}" height="${h1}" fill="${fluid}" opacity="0.5"/>`;
  svg += `<rect x="${cx+gap/2+1}" y="${cy+30-h2}" width="${tw-2}" height="${h2}" fill="${fluid}" opacity="0.5"/>`;
  // Labels
  svg += dashedLine(cx - gap / 2 - tw - 6, cy + 30 - h1, cx - gap / 2 - 1, cy + 30 - h1);
  svg += dashedLine(cx + gap / 2 + 1, cy + 30 - h2, cx + gap / 2 + tw + 6, cy + 30 - h2);
  svg += labelText(cx, cy - 50, label, 9, COLORS.fluidBlue);
  return svg;
}

/** Orifice plate inside pipe at (cx,cy) */
export function renderOrificePlate(cx, cy, pipeR = 12, orificeR = 6) {
  let svg = `<rect x="${cx-3}" y="${cy-pipeR}" width="6" height="${pipeR*2}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += `<rect x="${cx-3}" y="${cy-orificeR}" width="6" height="${orificeR*2}" fill="${COLORS.componentFill2}"/>`;
  svg += labelText(cx, cy - pipeR - 6, 'Orifice', 8, COLORS.textDim);
  return svg;
}

/** Venturi meter at (cx,cy) */
export function renderVenturi(cx, cy) {
  let svg = renderPipe(cx - 60, cx - 20, cy, 18);
  svg += `<polygon points="${cx-20},${cy-9} ${cx},${cy-4} ${cx},${cy+4} ${cx-20},${cy+9}" fill="rgba(14,165,233,0.12)" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += `<polygon points="${cx},${cy-4} ${cx+20},${cy-9} ${cx+20},${cy+9} ${cx},${cy+4}" fill="rgba(14,165,233,0.12)" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += renderPipe(cx + 20, cx + 60, cy, 18);
  svg += labelText(cx, cy + 22, 'Venturi', 8, COLORS.textDim);
  return svg;
}

/** Hydraulic jump in open channel at (cx,y) */
export function renderHydraulicJump(cx, y, y1 = 16, y2 = 32) {
  let svg = rigidLink(cx - 70, y + y1, cx, y + y1, COLORS.fluidBlue, 2); // supercritical
  svg += `<path d="M ${cx} ${y+y1} Q ${cx+8} ${y} ${cx+14} ${y+y2}" stroke="${COLORS.fluidBlue}" stroke-width="2" fill="none"/>`; // jump
  svg += rigidLink(cx + 14, y + y2, cx + 70, y + y2, COLORS.fluidBlue, 2); // subcritical
  svg += rigidLink(cx - 70, y + 50, cx + 70, y + 50, COLORS.ground, 2); // channel bottom
  svg += groundHatch(cx, y + 52, 140);
  svg += labelText(cx - 40, y + y1 - 8, 'y₁', 8, COLORS.fluidBlue);
  svg += labelText(cx + 40, y + y2 - 8, 'y₂', 8, COLORS.fluidBlue);
  return svg;
}

/** Centrifugal pump impeller cross-section at (cx,cy) */
export function renderImpeller(cx, cy, r_in = 16, r_out = 28) {
  let svg = circle(cx, cy, r_out, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += circle(cx, cy, r_in, COLORS.componentFill2, COLORS.componentBorder, 1.5);
  // Blades
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * RAD;
    const x1 = cx + r_in * Math.cos(a), y1 = cy + r_in * Math.sin(a);
    const x2 = cx + r_out * Math.cos(a + 0.4), y2 = cy + r_out * Math.sin(a + 0.4);
    svg += rigidLink(x1, y1, x2, y2, COLORS.fluidBlue, 1.5);
  }
  svg += vectorFromPoint(cx, cy - r_out, 270, 18, COLORS.fluidBlue, 'arrow-blue');
  return svg;
}

/** Airfoil outline at (cx,cy), chord length cl, angle of attack */
export function renderAirfoil(cx, cy, cl = 100, aoa = 0) {
  // NACA-like simple shape
  const n = 20;
  const upper = [], lower = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    const yt = 0.12 / 0.2 * cl * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
    upper.push({ x: cx - cl / 2 + x * cl, y: cy - yt });
    lower.push({ x: cx - cl / 2 + x * cl, y: cy + yt });
  }
  const allPts = [...upper, ...[...lower].reverse()];
  const rotated = allPts.map(p => rotatePoint(p.x, p.y, cx, cy, aoa));
  return polyline(rotated.concat([rotated[0]]), COLORS.componentBorder, 2, COLORS.componentFill) +
    (aoa !== 0 ? dashedLine(cx - cl / 2, cy, cx + cl / 2, cy, COLORS.textDim, '3,3') +
      labelText(cx + cl / 2 + 8, cy, `α=${aoa}°`, 9, COLORS.textDim, 'start') : '');
}

/** Boundary layer profile on flat plate at (x,y), length L */
export function renderBoundaryLayer(x, y, length = 160, maxThick = 40) {
  const n = 8;
  let svg = rigidLink(x, y, x + length, y, COLORS.ground, 2); // plate
  // Thickness envelope
  const envPts = [{ x, y }];
  for (let i = 1; i <= n; i++) {
    const xi = x + length * i / n;
    const thick = maxThick * Math.sqrt(i / n);
    envPts.push({ x: xi, y: y - thick });
  }
  envPts.push({ x: x + length, y });
  svg += polyline(envPts, COLORS.fluidBlue, 1, 'rgba(14,165,233,0.08)');
  svg += labelText(x + length / 2, y - maxThick - 8, 'Boundary Layer δ(x)', 8, COLORS.fluidBlue);
  return svg;
}

// ── B5: SEMICONDUCTOR SYMBOLS ─────────────────────────────────────────────────

/** MOSFET cross-section showing gate, oxide, channel at (cx,cy) */
export function renderMOSFETCrossSection(cx, cy, type = 'nmos') {
  const w = 130, h = 80;
  const ox = cx - w / 2, oy = cy - h / 2;
  // Substrate
  let svg = `<rect x="${ox}" y="${oy + h * 0.4}" width="${w}" height="${h * 0.6}" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="1.5" rx="2"/>`;
  svg += labelText(cx, oy + h * 0.7, type === 'nmos' ? 'p-Substrate' : 'n-Substrate', 8, COLORS.textDim);
  // Source / Drain
  const sdColor = type === 'nmos' ? COLORS.nType : COLORS.pType;
  svg += `<rect x="${ox + 8}" y="${oy + h * 0.4 - 14}" width="28" height="18" fill="${sdColor}" opacity="0.7" stroke="${sdColor}" stroke-width="1" rx="1"/>`;
  svg += `<rect x="${ox + w - 36}" y="${oy + h * 0.4 - 14}" width="28" height="18" fill="${sdColor}" opacity="0.7" stroke="${sdColor}" stroke-width="1" rx="1"/>`;
  svg += labelText(ox + 22, oy + h * 0.4 - 20, 'S', 8, sdColor);
  svg += labelText(ox + w - 22, oy + h * 0.4 - 20, 'D', 8, sdColor);
  // Gate oxide
  svg += `<rect x="${ox + 38}" y="${oy + h * 0.4 - 6}" width="${w - 76}" height="6" fill="${COLORS.oxide}" opacity="0.8" stroke="${COLORS.oxide}" stroke-width="1"/>`;
  svg += labelText(cx, oy + h * 0.4 - 12, 'SiO₂', 7, COLORS.oxide);
  // Gate electrode
  svg += `<rect x="${ox + 38}" y="${oy + h * 0.4 - 16}" width="${w - 76}" height="10" fill="${COLORS.metal}" opacity="0.9" stroke="${COLORS.metal}" stroke-width="1"/>`;
  svg += labelText(cx, oy + h * 0.4 - 20, 'G', 8, COLORS.metal);
  // Channel (inversion layer)
  const chColor = type === 'nmos' ? COLORS.nType : COLORS.pType;
  svg += `<rect x="${ox + 36}" y="${oy + h * 0.4 - 2}" width="${w - 72}" height="4" fill="${chColor}" opacity="0.4" stroke="none"/>`;
  // Body terminal
  svg += rigidLink(cx, oy + h, cx, oy + h + 8, COLORS.ground, 1.5);
  svg += labelText(cx + 6, oy + h + 10, 'B', 8, COLORS.textDim, 'start');
  return svg;
}

/** FinFET cross-section at (cx,cy) */
export function renderFinFET(cx, cy) {
  let svg = `<rect x="${cx-12}" y="${cy-30}" width="24" height="60" fill="${COLORS.nType}" opacity="0.5" stroke="${COLORS.nType}" stroke-width="1.5" rx="2"/>`;
  svg += `<rect x="${cx-18}" y="${cy-14}" width="36" height="28" fill="${COLORS.metal}" opacity="0.7" stroke="${COLORS.metal}" stroke-width="1.5" rx="1"/>`;
  svg += `<rect x="${cx-12}" y="${cy-12}" width="24" height="24" fill="${COLORS.oxide}" opacity="0.5" stroke="none"/>`;
  svg += labelText(cx, cy + 40, 'FinFET', 9, COLORS.textDim);
  svg += labelText(cx - 30, cy, 'Gate', 8, COLORS.metal, 'end');
  svg += labelText(cx, cy - 36, 'Fin', 8, COLORS.nType);
  return svg;
}

/** BJT cross-section NPN at (cx,cy) */
export function renderBJTCrossSection(cx, cy) {
  const w = 100, h = 70;
  const ox = cx - w / 2;
  // Collector (n)
  let svg = `<rect x="${ox}" y="${cy - h / 2}" width="${w}" height="${h * 0.25}" fill="${COLORS.nType}" opacity="0.6" stroke="${COLORS.nType}" stroke-width="1" rx="1"/>`;
  svg += labelText(cx, cy - h / 2 + 10, 'n (Collector)', 7, COLORS.nType);
  // Base (p)
  svg += `<rect x="${ox}" y="${cy - h / 4}" width="${w}" height="${h * 0.25}" fill="${COLORS.pType}" opacity="0.6" stroke="${COLORS.pType}" stroke-width="1"/>`;
  svg += labelText(cx, cy - h / 4 + 10, 'p (Base)', 7, COLORS.pType);
  // Emitter (n+)
  svg += `<rect x="${ox}" y="${cy + h * 0}" width="${w}" height="${h * 0.35}" fill="${COLORS.nType}" opacity="0.8" stroke="${COLORS.nType}" stroke-width="1" rx="1"/>`;
  svg += labelText(cx, cy + h / 6 + 6, 'n+ (Emitter)', 7, COLORS.nType);
  // Contacts
  svg += rigidLink(cx - 20, cy - h / 2, cx - 20, cy - h / 2 - 10, COLORS.metal, 2);
  svg += rigidLink(cx,      cy - h / 4, cx, cy - h / 4 - 10, COLORS.metal, 2);
  svg += rigidLink(cx + 20, cy + h * 0.35, cx + 20, cy + h * 0.35 + 10, COLORS.metal, 2);
  svg += labelText(cx - 20, cy - h / 2 - 14, 'C', 8, COLORS.nType);
  svg += labelText(cx,      cy - h / 4 - 14, 'B', 8, COLORS.pType);
  svg += labelText(cx + 20, cy + h * 0.35 + 14, 'E', 8, COLORS.nType);
  return svg;
}

/** PN Junction diode cross-section at (cx,cy) */
export function renderPNJunction(cx, cy, type = 'pn') {
  const w = 90, h = 40;
  let svg = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w / 2}" height="${h}" fill="${COLORS.pType}" opacity="0.5" stroke="${COLORS.pType}" stroke-width="1" rx="1"/>`;
  svg += `<rect x="${cx}" y="${cy - h / 2}" width="${w / 2}" height="${h}" fill="${COLORS.nType}" opacity="0.5" stroke="${COLORS.nType}" stroke-width="1" rx="1"/>`;
  svg += labelText(cx - w / 4, cy + 4, 'p', 10, COLORS.pType);
  svg += labelText(cx + w / 4, cy + 4, 'n', 10, COLORS.nType);
  svg += rigidLink(cx - w / 2, cy, cx - w / 2 - 10, cy, COLORS.pType, 2);   // Anode
  svg += rigidLink(cx + w / 2, cy, cx + w / 2 + 10, cy, COLORS.nType, 2);   // Cathode
  svg += labelText(cx - w / 2 - 14, cy, 'A', 8, COLORS.pType, 'end');
  svg += labelText(cx + w / 2 + 14, cy, 'K', 8, COLORS.nType, 'start');
  if (type === 'zener') svg += labelText(cx, cy - h / 2 - 6, 'Zener', 8, COLORS.textDim);
  if (type === 'schottky') svg += labelText(cx, cy - h / 2 - 6, 'Schottky (Metal-Si)', 8, COLORS.textDim);
  return svg;
}

/** DRAM cell (1T-1C) at (cx,cy) */
export function renderDRAMCell(cx, cy) {
  let svg = renderNMOS(cx - 20, cy - 10, '');
  svg += renderCapacitor(cx + 20, cy + 10, 'Cs');
  svg += rigidLink(cx - 4, cy - 10, cx + 8, cy + 10, COLORS.wire, 1.5);
  svg += labelText(cx - 20, cy - 34, 'WL', 8, COLORS.textDim);
  svg += labelText(cx - 36, cy - 10, 'BL', 8, COLORS.textDim, 'end');
  svg += labelText(cx, cy + 30, '1T-1C DRAM', 8, COLORS.textDim);
  return svg;
}

/** Flash memory cell (floating gate) at (cx,cy) */
export function renderFlashCell(cx, cy) {
  let svg = `<rect x="${cx-20}" y="${cy-20}" width="40" height="14" fill="${COLORS.componentFill}" stroke="${COLORS.metal}" stroke-width="1.5"/>`;
  svg += labelText(cx, cy - 13, 'Control Gate', 7, COLORS.metal);
  svg += `<rect x="${cx-18}" y="${cy-4}" width="36" height="12" fill="${COLORS.componentFill2}" stroke="${COLORS.highlight}" stroke-width="1.5"/>`;
  svg += labelText(cx, cy + 3, 'Floating Gate', 7, COLORS.highlight);
  svg += `<rect x="${cx-16}" y="${cy+10}" width="32" height="6" fill="${COLORS.oxide}" opacity="0.6"/>`;
  svg += labelText(cx, cy + 13, 'Tunnel Oxide', 6, COLORS.oxide);
  svg += `<rect x="${cx-20}" y="${cy+16}" width="40" height="12" fill="${COLORS.nType}" opacity="0.5"/>`;
  svg += labelText(cx, cy + 22, 'Channel', 7, COLORS.nType);
  return svg;
}

/** Quantum well energy diagram at (cx,cy) */
export function renderQuantumWell(cx, cy, width = 30) {
  let svg = rigidLink(cx - 60, cy + 20, cx - width / 2, cy + 20, COLORS.nType, 2); // barrier L
  svg += rigidLink(cx - width / 2, cy + 20, cx - width / 2, cy - 20, COLORS.nType, 2);
  svg += rigidLink(cx - width / 2, cy - 20, cx + width / 2, cy - 20, COLORS.nType, 2); // well bottom
  svg += rigidLink(cx + width / 2, cy - 20, cx + width / 2, cy + 20, COLORS.nType, 2);
  svg += rigidLink(cx + width / 2, cy + 20, cx + 60, cy + 20, COLORS.nType, 2); // barrier R
  // Energy levels
  svg += dashedLine(cx - width / 2, cy - 10, cx + width / 2, cy - 10, COLORS.highlight, '3,2');
  svg += dashedLine(cx - width / 2, cy - 2, cx + width / 2, cy - 2, COLORS.accent, '3,2');
  svg += labelText(cx + width / 2 + 4, cy - 10, 'E₁', 8, COLORS.highlight, 'start');
  svg += labelText(cx + width / 2 + 4, cy - 2, 'E₂', 8, COLORS.accent, 'start');
  svg += labelText(cx, cy + 30, 'Quantum Well', 8, COLORS.textDim);
  return svg;
}

/** MEMS pressure sensor diaphragm at (cx,cy) */
export function renderMEMSDiaphragm(cx, cy) {
  let svg = `<rect x="${cx - 50}" y="${cy - 6}" width="100" height="12" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="1.5" rx="2"/>`;
  svg += `<rect x="${cx - 30}" y="${cy - 4}" width="60" height="8" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="1" rx="1"/>`;
  svg += vectorFromPoint(cx, cy - 18, 90, 12, COLORS.fluidBlue, 'arrow-blue', 'P');
  svg += labelText(cx, cy + 18, 'MEMS Diaphragm', 8, COLORS.textDim);
  return svg;
}

/** Heterojunction band diagram at (cx,cy) */
export function renderHeterojunctionBands(cx, cy) {
  // Conduction band
  let svg = rigidLink(cx - 60, cy - 30, cx, cy - 30, COLORS.nType, 2);
  svg += rigidLink(cx, cy - 30, cx, cy - 14, COLORS.nType, 1.5); // offset
  svg += rigidLink(cx, cy - 14, cx + 60, cy - 14, COLORS.nType, 2);
  // Valence band
  svg += rigidLink(cx - 60, cy + 14, cx, cy + 14, COLORS.pType, 2);
  svg += rigidLink(cx, cy + 14, cx, cy + 30, COLORS.pType, 1.5);
  svg += rigidLink(cx, cy + 30, cx + 60, cy + 30, COLORS.pType, 2);
  svg += labelText(cx - 40, cy - 34, 'Ec', 8, COLORS.nType, 'start');
  svg += labelText(cx - 40, cy + 10, 'Ev', 8, COLORS.pType, 'start');
  svg += dashedLine(cx, cy - 40, cx, cy + 40, COLORS.textDim, '3,2');
  svg += labelText(cx - 50, cy + 44, 'AlGaAs', 8, COLORS.textDim, 'start');
  svg += labelText(cx + 8,  cy + 44, 'GaAs',   8, COLORS.textDim, 'start');
  return svg;
}

// ── B6: AEROSPACE SYMBOLS ─────────────────────────────────────────────────────

/** Wing planform (top view) at (cx,cy) — type: rectangular|tapered|swept|delta */
export function renderWingPlanform(cx, cy, type = 'rectangular', span = 120, chord = 30) {
  let pts = [];
  if (type === 'rectangular') {
    pts = [{ x: cx - span / 2, y: cy - chord / 2 }, { x: cx + span / 2, y: cy - chord / 2 },
           { x: cx + span / 2, y: cy + chord / 2 }, { x: cx - span / 2, y: cy + chord / 2 }];
  } else if (type === 'tapered') {
    pts = [{ x: cx - span / 2, y: cy - chord / 2 }, { x: cx + span / 2, y: cy - chord * 0.3 },
           { x: cx + span / 2, y: cy + chord * 0.3 }, { x: cx - span / 2, y: cy + chord / 2 }];
  } else if (type === 'swept') {
    const sweep = span * 0.3;
    pts = [{ x: cx - span / 2, y: cy - chord / 2 }, { x: cx + span / 2, y: cy - chord / 2 + sweep },
           { x: cx + span / 2, y: cy + chord * 0.2 + sweep }, { x: cx - span / 2, y: cy + chord / 2 }];
  } else if (type === 'delta') {
    pts = [{ x: cx, y: cy - chord }, { x: cx + span / 2, y: cy + chord / 2 },
           { x: cx - span / 2, y: cy + chord / 2 }];
  } else if (type === 'elliptical') {
    for (let i = 0; i <= 16; i++) {
      const a = i / 16 * Math.PI;
      pts.push({ x: cx - (span / 2) * Math.cos(a), y: cy - chord / 2 * Math.sin(a) });
    }
    for (let i = 0; i <= 16; i++) {
      const a = i / 16 * Math.PI;
      pts.push({ x: cx + (span / 2) * Math.cos(a), y: cy + chord / 2 * Math.sin(a) });
    }
  }
  let svg = polyline(pts.concat([pts[0]]), COLORS.componentBorder, 2, COLORS.componentFill);
  svg += labelText(cx, cy + chord / 2 + 14, type, 8, COLORS.textDim);
  return svg;
}

/** Engine cross-section (turbojet) at (cx,cy) */
export function renderTurbojet(cx, cy) {
  // Intake
  let svg = `<polygon points="${cx-70},${cy-14} ${cx-50},${cy-22} ${cx-50},${cy+22} ${cx-70},${cy+14}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += labelText(cx - 60, cy, 'Intake', 7, COLORS.textDim);
  // Compressor
  svg += `<rect x="${cx-50}" y="${cy-22}" width="30" height="44" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += labelText(cx - 35, cy, 'Comp', 7, COLORS.textDim);
  // Combustor
  svg += `<rect x="${cx-20}" y="${cy-18}" width="40" height="36" fill="rgba(239,68,68,0.15)" stroke="${COLORS.hot}" stroke-width="2"/>`;
  svg += labelText(cx, cy, 'Comb', 7, COLORS.hot);
  // Turbine
  svg += `<rect x="${cx+20}" y="${cy-22}" width="24" height="44" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += labelText(cx + 32, cy, 'Turb', 7, COLORS.textDim);
  // Nozzle
  svg += `<polygon points="${cx+44},${cy-22} ${cx+70},${cy-12} ${cx+70},${cy+12} ${cx+44},${cy+22}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += labelText(cx + 60, cy, 'Noz', 7, COLORS.textDim);
  // Flow arrow
  svg += vectorFromPoint(cx + 76, cy, 0, 16, COLORS.hot, 'arrow-hot', 'Thrust');
  return svg;
}

/** Turbofan at (cx,cy) — shows bypass duct */
export function renderTurbofan(cx, cy) {
  let svg = renderTurbojet(cx, cy);
  // Fan and bypass duct
  svg += `<rect x="${cx-56}" y="${cy-34}" width="12" height="68" fill="rgba(59,130,246,0.1)" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += labelText(cx - 50, cy - 38, 'Fan', 7, COLORS.textDim);
  svg += rigidLink(cx - 44, cy - 34, cx + 44, cy - 34, COLORS.componentBorder, 1, '', '3,2');
  svg += rigidLink(cx - 44, cy + 34, cx + 44, cy + 34, COLORS.componentBorder, 1, '', '3,2');
  svg += labelText(cx, cy - 42, 'Bypass', 7, COLORS.textDim);
  return svg;
}

/** Rocket engine at (cx,cy) */
export function renderRocketEngine(cx, cy) {
  let svg = `<polygon points="${cx-20},${cy-40} ${cx+20},${cy-40} ${cx+28},${cy} ${cx+38},${cy+30} ${cx-38},${cy+30} ${cx-28},${cy}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += labelText(cx, cy - 28, 'Chamber', 7, COLORS.textDim);
  // Nozzle bell
  svg += `<path d="M ${cx-28} ${cy} Q ${cx-40} ${cy+20} ${cx-38} ${cy+30}" stroke="${COLORS.componentBorder}" stroke-width="2" fill="none"/>`;
  svg += `<path d="M ${cx+28} ${cy} Q ${cx+40} ${cy+20} ${cx+38} ${cy+30}" stroke="${COLORS.componentBorder}" stroke-width="2" fill="none"/>`;
  // Exhaust
  svg += vectorFromPoint(cx, cy + 30, 90, 28, COLORS.hot, 'arrow-hot', 'Thrust');
  svg += labelText(cx, cy - 50, 'Rocket', 9);
  return svg;
}

/** Satellite with solar panels at (cx,cy) */
export function renderSatellite(cx, cy) {
  let svg = labeledShape(cx, cy, 30, 26, 'SAT', '', COLORS.componentFill, COLORS.componentBorder, 2, 8);
  // Solar panels
  svg += `<rect x="${cx - 62}" y="${cy - 6}" width="28" height="12" fill="rgba(59,130,246,0.3)" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += `<rect x="${cx + 34}" y="${cy - 6}" width="28" height="12" fill="rgba(59,130,246,0.3)" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += rigidLink(cx - 34, cy, cx - 34 + 0, cy, COLORS.wire, 1.5);
  return svg;
}

/** Hohmann transfer orbit at (cx,cy) */
export function renderHohmannTransfer(cx, cy) {
  let svg = circle(cx, cy, 8, COLORS.highlight, COLORS.highlight, 2); // planet
  svg += renderOrbit(cx, cy, 40, 'r₁');
  svg += renderOrbit(cx, cy, 80, 'r₂');
  // Transfer ellipse
  svg += `<ellipse cx="${cx+20}" cy="${cy}" rx="60" ry="50" fill="none" stroke="${COLORS.accent}" stroke-width="1.5" stroke-dasharray="4,3"/>`;
  svg += labelText(cx + 82, cy - 8, 'Transfer', 8, COLORS.accent, 'start');
  return svg;
}

// ── B7: THERMAL SYMBOLS ────────────────────────────────────────────────────────

/** Composite wall cross-section at (cx,cy), layers array [{label,color,w}] */
export function renderCompositeWall(cx, cy, layers, height = 80) {
  let svg = '', x = cx - layers.reduce((s, l) => s + l.w, 0) / 2;
  layers.forEach(l => {
    svg += `<rect x="${r(x)}" y="${r(cy - height / 2)}" width="${l.w}" height="${height}" fill="${l.color || COLORS.componentFill}" stroke="${COLORS.ground}" stroke-width="1.5"/>`;
    svg += labelText(x + l.w / 2, cy + 4, l.label, 8, COLORS.text);
    x += l.w;
  });
  // Temperature gradient arrow
  svg += vectorFromPoint(cx - 70, cy, 0, 28, COLORS.hot, 'arrow-hot', 'T_hot');
  svg += vectorFromPoint(cx + 40, cy, 0, 16, COLORS.cold, 'arrow-cold', 'T_cold');
  return svg;
}

/** Fin (pin/plate) with temperature gradient at (bx,by) */
export function renderFin(bx, by, length = 80, width = 12, label = 'T_fin') {
  let svg = `<rect x="${bx}" y="${by - width / 2}" width="${length}" height="${width}" fill="${COLORS.componentFill}" stroke="${COLORS.hot}" stroke-width="2"/>`;
  // Color gradient overlay
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const r_val = Math.round(239 - (239 - 59) * t), b_val = Math.round(68 + (130 - 68) * t);
    svg += `<rect x="${r(bx + t * length)}" y="${r(by - width / 2 + 1)}" width="${r(length / n)}" height="${width - 2}" fill="rgb(${r_val},${Math.round(68 + (130 - 68) * t)},${b_val})" opacity="0.3"/>`;
  }
  svg += labelText(bx + length / 2, by - width / 2 - 6, label, 8, COLORS.textDim);
  return svg;
}

/** Heat exchanger (parallel / counter flow) at (cx,cy) */
export function renderHeatExchanger(cx, cy, flowType = 'counter') {
  const w = 120, h = 40;
  let svg = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2}" rx="4"/>`;
  // Hot side
  svg += rigidLink(cx - w / 2 - 16, cy - 10, cx - w / 2, cy - 10, COLORS.hot, 2);
  svg += labelText(cx - w / 2 - 20, cy - 10, 'Hot in', 7, COLORS.hot, 'end');
  svg += rigidLink(cx + w / 2, cy - 10, cx + w / 2 + 16, cy - 10, COLORS.hot, 2, flowType === 'counter' ? '' : 'arrow-hot');
  // Cold side
  const coldIn = flowType === 'counter' ? cx + w / 2 : cx - w / 2;
  const coldOut = flowType === 'counter' ? cx - w / 2 : cx + w / 2;
  svg += rigidLink(coldIn, cy + 10, coldIn + (flowType === 'counter' ? 16 : -16), cy + 10, COLORS.cold, 2);
  svg += labelText(coldIn + (flowType === 'counter' ? 20 : -20), cy + 10, 'Cold in', 7, COLORS.cold, flowType === 'counter' ? 'start' : 'end');
  svg += rigidLink(cx - w / 2, cy + 10, cx + w / 2, cy + 10, COLORS.cold, 2);
  svg += labelText(cx, cy, `${flowType} flow`, 8, COLORS.textDim);
  return svg;
}

/** Heat pipe at (cx,cy) */
export function renderHeatPipe(cx, cy, length = 140) {
  let svg = `<rect x="${cx - length / 2}" y="${cy - 8}" width="${length}" height="16" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2" rx="8"/>`;
  // Evaporator
  svg += `<rect x="${cx - length / 2}" y="${cy - 8}" width="40" height="16" fill="rgba(239,68,68,0.2)" stroke="none" rx="8"/>`;
  svg += labelText(cx - length / 2 + 20, cy + 16, 'Evap.', 7, COLORS.hot);
  // Condenser
  svg += `<rect x="${cx + length / 2 - 40}" y="${cy - 8}" width="40" height="16" fill="rgba(59,130,246,0.2)" stroke="none" rx="8"/>`;
  svg += labelText(cx + length / 2 - 20, cy + 16, 'Cond.', 7, COLORS.cold);
  // Flow arrows
  svg += vectorFromPoint(cx - 10, cy - 4, 0, 18, COLORS.hot, 'arrow-hot', '');
  svg += vectorFromPoint(cx + 10, cy + 4, 180, 18, COLORS.cold, 'arrow-cold', '');
  svg += labelText(cx, cy - 18, 'Heat Pipe', 8, COLORS.textDim);
  return svg;
}

/** Thermoelectric module at (cx,cy) */
export function renderThermoelectric(cx, cy, mode = 'cooler') {
  const w = 80, h = 50;
  let svg = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="8" fill="${mode === 'cooler' ? COLORS.cold : COLORS.hot}" opacity="0.6"/>`;
  svg += `<rect x="${cx - w / 2}" y="${cy + h / 2 - 8}" width="${w}" height="8" fill="${mode === 'cooler' ? COLORS.hot : COLORS.cold}" opacity="0.6"/>`;
  // P-N pairs
  for (let i = 0; i < 4; i++) {
    const x = cx - 30 + i * 18;
    svg += `<rect x="${x - 4}" y="${cy - h / 2 + 8}" width="8" height="${h - 16}" fill="${COLORS.pType}" opacity="0.6"/>`;
    svg += `<rect x="${x + 6}" y="${cy - h / 2 + 8}" width="8" height="${h - 16}" fill="${COLORS.nType}" opacity="0.6"/>`;
    svg += rigidLink(x - 4, cy - h / 2 + 8, x + 14, cy - h / 2 + 8, COLORS.metal, 1.5);
    svg += rigidLink(x - 4, cy + h / 2 - 8, x + 14, cy + h / 2 - 8, COLORS.metal, 1.5);
  }
  svg += labelText(cx - w / 2 - 4, cy, mode === 'cooler' ? 'TEC' : 'TEG', 8, COLORS.textDim, 'end');
  return svg;
}

/** Refrigeration cycle block diagram at (cx,cy) */
export function renderRefrigCycle(cx, cy) {
  const comps = [
    { label: 'Comp.', x: cx - 60, y: cy - 30, color: COLORS.componentBorder },
    { label: 'Cond.', x: cx + 60, y: cy - 30, color: COLORS.hot },
    { label: 'Exp.V', x: cx + 60, y: cy + 30, color: COLORS.accent },
    { label: 'Evap.', x: cx - 60, y: cy + 30, color: COLORS.cold },
  ];
  let svg = '';
  comps.forEach(c => { svg += labeledShape(c.x, c.y, 42, 24, c.label, '', COLORS.componentFill, c.color, 2, 8); });
  // Connecting lines (cycle)
  svg += rigidLink(cx - 39, cy - 30, cx + 39, cy - 30, COLORS.hot, 1.5, 'arrow-hot');
  svg += rigidLink(cx + 60, cy - 18, cx + 60, cy + 18, COLORS.hot, 1.5, 'arrow-hot');
  svg += rigidLink(cx + 39, cy + 30, cx - 39, cy + 30, COLORS.cold, 1.5, 'arrow-cold');
  svg += rigidLink(cx - 60, cy + 18, cx - 60, cy - 18, COLORS.cold, 1.5, 'arrow-cold');
  return svg;
}

/** Boiling pool regions indicator at (cx,cy) */
export function renderBoilingCurve(cx, cy) {
  // Three zones labeled
  let svg = labeledShape(cx - 50, cy, 42, 22, 'Nucl.', 'Boiling', COLORS.componentFill, COLORS.normalForce, 1.5, 8);
  svg += labeledShape(cx,    cy, 42, 22, 'Trans.', '', COLORS.componentFill, COLORS.friction, 1.5, 8);
  svg += labeledShape(cx + 50, cy, 42, 22, 'Film', 'Boiling', COLORS.componentFill, COLORS.forceArrow, 1.5, 8);
  svg += rigidLink(cx - 29, cy, cx - 21, cy, COLORS.textDim, 1);
  svg += rigidLink(cx + 21, cy, cx + 29, cy, COLORS.textDim, 1);
  svg += labelText(cx, cy - 22, 'Pool Boiling Curve', 9, COLORS.textDim);
  return svg;
}

/** Cooling tower cross-section at (cx,cy) */
export function renderCoolingTower(cx, cy) {
  // Hyperbolic shape approximate
  let svg = `<path d="M ${cx-30} ${cy+50} Q ${cx-20} ${cy-20} ${cx-40} ${cy-50} M ${cx+30} ${cy+50} Q ${cx+20} ${cy-20} ${cx+40} ${cy-50}" stroke="${COLORS.componentBorder}" stroke-width="2" fill="none"/>`;
  svg += rigidLink(cx - 30, cy + 50, cx + 30, cy + 50, COLORS.componentBorder, 2); // base
  // Fill rain
  for (let i = 0; i < 5; i++) {
    svg += rigidLink(cx - 20 + i * 10, cy, cx - 20 + i * 10, cy + 20, COLORS.fluidBlue, 1, 'arrow-blue');
  }
  // Fan at top
  svg += circle(cx, cy - 50, 14, 'none', COLORS.componentBorder, 1.5);
  svg += rigidLink(cx - 12, cy - 50, cx + 12, cy - 50, COLORS.componentBorder, 2);
  svg += rigidLink(cx, cy - 62, cx, cy - 38, COLORS.componentBorder, 2);
  svg += labelText(cx, cy - 68, 'Fan', 7, COLORS.textDim);
  svg += labelText(cx, cy + 60, 'Cooling Tower', 8, COLORS.textDim);
  return svg;
}

/** Combustion flame at (cx,cy) */
export function renderFlame(cx, cy, h = 40, label = '') {
  let svg = `<path d="M ${cx-14} ${cy} Q ${cx-18} ${cy-h*0.4} ${cx} ${cy-h} Q ${cx+18} ${cy-h*0.4} ${cx+14} ${cy}" fill="rgba(239,68,68,0.25)" stroke="${COLORS.hot}" stroke-width="1.5"/>`;
  svg += `<path d="M ${cx-8} ${cy} Q ${cx-10} ${cy-h*0.3} ${cx} ${cy-h*0.7} Q ${cx+10} ${cy-h*0.3} ${cx+8} ${cy}" fill="rgba(252,211,77,0.3)" stroke="${COLORS.highlight}" stroke-width="1"/>`;
  if (label) svg += labelText(cx, cy + 10, label, 8, COLORS.hot);
  return svg;
}

// ── B8: CONTROL SYSTEMS SYMBOLS ────────────────────────────────────────────────

/** Block diagram box at (cx,cy) */
export function renderControlBlock(cx, cy, label = '', sublabel = '', w = 60, h = 30) {
  return labeledShape(cx, cy, w, h, label, sublabel, COLORS.componentFill, COLORS.componentBorder, 2, 9);
}

/** Summing junction (circle with + and -) at (cx,cy) */
export function renderSumJunction(cx, cy, inputs = ['+', '-']) {
  let svg = circle(cx, cy, 12, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += labelText(cx, cy + 4, '∑', 12, COLORS.text);
  svg += rigidLink(cx - 12, cy, cx - 22, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx + 12, cy, cx + 22, cy, COLORS.wire, 1.5);
  if (inputs.length > 1) svg += rigidLink(cx, cy - 12, cx, cy - 22, COLORS.wire, 1.5);
  svg += labelText(cx - 18, cy - 3, inputs[0], 8, COLORS.normalForce);
  if (inputs[1]) svg += labelText(cx - 3, cy - 16, inputs[1], 8, inputs[1] === '-' ? COLORS.forceArrow : COLORS.normalForce);
  return svg;
}

/** Signal arrow between blocks */
export function renderSignalArrow(x1, y1, x2, y2, label = '') {
  let svg = rigidLink(x1, y1, x2, y2, COLORS.wire, 1.5, 'arrow-white');
  if (label) svg += labelText((x1 + x2) / 2, (y1 + y2) / 2 - 6, label, 8, COLORS.textDim);
  return svg;
}

/** PID block at (cx,cy) */
export function renderPID(cx, cy) {
  let svg = labeledShape(cx, cy, 70, 36, 'PID', 'Kp+Ki/s+Kds', COLORS.componentFill, COLORS.componentBorder, 2, 10);
  svg += rigidLink(cx - 35, cy, cx - 50, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx + 35, cy, cx + 50, cy, COLORS.wire, 1.5);
  return svg;
}

/** Closed-loop control diagram at (cx,cy) */
export function renderClosedLoop(cx, cy) {
  let svg = renderSumJunction(cx - 80, cy, ['+', '−']);
  svg += renderControlBlock(cx, cy, 'G(s)', 'Plant', 70, 30);
  svg += renderSignalArrow(cx - 68, cy, cx - 35, cy, 'e(t)');
  svg += renderSignalArrow(cx + 35, cy, cx + 90, cy, 'y(t)');
  // Feedback
  svg += rigidLink(cx + 90, cy, cx + 90, cy + 35, COLORS.wire, 1.5);
  svg += rigidLink(cx - 80, cy + 35, cx + 90, cy + 35, COLORS.wire, 1.5);
  svg += rigidLink(cx - 80, cy + 35, cx - 80, cy + 12, COLORS.wire, 1.5, 'arrow-white');
  svg += labelText(cx + 100, cy, 'out', 8, COLORS.textDim, 'start');
  svg += labelText(cx - 100, cy, 'ref', 8, COLORS.textDim, 'end');
  return svg;
}

/** Pole-zero plot at (cx,cy) */
export function renderPoleZeroPlot(cx, cy, poles = [], zeros = []) {
  let svg = rigidLink(cx - 60, cy, cx + 60, cy, COLORS.textDim, 1); // real axis
  svg += rigidLink(cx, cy - 50, cx, cy + 50, COLORS.textDim, 1); // imag axis
  svg += labelText(cx + 62, cy, 'Re', 8, COLORS.textDim, 'start');
  svg += labelText(cx, cy - 54, 'Im', 8, COLORS.textDim);
  poles.forEach(p => {
    svg += labelText(cx + p.x * 20, cy - p.y * 20, '×', 12, COLORS.forceArrow);
  });
  zeros.forEach(z => {
    svg += circle(cx + z.x * 20, cy - z.y * 20, 5, 'none', COLORS.normalForce, 2);
  });
  return svg;
}

/** Bode plot placeholder (axes + labeled) at (cx,cy) */
export function renderBodePlot(cx, cy) {
  let svg = labeledShape(cx, cy - 20, 130, 40, '|G(jω)|', 'Magnitude', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += labeledShape(cx, cy + 30, 130, 30, '∠G(jω)', 'Phase', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += labelText(cx, cy + 60, 'Bode Plot', 9, COLORS.textDim);
  return svg;
}

/** Nyquist plot at (cx,cy) */
export function renderNyquistPlot(cx, cy) {
  let svg = rigidLink(cx - 55, cy, cx + 55, cy, COLORS.textDim, 1);
  svg += rigidLink(cx, cy - 50, cx, cy + 50, COLORS.textDim, 1);
  svg += `<path d="M ${cx+40} ${cy} Q ${cx+50} ${cy-30} ${cx} ${cy-20} Q ${cx-30} ${cy-10} ${cx-40} ${cy} Q ${cx-30} ${cy+10} ${cx} ${cy+20} Q ${cx+50} ${cy+30} ${cx+40} ${cy}" fill="rgba(59,130,246,0.1)" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += circle(cx - 20, cy, 4, COLORS.forceArrow, COLORS.forceArrow); // -1 point
  svg += labelText(cx - 20, cy + 12, '-1', 8, COLORS.forceArrow);
  svg += labelText(cx, cy - 54, 'Nyquist', 9, COLORS.textDim);
  return svg;
}

/** Root locus plot at (cx,cy) */
export function renderRootLocus(cx, cy, poles = [{ x: -1, y: 0 }, { x: -2, y: 0 }]) {
  let svg = rigidLink(cx - 60, cy, cx + 20, cy, COLORS.textDim, 1);
  svg += rigidLink(cx - 20, cy - 50, cx - 20, cy + 50, COLORS.textDim, 1);
  poles.forEach(p => { svg += labelText(cx - 20 + p.x * 20, cy - p.y * 20, '×', 12, COLORS.forceArrow); });
  // Locus branch
  svg += `<path d="M ${cx-40} ${cy} L ${cx-60} ${cy-30} M ${cx-40} ${cy} L ${cx-60} ${cy+30}" stroke="${COLORS.componentBorder}" stroke-width="1.5" fill="none"/>`;
  svg += labelText(cx, cy - 54, 'Root Locus', 9, COLORS.textDim);
  return svg;
}

/** PLC system block at (cx,cy) */
export function renderPLC(cx, cy) {
  let svg = labeledShape(cx, cy, 80, 60, 'PLC', '', COLORS.componentFill, COLORS.componentBorder, 2, 11);
  // I/O modules
  svg += `<rect x="${cx-56}" y="${cy-20}" width="18" height="40" fill="${COLORS.componentFill2}" stroke="${COLORS.textDim}" stroke-width="1.5"/>`;
  svg += labelText(cx - 47, cy, 'IN', 8, COLORS.normalForce);
  svg += `<rect x="${cx+38}" y="${cy-20}" width="18" height="40" fill="${COLORS.componentFill2}" stroke="${COLORS.textDim}" stroke-width="1.5"/>`;
  svg += labelText(cx + 47, cy, 'OUT', 7, COLORS.forceArrow);
  return svg;
}

/** SCADA block diagram at (cx,cy) */
export function renderSCADA(cx, cy) {
  let svg = labeledShape(cx, cy - 40, 60, 24, 'HMI', 'SCADA', COLORS.componentFill, COLORS.componentBorder, 2, 8);
  svg += labeledShape(cx - 50, cy + 10, 40, 22, 'RTU', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += labeledShape(cx + 50, cy + 10, 40, 22, 'RTU', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += rigidLink(cx - 30, cy - 28, cx - 30, cy - 1, COLORS.wire, 1.5);
  svg += rigidLink(cx + 30, cy - 28, cx + 30, cy - 1, COLORS.wire, 1.5);
  svg += labelText(cx, cy + 34, 'SCADA / DCS', 8, COLORS.textDim);
  return svg;
}

/** Encoder disk at (cx,cy) */
export function renderEncoder(cx, cy) {
  let svg = circle(cx, cy, 22, COLORS.componentFill, COLORS.componentBorder, 2);
  for (let i = 0; i < 12; i++) {
    const a = i * 30 * RAD;
    if (i % 2 === 0) {
      const px1 = cx + 10 * Math.cos(a), py1 = cy + 10 * Math.sin(a);
      const px2 = cx + 20 * Math.cos(a), py2 = cy + 20 * Math.sin(a);
      svg += rigidLink(px1, py1, px2, py2, COLORS.textDim, 2);
    }
  }
  svg += circle(cx, cy, 4, COLORS.ground, COLORS.ground, 2);
  svg += labelText(cx, cy + 30, 'Encoder', 8, COLORS.textDim);
  return svg;
}

/** Servo system block diagram */
export function renderServoSystem(cx, cy) {
  let svg = renderSumJunction(cx - 80, cy, ['+', '−']);
  svg += renderPID(cx - 20, cy);
  svg += labeledShape(cx + 50, cy, 40, 26, 'Motor', '', COLORS.componentFill, COLORS.componentBorder, 2, 8);
  svg += renderEncoder(cx + 90, cy);
  svg += renderSignalArrow(cx - 68, cy, cx - 55, cy, 'err');
  svg += renderSignalArrow(cx + 5,  cy, cx + 30, cy, 'u');
  svg += renderSignalArrow(cx + 70, cy, cx + 68, cy, '');
  svg += rigidLink(cx + 90, cy + 22, cx + 90, cy + 40, COLORS.wire, 1.5);
  svg += rigidLink(cx - 80, cy + 40, cx + 90, cy + 40, COLORS.wire, 1.5);
  svg += rigidLink(cx - 80, cy + 40, cx - 80, cy + 12, COLORS.wire, 1.5, 'arrow-white');
  svg += labelText(cx - 100, cy, 'θ_ref', 8, COLORS.textDim, 'end');
  return svg;
}

/** LVDT sensor at (cx,cy) */
export function renderLVDT(cx, cy) {
  let svg = `<rect x="${cx-30}" y="${cy-10}" width="60" height="20" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2" rx="10"/>`;
  svg += rigidLink(cx - 50, cy, cx - 30, cy, COLORS.wire, 2); // core rod
  svg += circle(cx, cy, 5, COLORS.metal, COLORS.metal, 1.5); // core
  svg += labelText(cx, cy + 20, 'LVDT', 8, COLORS.textDim);
  return svg;
}

/** VFD (Variable Frequency Drive) block */
export function renderVFD(cx, cy) {
  let svg = labeledShape(cx, cy, 80, 50, 'VFD', 'AC Drive', COLORS.componentFill, COLORS.componentBorder, 2, 10);
  svg += labelText(cx - 55, cy - 10, 'AC in', 7, COLORS.textDim, 'end');
  svg += labelText(cx + 55, cy - 10, 'AC out', 7, COLORS.textDim, 'start');
  svg += labelText(cx, cy + 34, '0–60Hz', 7, COLORS.textDim);
  return svg;
}

// ── B9: MATERIALS SYMBOLS ─────────────────────────────────────────────────────

/** Unit cell BCC at (cx,cy) */
export function renderBCC(cx, cy) {
  const s = 28;
  // Cube outline
  let svg = rigidLink(cx - s, cy - s, cx + s, cy - s, COLORS.componentBorder, 1.5);
  svg += rigidLink(cx + s, cy - s, cx + s, cy + s, COLORS.componentBorder, 1.5);
  svg += rigidLink(cx + s, cy + s, cx - s, cy + s, COLORS.componentBorder, 1.5);
  svg += rigidLink(cx - s, cy + s, cx - s, cy - s, COLORS.componentBorder, 1.5);
  // Back
  svg += dashedLine(cx - s + 12, cy - s - 10, cx + s + 12, cy - s - 10);
  svg += dashedLine(cx + s + 12, cy - s - 10, cx + s, cy - s);
  svg += dashedLine(cx - s + 12, cy - s - 10, cx - s, cy - s);
  // Corner atoms
  const corners = [[-s,-s],[s,-s],[s,s],[-s,s]];
  corners.forEach(([dx, dy]) => { svg += circle(cx + dx, cy + dy, 4, COLORS.componentBorder, COLORS.componentBorder); });
  // Center atom
  svg += circle(cx, cy, 7, COLORS.forceArrow, COLORS.forceArrow, 2);
  svg += labelText(cx, cy + s + 14, 'BCC', 9, COLORS.textDim);
  return svg;
}

/** Unit cell FCC at (cx,cy) */
export function renderFCC(cx, cy) {
  const s = 28;
  let svg = renderBCC(cx, cy); // start with cube frame
  // Face centers
  const faces = [[0,-s],[0,s],[-s,0],[s,0]];
  faces.forEach(([dx, dy]) => { svg += circle(cx + dx, cy + dy, 5, COLORS.normalForce, COLORS.normalForce, 2); });
  svg += labelText(cx, cy + s + 24, 'FCC', 9, COLORS.textDim);
  return svg;
}

/** Grain boundary schematic at (cx,cy) */
export function renderGrainBoundary(cx, cy) {
  const w = 120, h = 80;
  let svg = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"}/>`;
  // Grain regions
  svg += `<polygon points="${cx-w/2},${cy-h/2} ${cx+10},${cy-h/2} ${cx},${cy+h/2} ${cx-w/2},${cy+h/2}" fill="rgba(59,130,246,0.1)"/>`;
  svg += `<polygon points="${cx+10},${cy-h/2} ${cx+w/2},${cy-h/2} ${cx+w/2},${cy} ${cx},${cy+h/2}" fill="rgba(239,68,68,0.1)"/>`;
  svg += `<polygon points="${cx},${cy+h/2} ${cx+w/2},${cy} ${cx+w/2},${cy+h/2}" fill="rgba(16,185,129,0.1)"/>`;
  // Grain boundary line
  svg += `<path d="M ${cx+10} ${cy-h/2} Q ${cx} ${cy-10} ${cx} ${cy+h/2}" stroke="${COLORS.highlight}" stroke-width="2" fill="none"/>`;
  svg += labelText(cx + 20, cy - 4, 'GB', 8, COLORS.highlight, 'start');
  svg += labelText(cx, cy + h / 2 + 12, 'Grain Boundary', 8, COLORS.textDim);
  return svg;
}

/** Phase diagram (binary eutectic) at (cx,cy) */
export function renderPhaseDiagram(cx, cy) {
  const w = 130, h = 90;
  const ox = cx - w / 2, oy = cy - h / 2;
  let svg = `<rect x="${ox}" y="${oy}" width="${w}" height="${h}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  // Liquidus lines
  svg += `<path d="M ${ox} ${oy} L ${cx - 20} ${oy + h * 0.65} L ${cx + w / 2} ${oy}" stroke="${COLORS.fluidBlue}" stroke-width="1.5" fill="none"/>`;
  // Solidus line (flat eutectic)
  svg += rigidLink(ox, oy + h * 0.65, cx + w / 2, oy + h * 0.65, COLORS.highlight, 1.5);
  // Region labels
  svg += labelText(cx, oy + h * 0.2, 'Liquid', 8, COLORS.fluidBlue);
  svg += labelText(cx - 30, oy + h * 0.82, 'α+β', 8, COLORS.textDim);
  svg += labelText(cx - w / 4, oy + h * 0.44, 'α+L', 7, COLORS.textDim);
  svg += labelText(cx + 8, oy + h * 0.44, 'β+L', 7, COLORS.textDim);
  svg += labelText(cx, oy + h + 12, 'Composition →', 8, COLORS.textDim);
  svg += labelText(ox - 18, cy, 'T', 9, COLORS.textDim, 'end');
  return svg;
}

/** Stress-strain curve outline at (cx,cy) */
export function renderStressStrain(cx, cy) {
  const ox = cx - 55, oy = cy + 40;
  let svg = rigidLink(ox, oy, ox + 110, oy, COLORS.textDim, 1); // strain axis
  svg += rigidLink(ox, oy, ox, oy - 90, COLORS.textDim, 1); // stress axis
  svg += labelText(ox + 112, oy, 'ε', 9, COLORS.textDim, 'start');
  svg += labelText(ox, oy - 94, 'σ', 9, COLORS.textDim);
  // Elastic region
  svg += rigidLink(ox, oy, ox + 25, oy - 50, COLORS.componentBorder, 2);
  // Yield point
  svg += circle(ox + 25, oy - 50, 3, COLORS.highlight, COLORS.highlight);
  // Plastic region
  svg += `<path d="M ${ox+25} ${oy-50} Q ${ox+55} ${oy-66} ${ox+70} ${oy-60} Q ${ox+90} ${oy-50} ${ox+110} ${oy-42}" stroke="${COLORS.forceArrow}" stroke-width="2" fill="none"/>`;
  svg += labelText(ox + 26, oy - 56, 'Yield', 7, COLORS.highlight, 'start');
  svg += labelText(ox + 112, oy - 42, 'UTS', 7, COLORS.forceArrow, 'start');
  return svg;
}

/** Dislocation schematic (edge dislocation) at (cx,cy) */
export function renderDislocation(cx, cy) {
  const rows = 5, cols = 9;
  let svg = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shift = (r < rows / 2 && c >= Math.floor(cols / 2)) ? 8 : 0;
      const x = cx - (cols - 1) * 8 + c * 16 + shift;
      const y = cy - (rows - 1) * 10 + r * 20;
      svg += circle(x, y, 4, COLORS.componentBorder, COLORS.componentBorder);
      if (c < cols - 1) svg += rigidLink(x, y, x + 16 + (r < rows / 2 && c === Math.floor(cols / 2) - 1 ? 8 : 0), y, COLORS.textDim, 1);
      if (r < rows - 1) svg += rigidLink(x, y, x, y + 20, COLORS.textDim, 1);
    }
  }
  svg += labelText(cx + 4, cy + (rows - 1) * 10 + 14, '⊥ Dislocation', 8, COLORS.highlight);
  return svg;
}

/** XRD setup at (cx,cy) */
export function renderXRD(cx, cy) {
  let svg = labeledShape(cx - 60, cy, 28, 20, 'X-ray', 'Tube', COLORS.componentFill, COLORS.componentBorder, 1.5, 7);
  svg += `<rect x="${cx - 15}" y="${cy - 18}" width="30" height="36" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="1.5"/>`;
  svg += labelText(cx, cy, 'Sample', 7, COLORS.textDim);
  svg += labeledShape(cx + 60, cy, 28, 20, 'Detect.', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 7);
  // Beam paths
  svg += rigidLink(cx - 46, cy, cx - 15, cy, COLORS.highlight, 1.5, 'arrow-yellow');
  svg += rigidLink(cx + 15, cy, cx + 46, cy, COLORS.highlight, 1.5, 'arrow-yellow');
  svg += rigidLink(cx + 6, cy - 10, cx + 40, cy - 18, COLORS.highlight, 1, '', '2,2');
  svg += labelText(cx, cy + 30, 'XRD Setup', 8, COLORS.textDim);
  return svg;
}

/** SEM column at (cx,cy) */
export function renderSEM(cx, cy) {
  let svg = labeledShape(cx, cy - 60, 40, 20, 'Gun', 'e⁻', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += rigidLink(cx, cy - 50, cx, cy - 38, COLORS.highlight, 1.5, 'arrow-yellow');
  svg += labeledShape(cx, cy - 26, 50, 14, 'Condenser', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 7);
  svg += rigidLink(cx, cy - 19, cx, cy - 8, COLORS.highlight, 1.5, 'arrow-yellow');
  svg += labeledShape(cx, cy + 4, 50, 14, 'Objective', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 7);
  svg += rigidLink(cx, cy + 11, cx, cy + 22, COLORS.highlight, 1.5, 'arrow-yellow');
  svg += `<rect x="${cx - 22}" y="${cy + 22}" width="44" height="10" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="1.5"/>`;
  svg += labelText(cx, cy + 36, 'Sample', 7, COLORS.textDim);
  svg += labelText(cx, cy + 46, 'SEM Column', 8, COLORS.textDim);
  return svg;
}

/** Tensile testing machine at (cx,cy) */
export function renderTensileMachine(cx, cy) {
  let svg = `<rect x="${cx-30}" y="${cy-60}" width="60" height="14" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="2"/>`;
  svg += labelText(cx, cy - 70, 'Upper Grip', 7, COLORS.textDim);
  svg += `<rect x="${cx-8}" y="${cy-46}" width="16" height="92" fill="${COLORS.componentBorder}" opacity="0.5" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  svg += labelText(cx + 14, cy, 'Specimen', 7, COLORS.textDim, 'start');
  svg += `<rect x="${cx-30}" y="${cy+46}" width="60" height="14" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="2"/>`;
  svg += labelText(cx, cy + 72, 'Lower Grip', 7, COLORS.textDim);
  // Force arrows
  svg += vectorFromPoint(cx, cy - 46, 270, 18, COLORS.forceArrow, 'arrow-red', 'F');
  svg += vectorFromPoint(cx, cy + 46, 90, 18, COLORS.forceArrow, 'arrow-red', 'F');
  return svg;
}

/** Charpy impact tester at (cx,cy) */
export function renderCharpy(cx, cy) {
  let svg = circle(cx - 50, cy - 60, 8, COLORS.componentFill, COLORS.componentBorder, 2); // pivot
  svg += rigidLink(cx - 50, cy - 60, cx, cy - 10, COLORS.componentBorder, 3); // pendulum arm
  svg += circle(cx, cy - 10, 10, COLORS.forceArrow, COLORS.forceArrow, 2); // hammer
  svg += `<rect x="${cx - 20}" y="${cy + 4}" width="40" height="12" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  svg += labelText(cx, cy + 10, 'Specimen', 7, COLORS.textDim);
  svg += labelText(cx - 20, cy + 24, 'Charpy Impact', 8, COLORS.textDim, 'start');
  return svg;
}

// ── B10: POWER & ENERGY SYMBOLS ──────────────────────────────────────────────

/** Three-phase transformer schematic at (cx,cy), connection = 'delta-wye' etc */
export function renderThreePhaseTransformer(cx, cy, connection = 'delta-wye') {
  const [primary, secondary] = connection.split('-');
  // Primary winding symbol
  let svg = labeledShape(cx - 40, cy, 44, 80, primary === 'delta' ? 'Δ' : 'Y', 'Primary', COLORS.componentFill, COLORS.phaseA, 2, 16);
  // Secondary winding symbol
  svg += labeledShape(cx + 40, cy, 44, 80, secondary === 'wye' ? 'Y' : 'Δ', 'Secondary', COLORS.componentFill, COLORS.phaseB, 2, 16);
  // Core
  svg += rigidLink(cx - 18, cy - 40, cx - 18, cy + 40, COLORS.ground, 3);
  svg += rigidLink(cx + 18, cy - 40, cx + 18, cy + 40, COLORS.ground, 3);
  // Phase lines
  for (let i = 0; i < 3; i++) {
    const phaseColor = [COLORS.phaseA, COLORS.phaseB, COLORS.phaseC][i];
    const yp = cy - 20 + i * 20;
    svg += rigidLink(cx - 80, yp, cx - 62, yp, phaseColor, 2);
    svg += rigidLink(cx + 62, yp, cx + 80, yp, phaseColor, 2);
  }
  svg += labelText(cx, cy + 50, `${connection} Transformer`, 8, COLORS.textDim);
  return svg;
}

/** Induction motor cross-section at (cx,cy) */
export function renderInductionMotor(cx, cy) {
  let svg = circle(cx, cy, 40, COLORS.componentFill, COLORS.componentBorder, 2.5); // stator
  svg += circle(cx, cy, 26, COLORS.componentFill2, COLORS.ground, 1.5); // rotor
  svg += circle(cx, cy, 6, COLORS.metal, COLORS.metal, 2); // shaft
  // Stator windings
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * RAD;
    const x1 = cx + 28 * Math.cos(a), y1 = cy + 28 * Math.sin(a);
    const x2 = cx + 38 * Math.cos(a), y2 = cy + 38 * Math.sin(a);
    const color = [COLORS.phaseA, COLORS.phaseB, COLORS.phaseC][i % 3];
    svg += rigidLink(x1, y1, x2, y2, color, 3);
  }
  svg += labelText(cx, cy + 52, 'Induction Motor', 8, COLORS.textDim);
  return svg;
}

/** DC motor cross-section at (cx,cy) */
export function renderDCMotor(cx, cy) {
  let svg = circle(cx, cy, 40, COLORS.componentFill, COLORS.componentBorder, 2.5);
  svg += circle(cx, cy, 26, COLORS.componentFill2, COLORS.ground, 1.5);
  svg += circle(cx, cy, 6, COLORS.metal, COLORS.metal, 2);
  // Commutator segments
  for (let i = 0; i < 8; i++) {
    const a = i * 45 * RAD;
    const x1 = cx + 16 * Math.cos(a), y1 = cy + 16 * Math.sin(a);
    const x2 = cx + 24 * Math.cos(a), y2 = cy + 24 * Math.sin(a);
    svg += rigidLink(x1, y1, x2, y2, i % 2 === 0 ? COLORS.metal : COLORS.componentFill2, 2.5);
  }
  // Brushes
  svg += `<rect x="${cx-36}" y="${cy-4}" width="8" height="8" fill="${COLORS.ground}" stroke="${COLORS.ground}" stroke-width="1"/>`;
  svg += `<rect x="${cx+28}" y="${cy-4}" width="8" height="8" fill="${COLORS.ground}" stroke="${COLORS.ground}" stroke-width="1"/>`;
  svg += labelText(cx, cy + 52, 'DC Motor', 8, COLORS.textDim);
  return svg;
}

/** Synchronous generator cross-section at (cx,cy) */
export function renderSyncGenerator(cx, cy) {
  let svg = renderInductionMotor(cx, cy);
  // Rotor field poles (salient)
  for (let i = 0; i < 4; i++) {
    const a = i * 90 * RAD;
    svg += `<ellipse cx="${r(cx + 18 * Math.cos(a))}" cy="${r(cy + 18 * Math.sin(a))}" rx="8" ry="4" fill="${COLORS.accent}" stroke="${COLORS.accent}" stroke-width="1" transform="rotate(${i*90},${r(cx + 18 * Math.cos(a))},${r(cy + 18 * Math.sin(a))})"/>`;
  }
  svg += labelText(cx, cy + 52, 'Sync. Generator', 8, COLORS.textDim);
  return svg;
}

/** Transmission line tower at (cx,cy) */
export function renderTransmissionTower(cx, cy) {
  const h = 80;
  let svg = rigidLink(cx, cy + h / 2, cx, cy - h / 2, COLORS.ground, 3); // tower body
  // Arms
  svg += rigidLink(cx - 40, cy - h * 0.2, cx + 40, cy - h * 0.2, COLORS.ground, 2);
  svg += rigidLink(cx - 28, cy - h * 0.05, cx + 28, cy - h * 0.05, COLORS.ground, 2);
  // Insulators and wires
  const armY = cy - h * 0.2;
  for (const x of [cx - 40, cx, cx + 40]) {
    svg += rigidLink(x, armY, x, armY + 8, COLORS.textDim, 1.5); // insulator string
    svg += circle(x, armY + 8, 3, COLORS.componentFill, COLORS.componentBorder, 1);
    svg += rigidLink(x, armY + 10, x - 30, armY + 14, [COLORS.phaseA, COLORS.phaseB, COLORS.phaseC][[cx-40,cx,cx+40].indexOf(x)], 1.5);
  }
  // Base supports
  svg += rigidLink(cx - 20, cy + h / 2, cx - 40, cy + h / 2 + 10, COLORS.ground, 2);
  svg += rigidLink(cx + 20, cy + h / 2, cx + 40, cy + h / 2 + 10, COLORS.ground, 2);
  svg += groundHatch(cx, cy + h / 2 + 12, 90);
  svg += labelText(cx, cy - h / 2 - 10, 'Transmission Tower', 8, COLORS.textDim);
  return svg;
}

/** Circuit breaker at (cx,cy) */
export function renderCircuitBreaker(cx, cy, type = 'MCB') {
  let svg = labeledShape(cx, cy, 40, 50, type, '', COLORS.componentFill, COLORS.componentBorder, 2, 9);
  // Trip indicator
  svg += circle(cx, cy - 12, 5, type === 'MCB' ? COLORS.normalForce : COLORS.forceArrow, COLORS.componentBorder, 1.5);
  // Terminal connections
  svg += rigidLink(cx, cy - 25, cx, cy - 35, COLORS.wire, 2);
  svg += rigidLink(cx, cy + 25, cx, cy + 35, COLORS.wire, 2);
  svg += labelText(cx + 26, cy, type, 8, COLORS.textDim, 'start');
  return svg;
}

/** Solar panel at (cx,cy) */
export function renderSolarPanel(cx, cy) {
  const w = 80, h = 50;
  let svg = `<rect x="${cx-w/2}" y="${cy-h/2}" width="${w}" height="${h}" fill="rgba(59,130,246,0.15)" stroke="${COLORS.componentBorder}" stroke-width="2"/>`;
  // Cell grid
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      svg += `<rect x="${cx-w/2+c*16+1}" y="${cy-h/2+r*16+1}" width="14" height="14" fill="rgba(59,130,246,0.25)" stroke="${COLORS.componentBorder}" stroke-width="0.5"/>`;
    }
  }
  // Busbars
  svg += rigidLink(cx - w / 2 + 8, cy - h / 2, cx - w / 2 + 8, cy + h / 2, COLORS.metal, 1.5);
  svg += rigidLink(cx - w / 2 + 24, cy - h / 2, cx - w / 2 + 24, cy + h / 2, COLORS.metal, 1);
  svg += labelText(cx, cy + h / 2 + 12, 'Solar Panel', 8, COLORS.textDim);
  return svg;
}

/** Wind turbine schematic at (cx,cy) */
export function renderWindTurbine(cx, cy) {
  let svg = rigidLink(cx, cy + 70, cx, cy - 10, COLORS.ground, 4); // tower
  svg += circle(cx, cy - 10, 6, COLORS.componentFill, COLORS.componentBorder, 2); // hub
  // Three blades
  for (let i = 0; i < 3; i++) {
    const a = (i * 120 - 90) * RAD;
    const bx = cx + 50 * Math.cos(a), by = cy - 10 + 50 * Math.sin(a);
    svg += `<polygon points="${cx},${cy-10} ${r(bx-4*Math.sin(a))},${r(by+4*Math.cos(a))} ${r(bx+4*Math.sin(a))},${r(by-4*Math.cos(a))}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="1.5"/>`;
  }
  svg += groundHatch(cx, cy + 72, 40);
  svg += labelText(cx, cy + 84, 'Wind Turbine', 8, COLORS.textDim);
  return svg;
}

/** Battery cell cross-section at (cx,cy) */
export function renderBattery(cx, cy, type = 'Li-ion') {
  let svg = `<rect x="${cx-28}" y="${cy-40}" width="56" height="80" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2" rx="4"/>`;
  // + terminal
  svg += `<rect x="${cx-8}" y="${cy-48}" width="16" height="8" fill="${COLORS.metal}" stroke="${COLORS.metal}" stroke-width="1" rx="2"/>`;
  // Internal structure
  for (let i = 0; i < 4; i++) {
    const y = cy - 28 + i * 18;
    svg += `<rect x="${cx-22}" y="${y}" width="44" height="6" fill="${COLORS.pType}" opacity="0.5"/>`;
    svg += `<rect x="${cx-22}" y="${y+7}" width="44" height="4" fill="${COLORS.nType}" opacity="0.5"/>`;
  }
  svg += labelText(cx, cy + 48, type, 8, COLORS.textDim);
  return svg;
}

/** Hydropower system at (cx,cy) */
export function renderHydropower(cx, cy) {
  // Dam
  let svg = `<polygon points="${cx-80},${cy-50} ${cx-60},${cy+40} ${cx-40},${cy+40} ${cx-40},${cy-20}" fill="${COLORS.substrate}" stroke="${COLORS.ground}" stroke-width="2"/>`;
  svg += labelText(cx - 62, cy - 10, 'Dam', 8, COLORS.textDim);
  // Penstock
  svg += rigidLink(cx - 40, cy, cx - 10, cy + 20, COLORS.fluidBlue, 4);
  svg += labelText(cx - 30, cy + 10, 'Penstock', 7, COLORS.textDim, 'start');
  // Turbine
  svg += renderImpeller(cx + 10, cy + 28, 10, 20);
  svg += labelText(cx + 10, cy + 54, 'Turbine', 7, COLORS.textDim);
  // Generator
  svg += labeledShape(cx + 50, cy + 28, 36, 26, 'GEN', '', COLORS.componentFill, COLORS.componentBorder, 2, 9);
  svg += rigidLink(cx + 30, cy + 28, cx + 32, cy + 28, COLORS.wire, 2);
  // Output
  svg += rigidLink(cx + 68, cy + 28, cx + 84, cy + 28, COLORS.wire, 2, 'arrow-white');
  svg += labelText(cx + 88, cy + 28, 'AC', 8, COLORS.textDim, 'start');
  return svg;
}

/** Nuclear reactor schematic at (cx,cy) */
export function renderNuclearReactor(cx, cy) {
  let svg = circle(cx, cy, 50, 'rgba(16,185,129,0.08)', COLORS.normalForce, 2); // pressure vessel
  // Fuel rods
  for (let i = -2; i <= 2; i++) {
    svg += `<rect x="${cx + i * 14 - 3}" y="${cy - 30}" width="6" height="60" fill="${COLORS.highlight}" opacity="0.6" stroke="${COLORS.highlight}" stroke-width="1" rx="2"/>`;
  }
  // Control rods
  for (let i = -1; i <= 1; i++) {
    svg += `<rect x="${cx + i * 14 + 4}" y="${cy - 50}" width="4" height="50" fill="${COLORS.ground}" opacity="0.8"/>`;
  }
  svg += labelText(cx, cy + 60, 'Reactor Core', 8, COLORS.textDim);
  svg += labelText(cx - 70, cy, 'Coolant In', 7, COLORS.fluidBlue, 'end');
  svg += rigidLink(cx - 50, cy - 20, cx - 68, cy - 20, COLORS.fluidBlue, 1.5, 'arrow-blue');
  svg += rigidLink(cx + 50, cy + 20, cx + 68, cy + 20, COLORS.hot, 1.5, 'arrow-hot');
  svg += labelText(cx + 70, cy + 20, 'Coolant Out', 7, COLORS.hot, 'start');
  return svg;
}

/** UPS block diagram at (cx,cy), type = online | offline */
export function renderUPS(cx, cy, type = 'online') {
  let svg = labeledShape(cx - 60, cy, 40, 26, 'Rect.', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += renderBattery(cx, cy, '');
  svg += labeledShape(cx + 60, cy, 40, 26, 'Inv.', '', COLORS.componentFill, COLORS.componentBorder, 1.5, 8);
  svg += rigidLink(cx - 40, cy, cx - 28, cy, COLORS.wire, 1.5);
  svg += rigidLink(cx + 28, cy, cx + 40, cy, COLORS.wire, 1.5);
  svg += labelText(cx - 100, cy, 'AC In', 8, COLORS.textDim, 'end');
  svg += labelText(cx + 100, cy, 'AC Out', 8, COLORS.textDim, 'start');
  svg += labelText(cx, cy + 50, `${type} UPS`, 8, COLORS.textDim);
  return svg;
}

/** Switchgear layout at (cx,cy) */
export function renderSwitchgear(cx, cy) {
  // Busbar
  let svg = rigidLink(cx - 80, cy - 30, cx + 80, cy - 30, COLORS.phaseA, 3);
  svg += rigidLink(cx - 80, cy - 20, cx + 80, cy - 20, COLORS.phaseB, 3);
  svg += rigidLink(cx - 80, cy - 10, cx + 80, cy - 10, COLORS.phaseC, 3);
  svg += labelText(cx - 86, cy - 20, 'Bus', 8, COLORS.textDim, 'end');
  // Feeders with breakers
  for (let i = -2; i <= 2; i++) {
    const x = cx + i * 32;
    svg += renderCircuitBreaker(x, cy + 22, 'CB');
    svg += rigidLink(x, cy - 6, x, cy - 3, COLORS.wire, 1.5);
    svg += rigidLink(x, cy + 47, x, cy + 56, COLORS.wire, 1.5);
  }
  svg += labelText(cx, cy + 66, 'Switchgear Panel', 8, COLORS.textDim);
  return svg;
}

/** Current transformer (CT) at (cx,cy) */
export function renderCT(cx, cy) {
  let svg = circle(cx, cy, 18, COLORS.componentFill, COLORS.componentBorder, 2);
  svg += rigidLink(cx - 30, cy, cx + 30, cy, COLORS.phaseA, 3); // primary (single turn through)
  // Secondary winding symbol
  svg += labelText(cx, cy, 'CT', 9);
  svg += rigidLink(cx + 8, cy - 18, cx + 8, cy - 28, COLORS.wire, 1.5);
  svg += rigidLink(cx - 8, cy - 18, cx - 8, cy - 28, COLORS.wire, 1.5);
  svg += rigidLink(cx - 8, cy - 28, cx + 8, cy - 28, COLORS.wire, 1.5);
  svg += labelText(cx + 4, cy - 34, 'Burden', 7, COLORS.textDim, 'start');
  return svg;
}

/** STATCOM block at (cx,cy) */
export function renderSTATCOM(cx, cy) {
  let svg = labeledShape(cx, cy, 70, 50, 'STATCOM', 'VSC', COLORS.componentFill, COLORS.componentBorder, 2, 9);
  svg += rigidLink(cx, cy - 25, cx, cy - 40, COLORS.phaseA, 2);
  svg += labelText(cx, cy - 44, 'Bus', 8, COLORS.textDim);
  svg += labelText(cx, cy + 34, 'FACTS', 7, COLORS.textDim);
  return svg;
}

/** Hydro turbine (Francis) cross-section at (cx,cy) */
export function renderFrancisTurbine(cx, cy) {
  let svg = circle(cx, cy, 34, COLORS.componentFill, COLORS.componentBorder, 2); // runner
  // Runner blades
  for (let i = 0; i < 8; i++) {
    const a = i * 45 * RAD;
    svg += `<path d="M ${r(cx+8*Math.cos(a))} ${r(cy+8*Math.sin(a))} Q ${r(cx+24*Math.cos(a+0.3))} ${r(cy+24*Math.sin(a+0.3))} ${r(cx+32*Math.cos(a+0.2))} ${r(cy+32*Math.sin(a+0.2))}" stroke="${COLORS.fluidBlue}" stroke-width="2" fill="none"/>`;
  }
  // Spiral casing
  svg += `<ellipse cx="${cx}" cy="${cy}" rx="50" ry="44" fill="none" stroke="${COLORS.componentBorder}" stroke-width="1.5" stroke-dasharray="3,2"/>`;
  svg += labelText(cx, cy + 56, 'Francis Turbine', 8, COLORS.textDim);
  return svg;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION C — DOMAIN LAYOUT FUNCTIONS
// Each function consumes a scene graph and returns an array of SVG strings.
// ─────────────────────────────────────────────────────────────────────────────

/** Map a scene-graph position_hint or fraction [0,1] to canvas X coordinate */
function sceneX(hint, fallback = 200) {
  if (typeof hint === 'number') return 30 + hint * 340;
  const map = { left: 60, center: 200, right: 330, inlet: 40, outlet: 360, middle: 200, top: 200, bottom: 200 };
  return map[hint] || fallback;
}
function sceneY(hint, fallback = 130) {
  const map = { top: 50, center: 130, bottom: 210, left: 130, right: 130, inlet: 130, outlet: 130, middle: 130 };
  return map[hint] || fallback;
}

// ── C1: PHYSICS ──────────────────────────────────────────────────────────────
//
// Design principle: layoutPhysics NEVER pattern-matches on diagram_intent
// strings to decide what to draw. It reads the STRUCTURE of the scene graph
// (what constraints exist, how many, what bodies connect to what) and derives
// the topology deterministically. This makes it work for any novel question
// that uses the same geometric primitives, not just the questions we've seen.
//
// Topology resolver priority (each branch is mutually exclusive, highest wins):
//   T1  double_incline   — 2+ incline constraints, pulley(s), bodies on each
//   T2  single_incline   — exactly 1 incline constraint
//   T3  atwood           — 2+ hanging bodies, 1+ pulley, no incline
//   T4  table_pulley     — 1 surface body + 1 hanging body + pulley
//   T5  movable_pulley   — 2+ pulleys, multiple hanging masses
//   T6  spring_vertical  — spring constraint, body attached, no surface body
//   T7  spring_incline   — spring + incline
//   T8  spring_horizontal— spring constraint, body on surface
//   T9  spring_damper    — spring + damper constraints
//   T10 pendulum         — body with position_description === 'on_pulley'
//                          OR constraint type === 'pendulum' OR string clue
//   T11 circular         — body position === 'free' + centripetal force
//                          OR orbit/loop clue
//   T12 rotational       — body with moment/angular/disk semantic
//   T13 projectile       — body position === 'free' + gravity + applied initial
//   T14 ladder           — wall + floor constraints + single rod body
//   T15 collision        — 2+ bodies on surface, no constraints
//   T16 flat_surface_fbd — 1+ body on_surface (default FBD)

export function layoutPhysics(sceneGraph) {
  const els = [];
  const bodies      = sceneGraph.bodies      || [];
  const forces      = sceneGraph.forces      || [];
  const constraints = sceneGraph.constraints || [];
  const intent      = (sceneGraph.diagram_intent || '').toLowerCase();

  // ── Step 1: Classify constraints by type ─────────────────────────────────
  const inclines   = constraints.filter(c => c.type === 'incline');
  const pulleys    = constraints.filter(c => c.type === 'pulley');
  const springs    = constraints.filter(c => c.type === 'spring');
  const dampers    = constraints.filter(c => c.type === 'damper');
  const surfaces   = constraints.filter(c => c.type === 'surface' || c.type === 'floor');
  const walls      = constraints.filter(c => c.type === 'wall');

  // ── Step 2: Classify bodies by position_description ──────────────────────
  const bodiesOnIncline  = bodies.filter(b => b.position_description === 'on_incline');
  const bodiesHanging    = bodies.filter(b => b.position_description === 'hanging');
  const bodiesOnSurface  = bodies.filter(b => b.position_description === 'on_surface');
  const bodiesFree       = bodies.filter(b => b.position_description === 'free');
  const bodiesOnSpring   = bodies.filter(b => b.position_description === 'attached_to_spring');
  const bodiesOnPulley   = bodies.filter(b => b.position_description === 'on_pulley');

  // ── Step 3: Derive topology from structure ────────────────────────────────
  //
  // A body connects to an incline if its connects_to array contains that
  // incline's id, OR if it has position_description === 'on_incline'.
  // Multiple inclines → double (or multi) incline system.

  const isDoubleIncline = inclines.length >= 2 ||
    (inclines.length === 1 && bodiesOnIncline.length >= 2 &&
      // Check if bodies connect to different inclines or if second incline
      // is implied by different angles stored in inclines array
      false) ||
    // Detect by intent only as last resort, not primary
    (inclines.length === 0 && intent.includes('double incline'));

  // Bodies explicitly assigned to left vs right incline
  // LLM may tag them with connects_to referencing incline ids,
  // or use position_hint 'left'/'right', or ordering in bodies array
  const leftIncline  = inclines[0] || null;
  const rightIncline = inclines[1] || null;

  // ════════════════════════════════════════════════════════════════════════════
  // T1 — DOUBLE INCLINE (∧ shape, pulley at peak, bodies on each slope)
  // Triggered when: 2 incline constraints exist, OR 1 incline + 2 incline-bodies
  // with different angles, OR explicit double_incline topology in scene graph
  // ════════════════════════════════════════════════════════════════════════════
  if (inclines.length >= 2 || sceneGraph.topology === 'double_incline') {
    return _layoutDoubleIncline(els, bodies, forces, inclines, pulleys);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T2 — SINGLE INCLINE
  // ════════════════════════════════════════════════════════════════════════════
  if (inclines.length === 1) {
    return _layoutSingleIncline(els, bodies, forces, inclines[0], pulleys, springs, dampers);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T3 — ATWOOD MACHINE (two hanging masses over pulley, no incline)
  // ════════════════════════════════════════════════════════════════════════════
  if (pulleys.length > 0 && bodiesHanging.length >= 2 && bodiesOnSurface.length === 0) {
    return _layoutAtwood(els, bodies, forces, pulleys);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T4 — TABLE + PULLEY (mass on table connected to hanging mass)
  // ════════════════════════════════════════════════════════════════════════════
  if (pulleys.length > 0 && bodiesOnSurface.length >= 1 && bodiesHanging.length >= 1) {
    return _layoutTablePulley(els, bodies, forces, pulleys);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T5 — MOVABLE PULLEY SYSTEM (multiple pulleys, complex rope routing)
  // ════════════════════════════════════════════════════════════════════════════
  if (pulleys.length >= 2) {
    return _layoutMovablePulley(els, bodies, forces, pulleys);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T6 — SPRING + INCLINE
  // ════════════════════════════════════════════════════════════════════════════
  if (springs.length > 0 && inclines.length === 1) {
    return _layoutSingleIncline(els, bodies, forces, inclines[0], pulleys, springs, dampers);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T7 — SPRING / DAMPER VERTICAL (ceiling-hung or floor-mounted)
  // Triggered: spring constraint exists and body is attached_to_spring or
  // hanging, and no incline
  // ════════════════════════════════════════════════════════════════════════════
  if (springs.length > 0 && bodiesOnSurface.length === 0) {
    return _layoutSpringVertical(els, bodies, forces, springs, dampers);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T8 — SPRING HORIZONTAL (spring on surface)
  // ════════════════════════════════════════════════════════════════════════════
  if (springs.length > 0 && bodiesOnSurface.length > 0) {
    return _layoutSpringHorizontal(els, bodies, forces, springs, dampers, surfaces, walls);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T9 — PENDULUM
  // Triggered by: body position === 'on_pulley' (legacy), constraint type
  // === 'pendulum', or bodies with connects_to a string/pivot, or intent
  // ════════════════════════════════════════════════════════════════════════════
  const hasPendulumConstraint = constraints.some(c => c.type === 'pendulum' || c.type === 'string');
  const hasPendulumIntent     = intent.includes('pendulum') || intent.includes('conical') || intent.includes('oscillat');
  if (hasPendulumConstraint || bodiesOnPulley.length > 0 || hasPendulumIntent) {
    return _layoutPendulum(els, bodies, forces, constraints);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T10 — CIRCULAR MOTION / ORBIT
  // ════════════════════════════════════════════════════════════════════════════
  const hasCircularForce  = forces.some(f => f.type === 'centripetal' || (f.direction || '').includes('centripet'));
  const hasCircularIntent = intent.includes('circular') || intent.includes('orbit') ||
                            intent.includes('loop') || intent.includes('banked') ||
                            intent.includes('satellite') || intent.includes('turntable') ||
                            intent.includes('roller coaster');
  if (hasCircularForce || hasCircularIntent) {
    return _layoutCircular(els, bodies, forces, constraints);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T11 — ROTATIONAL DYNAMICS (disk, wheel, shaft, torque, rolling)
  // ════════════════════════════════════════════════════════════════════════════
  const hasRotationalForce  = forces.some(f => f.type === 'torque');
  const hasRotationalIntent = intent.includes('rotat') || intent.includes('torque') ||
                              intent.includes('disk') || intent.includes('wheel') ||
                              intent.includes('rolling') || intent.includes('angular') ||
                              intent.includes('spin') || intent.includes('see-saw') ||
                              intent.includes('seesaw') || intent.includes('yo-yo') ||
                              intent.includes('precession') || intent.includes('gyro');
  if (hasRotationalForce || hasRotationalIntent) {
    return _layoutRotational(els, bodies, forces, constraints);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T12 — PROJECTILE MOTION
  // ════════════════════════════════════════════════════════════════════════════
  const hasProjectileIntent = intent.includes('projectile') || intent.includes('trajectory') ||
                              intent.includes('launched') || intent.includes('parabolic');
  const hasInitialVelocity  = bodiesFree.length > 0 &&
                              forces.some(f => f.type === 'applied' || f.type === 'gravity');
  if (hasProjectileIntent || (hasInitialVelocity && bodiesOnSurface.length === 0 && springs.length === 0)) {
    return _layoutProjectile(els, bodies, forces);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T13 — LADDER (wall + floor + single extended body)
  // ════════════════════════════════════════════════════════════════════════════
  if (walls.length > 0 && surfaces.length > 0) {
    return _layoutLadder(els, bodies, forces, walls, surfaces);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T14 — COLLISION / MOMENTUM (2+ bodies on same surface, no connectors)
  // ════════════════════════════════════════════════════════════════════════════
  if (bodiesOnSurface.length >= 2 && pulleys.length === 0 && springs.length === 0) {
    return _layoutCollision(els, bodies, forces);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // T15 — DEFAULT: flat-surface FBD (catches everything else)
  // ════════════════════════════════════════════════════════════════════════════
  return _layoutFlatFBD(els, bodies, forces, surfaces, walls);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICS SUB-RENDERERS
// Each handles exactly one topology. They are pure: given scene-graph data,
// they produce SVG. No string-matching on intent except as a documented
// last-resort fallback clearly labelled as such.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draw force vectors for a body at (bx, by) on a surface tilted at slopeDeg.
 * slopeDeg = 0 for flat surface, positive = left-rising incline.
 * For right-slope bodies (right side of double incline), pass slopeDeg < 0.
 */
function _drawBodyForces(els, body, bx, by, slopeDeg, forces) {
  const bodyForces = forces.filter(f => !f.acts_on || f.acts_on === body.id);
  bodyForces.forEach(force => {
    const fAngle  = resolveForceAngle(force, slopeDeg);
    const fColor  = forceColor(force.type);
    const fMarker = forceMarker(force.type);
    const fLabel  = force.id || (force.type ? force.type[0].toUpperCase() : 'F');
    const fMag    = parseFloat(force.magnitude) || 40;
    els.push(vectorFromPoint(bx, by, fAngle, fMag, fColor, fMarker, fLabel));
  });
}

/**
 * Draw a block flush on a slope at fractional position t along that slope.
 * slopeX1,slopeY1 = base of slope; slopeX2,slopeY2 = top of slope.
 * angleDeg = rise angle of the slope (positive going up-right, negative up-left).
 * Returns {cx, cy} — block centre on canvas.
 */
function _placeBlockOnSlope(els, body, slopeX1, slopeY1, slopeX2, slopeY2, t, angleDeg, forces) {
  const cx = slopeX1 + (slopeX2 - slopeX1) * t;
  const cy = slopeY1 + (slopeY2 - slopeY1) * t;
  const w = 36, h = 36;
  // Rotate block to lie flush on slope
  const corners = [
    rotatePoint(cx - w / 2, cy - h / 2, cx, cy, -angleDeg),
    rotatePoint(cx + w / 2, cy - h / 2, cx, cy, -angleDeg),
    rotatePoint(cx + w / 2, cy + h / 2, cx, cy, -angleDeg),
    rotatePoint(cx - w / 2, cy + h / 2, cx, cy, -angleDeg),
  ];
  const pts = corners.map(p => `${r(p.x)},${r(p.y)}`).join(' ');
  els.push(`<polygon points="${pts}" fill="${COLORS.componentFill}" stroke="${COLORS.componentBorder}" stroke-width="2"/>`);
  if (body.mass) els.push(angledText(cx, cy, body.mass, angleDeg, COLORS.text, 10));
  _drawBodyForces(els, body, cx, cy, angleDeg, forces);
  return { cx, cy };
}

// ── T1: DOUBLE INCLINE ───────────────────────────────────────────────────────
function _layoutDoubleIncline(els, bodies, forces, inclines, pulleys) {
  // Canvas layout: peak centred at x=200, base at y=228
  const baseY  = 228;
  const lbx    = 20;   // left base x
  const rbx    = 380;  // right base x

  // Parse both incline angles (fall back gracefully if only one incline object)
  const a1 = parseFloat((inclines[0] || {}).angle) || 37;
  const a2 = parseFloat((inclines[1] || {}).angle) || 53;
  const f1 = !!(inclines[0] && inclines[0].coefficient && parseFloat(inclines[0].coefficient) > 0);
  const f2 = !!(inclines[1] && inclines[1].coefficient && parseFloat(inclines[1].coefficient) > 0);

  // Compute peak using intersection of the two slope lines (exact trig)
  const t1 = Math.tan(a1 * RAD);
  const t2 = Math.tan(a2 * RAD);
  const peakX = (lbx * t1 + rbx * t2) / (t1 + t2);
  const peakY = baseY - (peakX - lbx) * t1;

  // Draw terrain ─────────────────────────────────────────────────────────────
  // Left slope
  els.push(rigidLink(lbx, baseY, peakX, peakY, COLORS.ground, 3));
  // Right slope
  els.push(rigidLink(peakX, peakY, rbx, baseY, COLORS.ground, 3));
  // Base line
  els.push(rigidLink(lbx - 6, baseY, rbx + 6, baseY, COLORS.ground, 2));
  els.push(groundHatch((lbx + rbx) / 2, baseY + 4, rbx - lbx + 20));

  // Angle arcs + labels ──────────────────────────────────────────────────────
  const arcR = 26;
  // Left angle (from lbx, measured from horizontal going up the slope)
  els.push(`<path d="M ${lbx + arcR} ${baseY} A ${arcR} ${arcR} 0 0 0 ${r(lbx + arcR * Math.cos(a1 * RAD))} ${r(baseY - arcR * Math.sin(a1 * RAD))}" stroke="${COLORS.textDim}" stroke-width="1" fill="none"/>`);
  els.push(labelText(lbx + arcR + 14, baseY - 10, `θ₁=${a1}°`, 8, COLORS.textDim));
  // Right angle (from rbx, measured from horizontal going up the slope left)
  els.push(`<path d="M ${rbx - arcR} ${baseY} A ${arcR} ${arcR} 0 0 1 ${r(rbx - arcR * Math.cos(a2 * RAD))} ${r(baseY - arcR * Math.sin(a2 * RAD))}" stroke="${COLORS.textDim}" stroke-width="1" fill="none"/>`);
  els.push(labelText(rbx - arcR - 14, baseY - 10, `θ₂=${a2}°`, 8, COLORS.textDim, 'end'));

  // Friction hatch marks ─────────────────────────────────────────────────────
  if (f1) {
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const hx = lbx + (peakX - lbx) * t;
      const hy = baseY + (peakY - baseY) * t;
      const np = rotatePoint(hx + 5, hy + 4, hx, hy, -a1);
      els.push(rigidLink(hx, hy, np.x, np.y, COLORS.friction, 1));
    }
  }
  if (f2) {
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const hx = peakX + (rbx - peakX) * t;
      const hy = peakY + (baseY - peakY) * t;
      const np = rotatePoint(hx - 5, hy + 4, hx, hy, a2);
      els.push(rigidLink(hx, hy, np.x, np.y, COLORS.friction, 1));
    }
  }

  // Pulley at peak ──────────────────────────────────────────────────────────
  els.push(pulleySymbol(peakX, peakY - 14, 14));

  // Place bodies ────────────────────────────────────────────────────────────
  // Strategy: assign bodies to slopes.
  //  - If body.connects_to references inclines[0].id → left slope
  //  - If body.connects_to references inclines[1].id → right slope
  //  - Else: first body → left slope, remaining → right slope
  //  - position_description === 'on_incline' with no connects_to distinction
  //    → use body order (first = left, second = right)

  const leftBodies  = [];
  const rightBodies = [];

  bodies.forEach(body => {
    const links = body.connects_to || [];
    const lid   = (inclines[0] || {}).id;
    const rid   = (inclines[1] || {}).id;
    if (lid && links.includes(lid))      leftBodies.push(body);
    else if (rid && links.includes(rid)) rightBodies.push(body);
    else if (body.position_description === 'on_incline' || body.position_description === 'on_surface') {
      // Assign by order
      if (leftBodies.length <= rightBodies.length) leftBodies.push(body);
      else rightBodies.push(body);
    }
    // hanging bodies are handled separately (via rope over pulley)
  });

  // If no explicit assignment, split bodies by order
  if (leftBodies.length === 0 && rightBodies.length === 0) {
    bodies.forEach((b, i) => {
      if (i % 2 === 0) leftBodies.push(b);
      else             rightBodies.push(b);
    });
  }

  // Track rope endpoints for drawing
  let ropeLeft  = null; // {cx, cy} on left slope
  let ropeRight = null; // {cx, cy} on right slope

  // Left-slope bodies (positioned at t=0.4 up from base)
  leftBodies.forEach((body, i) => {
    const t = 0.35 + i * 0.18;
    const result = _placeBlockOnSlope(els, body, lbx, baseY, peakX, peakY, t, a1, forces);
    if (i === leftBodies.length - 1) ropeLeft = result; // topmost block connects to rope
  });

  // Right-slope bodies (positioned at t=0.35 down from peak)
  rightBodies.forEach((body, i) => {
    const t = 0.35 + i * 0.18;
    const result = _placeBlockOnSlope(els, body, peakX, peakY, rbx, baseY, t, -a2, forces);
    if (i === 0) ropeRight = result; // topmost block on right connects to rope
  });

  // Draw rope: left body → pulley → right body ──────────────────────────────
  if (ropeLeft) {
    // Rope from top of left block to pulley
    const topCorner = rotatePoint(ropeLeft.cx + 18, ropeLeft.cy - 18, ropeLeft.cx, ropeLeft.cy, -a1);
    els.push(renderRope(topCorner.x, topCorner.y, peakX - 6, peakY - 14, 'T'));
  }
  if (ropeRight) {
    const topCorner = rotatePoint(ropeRight.cx - 18, ropeRight.cy - 18, ropeRight.cx, ropeRight.cy, a2);
    els.push(renderRope(peakX + 6, peakY - 14, topCorner.x, topCorner.y, 'T'));
  }

  return els;
}

// ── T2: SINGLE INCLINE ───────────────────────────────────────────────────────
function _layoutSingleIncline(els, bodies, forces, incline, pulleys, springs, dampers) {
  const angleDeg    = parseFloat(incline.angle) || 30;
  const hasRoughness = incline.coefficient && parseFloat(incline.coefficient) > 0;
  const baseX = 20, baseY = 228, length = 310;

  // Draw incline surface
  els.push(renderIncline(baseX, baseY, length, angleDeg, hasRoughness));

  // Peak coordinates
  const peakX = baseX + length * Math.cos(angleDeg * RAD);
  const peakY = baseY - length * Math.sin(angleDeg * RAD);

  // Pulley at peak (if present)
  if (pulleys.length > 0) {
    els.push(pulleySymbol(peakX, peakY - 10, 14));
  }

  // Spring along slope (if present)
  if (springs.length > 0) {
    // Spring anchors at base of incline
    const springEndX = baseX + 60 * Math.cos(angleDeg * RAD);
    const springEndY = baseY - 60 * Math.sin(angleDeg * RAD);
    els.push(springPath(baseX + 8, baseY - 8, springEndX, springEndY, 5, 6));
    if (dampers.length > 0) {
      const dOff = rotatePoint(baseX + 8 + 14, baseY - 8, baseX + 8, baseY - 8, -angleDeg);
      const dEnd = rotatePoint(springEndX + 14, springEndY, springEndX, springEndY, -angleDeg);
      els.push(damperSymbol(dOff.x, dOff.y, dEnd.x, dEnd.y));
    }
  }

  // Place bodies on incline
  const inclineBodies = bodies.filter(b =>
    b.position_description === 'on_incline' ||
    b.position_description === 'on_surface' ||
    (b.connects_to || []).includes(incline.id)
  );
  // Fallback: if no body explicitly tagged, use all non-hanging bodies
  const activeBodies = inclineBodies.length > 0
    ? inclineBodies
    : bodies.filter(b => b.position_description !== 'hanging');

  activeBodies.forEach((body, i) => {
    const t = springs.length > 0 ? 0.35 + i * 0.18 : 0.30 + i * 0.20;
    _placeBlockOnSlope(els, body, baseX, baseY, peakX, peakY, t, angleDeg, forces);
  });

  // Hanging mass over pulley at peak
  if (pulleys.length > 0) {
    const hangingBodies = bodies.filter(b => b.position_description === 'hanging');
    hangingBodies.forEach((hb, i) => {
      const hx = peakX + 30 + i * 50;
      const hy = peakY + 60 + i * 30;
      els.push(renderBlock(hx, hy, hb.mass));
      els.push(renderRope(hx, hy - 20, peakX + 14, peakY - 10, `T${i + 1}`));
      _drawBodyForces(els, hb, hx, hy, 0, forces);
    });
  }

  return els;
}

// ── T3: ATWOOD MACHINE ───────────────────────────────────────────────────────
function _layoutAtwood(els, bodies, forces, pulleys) {
  const nPulleys = pulleys.length;
  const px = 200, py = 44;

  // Draw pulleys
  els.push(pulleySymbol(px, py, 16));
  if (nPulleys >= 2) els.push(pulleySymbol(px + 60, py + 40, 14));

  // Ceiling mount
  els.push(groundHatch(px, py - 16, 40));
  els.push(rigidLink(px, py - 16, px, py - 2, COLORS.ground, 2));

  const hangingBodies = bodies.filter(b =>
    b.position_description === 'hanging' ||
    b.position_description === 'free'
  );

  // Simple two-mass Atwood
  if (hangingBodies.length >= 2) {
    const m1 = hangingBodies[0], m2 = hangingBodies[1];
    const x1 = px - 52, y1 = 130;
    const x2 = px + 52, y2 = 140;
    els.push(renderBlock(x1, y1, m1.mass));
    els.push(renderBlock(x2, y2, m2.mass));
    els.push(renderRope(x1, y1 - 20, px - 14, py + 2, 'T₁'));
    els.push(renderRope(x2, y2 - 20, px + 14, py + 2, 'T₂'));
    _drawBodyForces(els, m1, x1, y1, 0, forces);
    _drawBodyForces(els, m2, x2, y2, 0, forces);
  } else if (bodies.length >= 2) {
    // Fallback: treat first two bodies as the two sides
    const [b1, b2] = bodies;
    els.push(renderBlock(px - 52, 130, b1?.mass));
    els.push(renderBlock(px + 52, 130, b2?.mass));
    els.push(renderRope(px - 52, 110, px - 14, py + 2, 'T'));
    els.push(renderRope(px + 52, 110, px + 14, py + 2, 'T'));
  }

  // Third mass for triple Atwood
  if (hangingBodies.length >= 3) {
    const m3 = hangingBodies[2];
    els.push(renderBlock(px + 60 + 30, py + 90, m3.mass));
    els.push(renderRope(px + 60 + 30, py + 70, px + 60 + 14, py + 40, 'T₃'));
    _drawBodyForces(els, m3, px + 60 + 30, py + 90, 0, forces);
  }

  return els;
}

// ── T4: TABLE + PULLEY ───────────────────────────────────────────────────────
function _layoutTablePulley(els, bodies, forces, pulleys) {
  const tableY = 148;
  const px = 340, py = tableY - 14; // pulley at right edge of table

  // Table surface
  els.push(rigidLink(20, tableY, px + 20, tableY, COLORS.ground, 2));
  els.push(groundHatch((20 + px) / 2, tableY + 4, px));

  // Pulley at edge
  els.push(pulleySymbol(px, py, 14));

  const surfaceBodies = bodies.filter(b => b.position_description === 'on_surface');
  const hangingBodies = bodies.filter(b => b.position_description === 'hanging');

  // Place table masses
  const tableStep = surfaceBodies.length > 1 ? 120 / surfaceBodies.length : 120;
  surfaceBodies.forEach((body, i) => {
    const bx = 80 + i * tableStep;
    const by = tableY - 24;
    els.push(renderBlock(bx, by, body.mass));
    _drawBodyForces(els, body, bx, by, 0, forces);
    // Rope connecting to next or to pulley
    if (i < surfaceBodies.length - 1) {
      els.push(renderRope(bx + 20, by, bx + tableStep - 20, by, 'T'));
    } else {
      els.push(renderRope(bx + 20, by, px - 14, by, 'T'));
    }
  });

  // Hanging masses below pulley
  hangingBodies.forEach((body, i) => {
    const hx = px + 16;
    const hy = py + 44 + i * 50;
    els.push(renderBlock(hx, hy, body.mass));
    els.push(renderRope(hx, hy - 20, px + 14, py + 2, 'T'));
    _drawBodyForces(els, body, hx, hy, 0, forces);
  });

  return els;
}

// ── T5: MOVABLE PULLEY ───────────────────────────────────────────────────────
function _layoutMovablePulley(els, bodies, forces, pulleys) {
  // Fixed pulley top, movable pulley below with load
  const px1 = 180, py1 = 44;
  const px2 = 220, py2 = 130; // movable
  els.push(groundHatch(px1, py1 - 16, 40));
  els.push(rigidLink(px1, py1 - 16, px1, py1 - 2, COLORS.ground, 2));
  els.push(pulleySymbol(px1, py1, 16));
  els.push(pulleySymbol(px2, py2, 14));
  // Rope: effort end → fixed pulley → under movable pulley → anchor
  els.push(renderRope(100, 80, px1 - 14, py1, 'F'));
  els.push(renderRope(px1 + 14, py1, px2 + 14, py2 - 14, 'T'));
  els.push(renderRope(px2 - 14, py2 + 14, px2 - 14, py2 + 50, 'T'));
  // Load under movable pulley
  const load = bodies[0] || { mass: 'W' };
  els.push(renderBlock(px2, py2 + 64, load.mass));
  els.push(rigidLink(px2, py2 + 14, px2, py2 + 44, COLORS.tension, 2));
  _drawBodyForces(els, load, px2, py2 + 64, 0, forces);
  // Label mechanical advantage
  els.push(labelText(px2 + 26, py2, 'MA=2', 8, COLORS.textDim, 'start'));
  return els;
}

// ── T6: SPRING VERTICAL ──────────────────────────────────────────────────────
function _layoutSpringVertical(els, bodies, forces, springs, dampers) {
  const hasDamper = dampers.length > 0;
  const nSprings  = springs.length;

  // Ceiling
  els.push(groundHatch(200, 28, 60));
  els.push(rigidLink(200, 28, 200, 34, COLORS.ground, 2));

  if (nSprings === 2 && springs[0].connects_to && springs[1].connects_to &&
      springs[0].connects_to.some(id => springs[1].connects_to.includes(id))) {
    // Two springs in series
    els.push(springPath(200, 34, 200, 100, 5, 7));
    els.push(springPath(200, 100, 200, 156, 5, 7));
    els.push(labelText(218, 67, springs[0].value || 'k₁', 8, COLORS.springColor, 'start'));
    els.push(labelText(218, 128, springs[1].value || 'k₂', 8, COLORS.springColor, 'start'));
  } else if (nSprings === 2) {
    // Two springs in parallel
    els.push(springPath(185, 34, 185, 156, 5, 6));
    els.push(springPath(215, 34, 215, 156, 5, 6));
    els.push(labelText(170, 95, springs[0].value || 'k₁', 8, COLORS.springColor, 'end'));
    els.push(labelText(230, 95, springs[1].value || 'k₂', 8, COLORS.springColor, 'start'));
    els.push(rigidLink(175, 156, 225, 156, COLORS.componentBorder, 2));
  } else {
    // Single spring (with optional parallel damper)
    if (hasDamper) {
      els.push(springPath(182, 34, 182, 156, 5, 7));
      els.push(damperSymbol(218, 40, 218, 150));
      els.push(rigidLink(178, 156, 222, 156, COLORS.componentBorder, 2));
      els.push(labelText(162, 95, springs[0].value || 'k', 8, COLORS.springColor, 'end'));
      els.push(labelText(234, 95, 'c', 8, COLORS.textDim, 'start'));
    } else {
      els.push(springPath(200, 34, 200, 156, 5, 7));
      els.push(labelText(218, 95, springs[0].value || 'k', 8, COLORS.springColor, 'start'));
    }
  }

  // Equilibrium line
  els.push(dashedLine(160, 156, 240, 156, COLORS.textDim, '3,3'));

  // Mass
  const m = bodies[0];
  const my = 186;
  els.push(renderBlock(200, my, m?.mass));
  _drawBodyForces(els, m || { id: 'b1' }, 200, my, 0, forces);

  return els;
}

// ── T7: SPRING HORIZONTAL ────────────────────────────────────────────────────
function _layoutSpringHorizontal(els, bodies, forces, springs, dampers, surfaces, walls) {
  const groundY = 215;
  els.push(rigidLink(20, groundY, 380, groundY, COLORS.ground, 2));
  els.push(groundHatch(200, groundY + 4, 360));

  // Wall anchor on left
  els.push(renderFixedSupport(30, groundY - 40, 'left'));

  const nSprings = springs.length;
  const hasDamper = dampers.length > 0;

  if (nSprings === 2) {
    // Two springs: series or parallel
    const shared = springs[0].connects_to && springs[1].connects_to &&
      springs[0].connects_to.some(id => (springs[1].connects_to || []).includes(id));
    if (shared) {
      // Series horizontal
      els.push(springPath(46, groundY - 40, 160, groundY - 40, 5, 7));
      els.push(springPath(160, groundY - 40, 260, groundY - 40, 5, 7));
    } else {
      // Parallel horizontal
      els.push(springPath(46, groundY - 50, 200, groundY - 50, 5, 6));
      els.push(springPath(46, groundY - 30, 200, groundY - 30, 5, 6));
    }
  } else {
    // Single spring horizontal (with optional damper in parallel)
    if (hasDamper) {
      els.push(springPath(46, groundY - 50, 200, groundY - 50, 5, 7));
      els.push(damperSymbol(46, groundY - 28, 200, groundY - 28));
      els.push(labelText(123, groundY - 60, springs[0].value || 'k', 8, COLORS.springColor));
      els.push(labelText(123, groundY - 18, 'c', 8, COLORS.textDim));
    } else {
      els.push(springPath(46, groundY - 40, 200, groundY - 40, 5, 7));
      els.push(labelText(123, groundY - 52, springs[0].value || 'k', 8, COLORS.springColor));
    }
  }

  // Equilibrium dashed line
  els.push(dashedLine(200, groundY - 70, 200, groundY, COLORS.textDim, '3,3'));

  // Mass block
  const m = bodies[0];
  els.push(renderBlock(240, groundY - 40, m?.mass));
  els.push(rigidLink(200, groundY - 40, 220, groundY - 40, COLORS.componentBorder, 2)); // connector stub
  _drawBodyForces(els, m || { id: 'b1' }, 240, groundY - 40, 0, forces);

  return els;
}

// ── T8: PENDULUM ─────────────────────────────────────────────────────────────
function _layoutPendulum(els, bodies, forces, constraints) {
  const isDouble   = bodies.length >= 2 && bodies.every(b => b.position_description === 'hanging' || b.position_description === 'on_pulley');
  const isConical  = constraints.some(c => c.type === 'conical') || forces.some(f => f.type === 'centripetal');
  const pendLength = 120;

  // Pivot
  els.push(groundHatch(200, 26, 50));
  els.push(rigidLink(200, 26, 200, 32, COLORS.ground, 2));
  els.push(circle(200, 32, 4, COLORS.ground, COLORS.ground, 2));

  if (isDouble) {
    // Double pendulum
    const m1 = bodies[0], m2 = bodies[1];
    const a1 = 20, a2 = 35; // display angles
    const x1 = 200 + pendLength * 0.55 * Math.sin(a1 * RAD);
    const y1 = 32   + pendLength * 0.55 * Math.cos(a1 * RAD);
    const x2 = x1   + pendLength * 0.45 * Math.sin((a1 + a2) * RAD);
    const y2 = y1   + pendLength * 0.45 * Math.cos((a1 + a2) * RAD);
    els.push(rigidLink(200, 32, x1, y1, COLORS.tension, 2));
    els.push(circle(x1, y1, 12, COLORS.componentFill, COLORS.componentBorder, 2));
    els.push(labelText(x1, y1 + 4, m1.mass || '', 9));
    els.push(rigidLink(x1, y1, x2, y2, COLORS.tension, 2));
    els.push(circle(x2, y2, 12, COLORS.componentFill, COLORS.componentBorder, 2));
    els.push(labelText(x2, y2 + 4, m2.mass || '', 9));
    _drawBodyForces(els, m1, x1, y1, 0, forces);
    _drawBodyForces(els, m2, x2, y2, 0, forces);
  } else if (isConical) {
    // Conical pendulum: string at angle, circular path shown dashed
    const a = 30;
    const bobX = 200 + pendLength * Math.sin(a * RAD);
    const bobY = 32  + pendLength * Math.cos(a * RAD);
    els.push(rigidLink(200, 32, bobX, bobY, COLORS.tension, 2));
    els.push(circle(bobX, bobY, 12, COLORS.componentFill, COLORS.componentBorder, 2));
    const circleR = pendLength * Math.sin(a * RAD);
    els.push(`<ellipse cx="${r(bobX)}" cy="${r(bobY)}" rx="${r(circleR)}" ry="${r(circleR * 0.25)}" fill="none" stroke="${COLORS.textDim}" stroke-width="1" stroke-dasharray="3,3"/>`);
    els.push(dashedLine(200, 32, 200, bobY, COLORS.textDim, '3,3'));
    const m = bodies[0];
    if (m) {
      els.push(labelText(bobX, bobY + 4, m.mass || '', 9));
      _drawBodyForces(els, m, bobX, bobY, 0, forces);
    }
  } else {
    // Simple pendulum
    const a = 22;
    const bobX = 200 + pendLength * Math.sin(a * RAD);
    const bobY = 32  + pendLength * Math.cos(a * RAD);
    els.push(rigidLink(200, 32, bobX, bobY, COLORS.tension, 2));
    // Equilibrium dashed line
    els.push(dashedLine(200, 32, 200, 32 + pendLength, COLORS.textDim, '3,3'));
    // Angular displacement arc
    els.push(`<path d="M 200 ${32 + 60} A 60 60 0 0 1 ${r(200 + 60 * Math.sin(a * RAD))} ${r(32 + 60 * Math.cos(a * RAD))}" stroke="${COLORS.textDim}" stroke-width="1" fill="none"/>`);
    els.push(labelText(214, 108, `${a}°`, 8, COLORS.textDim, 'start'));
    const m = bodies[0];
    els.push(circle(bobX, bobY, 14, COLORS.componentFill, COLORS.componentBorder, 2));
    if (m) {
      els.push(labelText(bobX, bobY + 4, m.mass || '', 9));
      _drawBodyForces(els, m, bobX, bobY, 0, forces);
    }
  }

  return els;
}

// ── T9: CIRCULAR MOTION ──────────────────────────────────────────────────────
function _layoutCircular(els, bodies, forces, constraints) {
  const intent = '';
  const isBanked    = forces.some(f => f.type === 'normal' && (f.direction || '').includes('angle'));
  const isRollerTop = forces.some(f => f.type === 'normal' && (f.direction || '').includes('down'));
  const isOrbit     = bodies.some(b => (b.position_description || '').includes('free'));

  if (isOrbit) {
    // Satellite / orbit
    const orbR = 75;
    els.push(circle(200, 130, 12, COLORS.highlight, COLORS.highlight, 3)); // planet/body
    els.push(renderOrbit(200, 130, orbR));
    const satX = 200 + orbR, satY = 130;
    const m = bodies[0];
    els.push(renderBlock(satX, satY, m?.mass, 26, 26));
    _drawBodyForces(els, m || { id: 'b1' }, satX, satY, 0, forces);
    return els;
  }

  const loopR = 70;
  // Loop / banked curve: draw circle
  els.push(`<circle cx="200" cy="130" r="${loopR}" fill="none" stroke="${COLORS.ground}" stroke-width="2.5"/>`);

  // Place body at top or bottom of loop based on forces
  const atTop    = forces.some(f => (f.direction || '').toLowerCase().includes('down') && f.type === 'normal');
  const atBottom = forces.some(f => (f.direction || '').toLowerCase().includes('up')   && f.type === 'normal');
  const bodyY    = atTop ? 130 - loopR : atBottom ? 130 + loopR : 130 - loopR;
  const bodyX    = 200;

  const m = bodies[0];
  els.push(renderBlock(bodyX, bodyY, m?.mass, 30, 30));
  _drawBodyForces(els, m || { id: 'b1' }, bodyX, bodyY, 0, forces);

  // Centripetal direction indicator
  els.push(vectorFromPoint(bodyX, bodyY, atTop ? 90 : 270, 30, COLORS.componentBorder, 'arrow-blue', 'Fc'));

  // Ground line below
  els.push(rigidLink(100, 130 + loopR + 12, 300, 130 + loopR + 12, COLORS.ground, 2));
  els.push(groundHatch(200, 130 + loopR + 16, 200));

  return els;
}

// ── T10: ROTATIONAL DYNAMICS ─────────────────────────────────────────────────
function _layoutRotational(els, bodies, forces, constraints) {
  const body = bodies[0];
  const mass = body?.mass || '';

  // See-saw / beam balance
  const isSeeSaw = bodies.length >= 2 && !constraints.some(c => c.type !== 'surface');
  if (isSeeSaw || bodies.length >= 2) {
    const pivX = 200, pivY = 180;
    const beamW = 280;
    // Beam
    els.push(rigidLink(pivX - beamW / 2, pivY - 4, pivX + beamW / 2, pivY - 4, COLORS.componentBorder, 4));
    // Pivot triangle
    els.push(triangle(pivX, pivY, pivX - 16, pivY + 22, pivX + 16, pivY + 22, COLORS.componentFill, COLORS.componentBorder, 2));
    els.push(groundHatch(pivX, pivY + 26, 40));
    // Masses
    bodies.forEach((b, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const dist = 80 + Math.floor(i / 2) * 40;
      const bx = pivX + side * dist;
      els.push(renderBlock(bx, pivY - 44, b.mass, 34, 34));
      els.push(rigidLink(bx, pivY - 27, bx, pivY - 4, COLORS.tension, 1.5));
      _drawBodyForces(els, b, bx, pivY - 44, 0, forces);
      // Torque label
      els.push(labelText(bx, pivY - 66, `d${i + 1}`, 8, COLORS.textDim));
    });
    // Torque arcs
    els.push(curvedVector(pivX - 60, pivY - 4, 24, 200, 340, COLORS.momentArc, 'τ₁'));
    els.push(curvedVector(pivX + 60, pivY - 4, 24, 20, 160, COLORS.momentArc, 'τ₂'));
    return els;
  }

  // Rolling object on incline or flat
  const incline = constraints.find(c => c.type === 'incline');
  if (incline) {
    const a = parseFloat(incline.angle) || 30;
    els.push(renderIncline(20, 228, 310, a, false));
    const peakX = 20 + 310 * Math.cos(a * RAD);
    const peakY = 228 - 310 * Math.sin(a * RAD);
    const bx = 20 + 310 * 0.45 * Math.cos(a * RAD);
    const by = 228 - 310 * 0.45 * Math.sin(a * RAD);
    els.push(circle(bx, by, 20, COLORS.componentFill, COLORS.componentBorder, 2));
    els.push(labelText(bx, by + 4, mass, 9));
    els.push(curvedVector(bx, by, 16, 40, 280, COLORS.momentArc, 'α'));
    _drawBodyForces(els, body || { id: 'b1' }, bx, by, a, forces);
    return els;
  }

  // Disk / wheel with torque
  const diskR = 60;
  els.push(renderWheel(200, 130, diskR, forces.find(f => f.type === 'torque')?.magnitude || 'τ'));
  els.push(labelText(200, 130 + 4, mass, 9));
  _drawBodyForces(els, body || { id: 'b1' }, 200, 130 - diskR, 0, forces);

  // Axle support
  els.push(groundHatch(200, 130 + diskR + 14, 40));
  els.push(rigidLink(200, 130 + diskR, 200, 130 + diskR + 14, COLORS.ground, 2));

  return els;
}

// ── T11: PROJECTILE ──────────────────────────────────────────────────────────
function _layoutProjectile(els, bodies, forces) {
  const body   = bodies[0];
  const launchAngle = parseFloat(
    (forces.find(f => f.type === 'applied')?.direction || '45').replace(/[^0-9.]/g, '')
  ) || 45;
  const vx = 52 * Math.cos(launchAngle * RAD);
  const vy = -52 * Math.sin(launchAngle * RAD);

  // Ground
  els.push(rigidLink(20, 232, 380, 232, COLORS.ground, 2));
  els.push(groundHatch(200, 234, 360));

  // Cliff launch (if initial height indicated) or flat launch
  const fromCliff = (forces.find(f => f.type === 'applied')?.direction || '').toLowerCase().includes('horizontal');
  const launchY   = fromCliff ? 190 : 228;
  const launchX   = 40;

  if (fromCliff) {
    els.push(rigidLink(launchX, launchY, launchX, 232, COLORS.ground, 2.5)); // cliff edge
    els.push(groundHatch(launchX, 234, 50));
  }

  // Trajectory arc
  els.push(renderProjectileTrajectory(launchX, launchY, vx, vy));

  // Velocity components at launch
  els.push(vectorFromPoint(launchX, launchY, 0, Math.abs(vx) * 0.8, COLORS.componentBorder, 'arrow-blue', 'vₓ'));
  els.push(vectorFromPoint(launchX, launchY, 270, Math.abs(vy) * 0.8, COLORS.friction, 'arrow-amber', 'vy'));

  // Launch angle arc
  if (!fromCliff) {
    els.push(`<path d="M ${launchX + 20} ${launchY} A 20 20 0 0 0 ${r(launchX + 20 * Math.cos(launchAngle * RAD))} ${r(launchY - 20 * Math.sin(launchAngle * RAD))}" stroke="${COLORS.textDim}" stroke-width="1" fill="none"/>`);
    els.push(labelText(launchX + 28, launchY - 10, `${launchAngle}°`, 8, COLORS.textDim));
  }

  // Body at peak
  if (body) {
    const steps = 6;
    const g = 4;
    const px = launchX + vx * steps / 12 * 2;
    const py = launchY + vy * steps / 12 * 2 + 0.5 * g * Math.pow(steps / 12 * 2, 2);
    els.push(circle(r(px), r(py), 8, COLORS.componentBorder, COLORS.componentBorder, 2));
    els.push(labelText(r(px), r(py) - 12, body.mass || '', 8, COLORS.text));
  }

  return els;
}

// ── T12: LADDER ──────────────────────────────────────────────────────────────
function _layoutLadder(els, bodies, forces, walls, surfaces) {
  const ladderAngle = 60; // typical — LLM provides actual angle in constraints
  const constraint  = [...walls, ...surfaces][0];
  const a = parseFloat(constraint?.angle) || ladderAngle;

  const baseX = 180, baseY = 228;
  const ladderLen = 160;
  const topX  = baseX - ladderLen * Math.cos(a * RAD);
  const topY  = baseY - ladderLen * Math.sin(a * RAD);

  // Ground + wall
  els.push(rigidLink(60, baseY, 340, baseY, COLORS.ground, 2));
  els.push(groundHatch(200, baseY + 4, 280));
  els.push(rigidLink(topX - 2, topY - 20, topX - 2, baseY, COLORS.ground, 3)); // wall
  for (let i = 0; i < 5; i++) {
    els.push(rigidLink(topX - 2, topY - 16 + i * 40, topX - 18, topY - 8 + i * 40, COLORS.ground, 1));
  }

  // Ladder beam
  els.push(rigidLink(baseX, baseY, topX, topY, COLORS.componentBorder, 5));

  // Rungs
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const rx1 = baseX + (topX - baseX) * t - 6;
    const ry1 = baseY + (topY - baseY) * t;
    const rp  = rotatePoint(rx1 + 12, ry1, rx1, ry1, 0);
    els.push(rigidLink(rx1, ry1, rp.x, rp.y, COLORS.componentBorder, 2));
  }

  // Forces
  const person = bodies.find(b => b.id !== 'ladder') || bodies[0];
  if (person) {
    const t = 0.6;
    const px = baseX + (topX - baseX) * t;
    const py = baseY + (topY - baseY) * t;
    els.push(circle(px, py, 8, COLORS.componentFill, COLORS.componentBorder, 2));
    els.push(labelText(px + 10, py, person.mass || '', 8, COLORS.text, 'start'));
    _drawBodyForces(els, person, px, py, 0, forces);
  }

  // Reaction labels
  els.push(labelText(baseX + 8, baseY - 8, 'F_floor', 8, COLORS.normalForce, 'start'));
  els.push(labelText(topX - 8, topY + 8, 'F_wall', 8, COLORS.normalForce, 'end'));

  return els;
}

// ── T13: COLLISION ───────────────────────────────────────────────────────────
function _layoutCollision(els, bodies, forces) {
  const groundY = 215;
  els.push(rigidLink(20, groundY, 380, groundY, COLORS.ground, 2));
  els.push(groundHatch(200, groundY + 4, 360));

  const n = Math.min(bodies.length, 4);
  const spacing = 280 / Math.max(1, n - 1);

  bodies.slice(0, n).forEach((body, i) => {
    const bx = 80 + i * spacing;
    const by = groundY - 24;
    els.push(renderBlock(bx, by, body.mass));
    _drawBodyForces(els, body, bx, by, 0, forces);
    // Velocity arrow (direction based on order: left bodies move right, right bodies move left)
    const vDir = i < Math.floor(n / 2) ? 0 : 180;
    els.push(vectorFromPoint(bx, by - 26, vDir, 28, COLORS.componentBorder, 'arrow-blue',
      `v${i + 1}`));
  });

  // Impact marker between bodies
  if (n >= 2) {
    const impactX = (80 + 80 + (n - 1) * spacing) / 2;
    els.push(labelText(impactX, groundY - 50, '⊕ Impact', 9, COLORS.highlight));
  }

  return els;
}

// ── T14: FLAT SURFACE FBD (default) ─────────────────────────────────────────
function _layoutFlatFBD(els, bodies, forces, surfaces, walls) {
  const groundY = 215;
  els.push(rigidLink(20, groundY, 380, groundY, COLORS.ground, 2));
  els.push(groundHatch(200, groundY + 4, 360));

  // Wall on left if wall constraint present
  if (walls.length > 0) {
    els.push(rigidLink(28, groundY - 80, 28, groundY, COLORS.ground, 3));
    for (let i = 0; i < 4; i++) {
      els.push(rigidLink(28, groundY - 70 + i * 20, 14, groundY - 62 + i * 20, COLORS.ground, 1));
    }
  }

  // Stack multiple bodies if stacked scenario
  const n = Math.min(bodies.length, 3);
  bodies.slice(0, n).forEach((body, i) => {
    const bx = 200;
    const by = groundY - 24 - i * 44; // stack vertically
    els.push(renderBlock(bx, by, body.mass));
    _drawBodyForces(els, body, bx, by, 0, forces);
    // If stacked, show contact force between blocks
    if (i > 0) els.push(dashedLine(bx - 24, by + 22, bx + 24, by + 22, COLORS.textDim, '2,2'));
  });

  return els;
}

/** Resolve semantic force direction to SVG angle (degrees, 0=right, 90=down) */
function resolveForceAngle(force, inclineAngleDeg = 0) {
  const d = (force.direction || '').toLowerCase();
  if (d.includes('270') || d.includes('vertical down') || d.includes('down') && !d.includes('up'))      return 90;
  if (d.includes('90')  || d.includes('vertical up')   || d.includes('up')   && !d.includes('down'))    return 270;
  if (d.includes('0')   || d.includes('right'))   return 0;
  if (d.includes('180') || d.includes('left'))    return 180;
  if (d.includes('perpendicular') || d.includes('normal')) return 270 - inclineAngleDeg;
  if (d.includes('parallel') || d.includes('along'))       return 360 - inclineAngleDeg;
  if (d.includes('friction')) return inclineAngleDeg > 0 ? 360 - inclineAngleDeg : 180;
  const match = d.match(/(\d+)\s*°/);
  if (match) return parseFloat(match[1]);
  // Default by force type
  const type = force.type || '';
  if (type === 'gravity')   return 90;
  if (type === 'normal')    return 270 - inclineAngleDeg;
  if (type === 'friction')  return inclineAngleDeg > 0 ? 360 - inclineAngleDeg : 180;
  if (type === 'tension')   return 270;
  return 0;
}

function forceColor(type) {
  if (type === 'normal')   return COLORS.normalForce;
  if (type === 'friction') return COLORS.friction;
  if (type === 'tension')  return COLORS.tension;
  if (type === 'spring_force') return COLORS.springColor;
  return COLORS.forceArrow;
}

function forceMarker(type) {
  if (type === 'normal')   return 'arrow-green';
  if (type === 'friction') return 'arrow-amber';
  if (type === 'tension')  return 'arrow-violet';
  if (type === 'spring_force') return 'arrow-cyan';
  return 'arrow-red';
}

// ── C2: CIRCUITS ─────────────────────────────────────────────────────────────

export function layoutCircuit(sceneGraph) {
  const els = [];
  const components = sceneGraph.components || [];
  const nodes      = sceneGraph.nodes      || [];
  const topology   = sceneGraph.topology   || 'series';

  // Build component list, deduce layout topology
  const isSeries   = topology === 'series'   || components.every(c => !c.position_hint || c.position_hint === 'left' || c.position_hint === 'center' || c.position_hint === 'right');
  const isParallel = topology === 'parallel' || components.some(c => c.position_hint === 'top' || c.position_hint === 'bottom');

  // Group by parallel branches if any
  const topComps    = components.filter(c => c.position_hint === 'top' || (!c.position_hint && topology !== 'parallel'));
  const bottomComps = components.filter(c => c.position_hint === 'bottom');

  const W = 340, startX = 30, topY = 90, bottomY = 170;
  const centerY = (topY + bottomY) / 2;

  // Determine how to route the circuit
  if (topology === 'parallel' || bottomComps.length > 0) {
    // Parallel rail layout
    const allTop = topComps.length > 0 ? topComps : components.filter(c => c.type !== 'ground');
    const n = allTop.length;
    const step = n > 0 ? W / (n + 1) : W;

    // Top rail
    els.push(rigidLink(startX, topY, startX + W, topY, COLORS.wire, 1.5));
    // Bottom rail
    els.push(rigidLink(startX, bottomY, startX + W, bottomY, COLORS.wire, 1.5));

    allTop.forEach((comp, i) => {
      const x = startX + (i + 1) * step;
      placeComponent(els, comp, x, centerY, 'vertical');
      // Vertical connectors
      els.push(rigidLink(x, topY, x, centerY - 16, COLORS.wire, 1.5));
      els.push(rigidLink(x, centerY + 16, x, bottomY, COLORS.wire, 1.5));
    });

    if (bottomComps.length > 0) {
      bottomComps.forEach((comp, i) => {
        const x = startX + (i + 1) * (W / (bottomComps.length + 1));
        placeComponent(els, comp, x, bottomY + 26, 'horizontal');
      });
    }

    // Ground
    const gnd = components.find(c => c.type === 'ground');
    if (gnd) els.push(renderGround(startX + W / 2, bottomY + 6));

  } else {
    // Series layout — components spaced along top wire
    const nonGnd = components.filter(c => c.type !== 'ground' && c.type !== 'node');
    const gndComp = components.find(c => c.type === 'ground');
    const n = nonGnd.length;
    const step = n > 0 ? W / (n + 1) : W / 2;

    let prevX = startX;
    nonGnd.forEach((comp, i) => {
      const x = startX + (i + 1) * step;
      els.push(rigidLink(prevX, topY, x - componentWidth(comp) / 2, topY, COLORS.wire, 1.5));
      placeComponent(els, comp, x, topY, 'horizontal');
      prevX = x + componentWidth(comp) / 2;
    });
    els.push(rigidLink(prevX, topY, startX + W, topY, COLORS.wire, 1.5));

    // Return path (bottom wire)
    els.push(rigidLink(startX, topY, startX, bottomY, COLORS.wire, 1.5));
    els.push(rigidLink(startX + W, topY, startX + W, bottomY, COLORS.wire, 1.5));
    els.push(rigidLink(startX, bottomY, startX + W, bottomY, COLORS.wire, 1.5));

    if (gndComp) els.push(renderGround(startX + W / 2, bottomY + 6));
  }

  // Node voltage labels
  nodes.forEach(nd => {
    const x = sceneX(nd.position_hint, 200), y = topY - 16;
    els.push(circle(x, y, 3, COLORS.normalForce, COLORS.normalForce));
    if (nd.voltage && nd.voltage !== 'unknown') els.push(labelText(x, y - 7, nd.voltage, 8, COLORS.normalForce));
  });

  return els;
}

function componentWidth(comp) {
  if (comp.type === 'voltage_source' || comp.type === 'current_source' || comp.type === 'ac_source') return 30;
  if (comp.type === 'capacitor') return 14;
  if (comp.type === 'ground') return 0;
  return 38; // resistor, inductor
}

function placeComponent(els, comp, cx, cy, orientation = 'horizontal') {
  const v = comp.value || '';
  switch (comp.type) {
    case 'resistor':       els.push(renderResistor(cx, cy, v)); break;
    case 'capacitor':      els.push(renderCapacitor(cx, cy, v)); break;
    case 'inductor':       els.push(renderInductor(cx, cy, v)); break;
    case 'voltage_source': els.push(renderVoltageSource(cx, cy, v)); break;
    case 'ac_source':      els.push(renderACSource(cx, cy, v)); break;
    case 'current_source': els.push(renderCurrentSource(cx, cy, v)); break;
    case 'diode':          els.push(renderDiode(cx, cy, v, comp.subtype || 'normal')); break;
    case 'zener':          els.push(renderDiode(cx, cy, v, 'zener')); break;
    case 'led':            els.push(renderDiode(cx, cy, v, 'led')); break;
    case 'npn':            els.push(renderNPN(cx, cy, comp.id)); break;
    case 'pnp':            els.push(renderPNP(cx, cy, comp.id)); break;
    case 'nmos':           els.push(renderNMOS(cx, cy, comp.id)); break;
    case 'pmos':           els.push(renderPMOS(cx, cy, comp.id)); break;
    case 'op_amp':         els.push(renderOpAmp(cx, cy, v)); break;
    case 'transformer':    els.push(renderTransformer(cx, cy, v)); break;
    case 'switch':         els.push(renderSwitch(cx, cy, comp.closed)); break;
    case 'scr':            els.push(renderSCR(cx, cy, comp.id)); break;
    case 'triac':          els.push(renderTRIAC(cx, cy, comp.id)); break;
    case 'crystal':        els.push(renderCrystal(cx, cy, v)); break;
    case 'varistor':       els.push(renderVaristor(cx, cy, v)); break;
    case 'thermistor':     els.push(renderThermistor(cx, cy, comp.subtype || 'NTC')); break;
    case 'hall_sensor':    els.push(renderHallSensor(cx, cy)); break;
    case 'optocoupler':    els.push(renderOptocoupler(cx, cy)); break;
    case '555_timer':      els.push(render555Timer(cx, cy, comp.mode || 'astable')); break;
    case 'pll':            els.push(renderPLL(cx, cy)); break;
    case 'logic_gate':     els.push(renderLogicGate(cx, cy, comp.gate || 'AND')); break;
    case 'flip_flop':      els.push(renderFlipFlop(cx, cy, comp.subtype || 'D')); break;
    case 'emi_filter':     els.push(renderEMIFilter(cx, cy)); break;
    case 'snubber':        els.push(renderSnubber(cx, cy)); break;
    case 'gate_driver':    els.push(renderGateDriver(cx, cy)); break;
    case 'charge_pump':    els.push(renderChargePump(cx, cy)); break;
    case 'rf_mixer':       els.push(renderRFMixer(cx, cy)); break;
    case 'phototransistor':els.push(renderPhototransistor(cx, cy)); break;
    case 'ground':         els.push(renderGround(cx, cy)); break;
    default:
      els.push(labeledShape(cx, cy, 36, 24, comp.id || comp.type, '', COLORS.componentFill, COLORS.componentBorder, 1.5, 8));
  }
}

// ── C3: STRUCTURAL ────────────────────────────────────────────────────────────

export function layoutStructural(sceneGraph) {
  const els = [];
  const { beam, supports = [], loads = [], members = [], nodes: trussNodes = [], columns = [], cross_section } = sceneGraph;

  // ── Truss (requires actual member/node data) ───────────────────────────────
  if (members.length > 0 ||
      (trussNodes.length > 0 && (sceneGraph.diagram_intent || '').toLowerCase().includes('truss'))) {
    const nodeMap = {};
    trussNodes.forEach(n => {
      const x = sceneX(n.position_hint, n.x ? n.x * 3 + 30 : 200);
      const y = n.y ? 220 - n.y * 3 : (n.type === 'top' ? 130 : 210);
      nodeMap[n.id] = { x, y };
    });
    members.forEach(m => {
      const n1 = nodeMap[m.from] || { x: 60, y: 210 };
      const n2 = nodeMap[m.to]   || { x: 340, y: 210 };
      els.push(renderTrussMember(n1.x, n1.y, n2.x, n2.y, m.force_type || 'neutral', m.force || ''));
    });
    Object.values(nodeMap).forEach((n, i) => {
      const nd = trussNodes[i];
      els.push(renderTrussNode(n.x, n.y, nd.id));
      if (nd.support === 'pinned') els.push(renderPinnedSupport(n.x, n.y));
      if (nd.support === 'roller') els.push(renderRollerSupport(n.x, n.y));
    });
    return els;
  }

  // ── Column ────────────────────────────────────────────────────────────────
  if (columns.length > 0 || sceneGraph.diagram_intent?.includes('column') || sceneGraph.diagram_intent?.includes('buckling')) {
    const col = columns[0] || {};
    els.push(renderColumn(200, 50, 160, loads[0]?.magnitude || '', col.end_conditions || 'pinned-pinned'));
    return els;
  }

  // ── Mohr's Circle ──────────────────────────────────────────────────────────
  const mohrIntent = (sceneGraph.diagram_intent || '').toLowerCase();
  if (mohrIntent.includes('mohr') || sceneGraph.sigma1 || sceneGraph.sigma2) {
    els.push(renderMohrsCircle(200, 130, 50,
      sceneGraph.sigma1 || 'σ₁',
      sceneGraph.sigma2 || 'σ₂',
      sceneGraph.tau    || 'τ'));
    els.push(labelText(200, 16, "Mohr's Circle", 9, COLORS.textDim));
    return els;
  }

  // ── Cross-section ─────────────────────────────────────────────────────────
  const csIntent = (sceneGraph.diagram_intent || '').toLowerCase();
  if (cross_section || csIntent.includes('cross-section') || csIntent.includes('cross_section')) {
    const cs = cross_section || {};
    els.push(renderCrossSection(200, 130, cs.type || 'I', cs.width || 40, cs.height || 60));
    return els;
  }

  // ── FEA mesh ──────────────────────────────────────────────────────────────
  const feaIntent = (sceneGraph.diagram_intent || '').toLowerCase();
  if (feaIntent.includes('fea mesh') || feaIntent.includes('mesh') || feaIntent.includes('contour')) {
    // Generic FEA mesh grid on a rectangle
    const mx0 = 60, my0 = 60, mw = 280, mh = 140;
    const cols = 7, rows = 4;
    for (let r = 0; r <= rows; r++) {
      els.push(rigidLink(mx0, my0 + r * mh / rows, mx0 + mw, my0 + r * mh / rows, COLORS.textDim, 0.8));
    }
    for (let c = 0; c <= cols; c++) {
      els.push(rigidLink(mx0 + c * mw / cols, my0, mx0 + c * mw / cols, my0 + mh, COLORS.textDim, 0.8));
    }
    // Diagonal mesh lines for triangular elements
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        els.push(rigidLink(
          mx0 + c * mw / cols, my0 + r * mh / rows,
          mx0 + (c + 1) * mw / cols, my0 + (r + 1) * mh / rows,
          COLORS.textDim, 0.5));
      }
    }
    // Colour gradient overlay to suggest stress contours
    const colours = ['rgba(59,130,246,0.15)', 'rgba(16,185,129,0.15)', 'rgba(245,158,11,0.15)', 'rgba(239,68,68,0.15)'];
    for (let c = 0; c < cols; c++) {
      els.push(`<rect x="${mx0 + c * mw / cols}" y="${my0}" width="${mw / cols}" height="${mh}" fill="${colours[Math.min(Math.floor(c / cols * 4), 3)]}" stroke="none"/>`);
    }
    els.push(labelText(200, my0 - 10, feaIntent.includes('contour') ? 'FEA Stress Contours' : 'FEA Mesh', 9, COLORS.textDim));
    return els;
  }

  // ── Beam ─────────────────────────────────────────────────────────────────
  if (!beam) return els;

  const beamY = 140;
  const leftX = 50, rightX = 350;
  const beamSpan = rightX - leftX;

  // Draw beam
  els.push(renderBeam(leftX, rightX, beamY));

  // Supports
  supports.forEach(sup => {
    let x = leftX;
    if (sup.position === 'right')   x = rightX;
    else if (sup.position === 'center') x = (leftX + rightX) / 2;
    else if (typeof sup.position === 'number') x = leftX + sup.position * beamSpan;

    if (sup.type === 'pinned')  els.push(renderPinnedSupport(x, beamY + 6));
    if (sup.type === 'roller')  els.push(renderRollerSupport(x, beamY + 6));
    if (sup.type === 'fixed')   els.push(renderFixedSupport(x, beamY, sup.position === 'right' ? 'right' : 'left'));
    if (sup.reaction) els.push(renderPointLoad(x, beamY, 'up', sup.reaction, COLORS.reactionArrow));
  });

  // Loads
  loads.forEach(load => {
    let x = (leftX + rightX) / 2;
    if (load.position === 'left')    x = leftX;
    else if (load.position === 'right') x = rightX;
    else if (load.position === 'center' || load.position === 'midspan') x = (leftX + rightX) / 2;
    else if (typeof load.position === 'string' && load.position.includes('from left')) {
      const frac = parseFloat(load.position) / 10 || 0.3;
      x = leftX + frac * beamSpan;
    }

    const dir = load.direction || 'down';
    if (load.type === 'point')       els.push(renderPointLoad(x, beamY, dir, load.magnitude));
    if (load.type === 'distributed') els.push(renderUDL(leftX, rightX, beamY, load.magnitude, dir));
    if (load.type === 'triangular')  els.push(renderTriangularLoad(leftX, rightX, beamY, load.magnitude));
    if (load.type === 'moment')      els.push(renderMoment(x, beamY, load.magnitude, load.clockwise !== false));
  });

  return els;
}

// ── C4: FLUIDS ────────────────────────────────────────────────────────────────

export function layoutFluids(sceneGraph) {
  const els = [];
  const { pipe_segments = [], components = [], flow = {}, diagram_intent = '' } = sceneGraph;

  const intent = diagram_intent.toLowerCase();
  const pipeY = 130;
  const diam  = 18;

  // ── Manometer ─────────────────────────────────────────────────────────────
  if (intent.includes('manometer')) {
    els.push(renderManometer(200, 100, 20, 38));
    return els;
  }

  // ── Orifice plate ─────────────────────────────────────────────────────────
  if (intent.includes('orifice')) {
    els.push(renderPipe(30, 180, pipeY, diam));
    els.push(renderOrificePlate(180, pipeY, diam / 2 + 2, diam / 2 - 4));
    els.push(renderPipe(180, 370, pipeY, diam));
    els.push(renderFlowArrow(80, pipeY - 22, 0, 'v₁'));
    els.push(renderFlowArrow(280, pipeY - 22, 0, 'v₂'));
    return els;
  }

  // ── Venturi ────────────────────────────────────────────────────────────────
  if (intent.includes('venturi')) {
    els.push(renderVenturi(200, pipeY));
    return els;
  }

  // ── Boundary layer ─────────────────────────────────────────────────────────
  if (intent.includes('boundary layer')) {
    els.push(renderBoundaryLayer(30, 200, 320, 60));
    return els;
  }

  // ── Hydraulic jump ─────────────────────────────────────────────────────────
  if (intent.includes('hydraulic jump')) {
    els.push(renderHydraulicJump(200, 160, 16, 36));
    return els;
  }

  // ── Airfoil (lift/drag) ────────────────────────────────────────────────────
  if (intent.includes('airfoil') || intent.includes('lift') || intent.includes('drag')) {
    const aoa = parseFloat(flow.angle_of_attack) || 5;
    els.push(renderAirfoil(200, 130, 160, aoa));
    // Lift and drag vectors
    els.push(vectorFromPoint(200, 130, 270, 40, COLORS.normalForce, 'arrow-green', 'L'));
    els.push(vectorFromPoint(200, 130, 0,   30, COLORS.forceArrow,  'arrow-red',   'D'));
    return els;
  }

  // ── Centrifugal pump cross-section ────────────────────────────────────────
  if (intent.includes('impeller') || intent.includes('centrifugal pump')) {
    els.push(renderImpeller(200, 130));
    return els;
  }

  // ── Pipe system ────────────────────────────────────────────────────────────
  const hasExpansion   = components.some(c => c.type === 'expansion');
  const hasContraction = components.some(c => c.type === 'contraction');
  const hasPump        = components.some(c => c.type === 'pump');
  const hasValve       = components.some(c => c.type === 'valve');

  // Place pipe segments end-to-end
  let curX = 30;
  if (pipe_segments.length === 0) {
    // Default single pipe
    els.push(renderPipe(30, 370, pipeY, diam));
    els.push(renderFlowArrow(200, pipeY, 0, flow.velocity || ''));
    if (flow.inlet_pressure)  els.push(labelText(40,  pipeY - 14, `P₁=${flow.inlet_pressure}`,  8, COLORS.textDim));
    if (flow.outlet_pressure) els.push(labelText(350, pipeY - 14, `P₂=${flow.outlet_pressure}`, 8, COLORS.textDim));
  } else {
    const segW = 340 / pipe_segments.length;
    pipe_segments.forEach((seg, i) => {
      const d = parseFloat(seg.diameter) * 1.5 || diam;
      els.push(renderPipe(curX, curX + segW, pipeY, Math.min(d, 30)));
      els.push(labelText(curX + segW / 2, pipeY + d / 2 + 10, `D=${seg.diameter}`, 7, COLORS.textDim));
      curX += segW;
    });
  }

  // Place components
  let cxPos = 120;
  components.forEach(comp => {
    const cx = comp.position_hint === 'inlet' ? 70 : comp.position_hint === 'outlet' ? 320 : cxPos;
    if (comp.type === 'pump')        els.push(renderPump(cx, pipeY, comp.value || 'P'));
    else if (comp.type === 'valve' || comp.type === 'gate_valve') els.push(renderValve(cx, pipeY, 'gate', comp.value || ''));
    else if (comp.type === 'check')  els.push(renderValve(cx, pipeY, 'check', ''));
    else if (comp.type === 'butterfly') els.push(renderValve(cx, pipeY, 'butterfly', ''));
    else if (comp.type === 'expansion')   els.push(renderExpansion(cx, pipeY, 8, 16));
    else if (comp.type === 'contraction') els.push(renderContraction(cx, pipeY, 16, 8));
    else if (comp.type === 'elbow') {
      // 90° elbow — vertical section
      els.push(rigidLink(cx, pipeY - 9, cx, pipeY - 50, COLORS.componentBorder, 1.5));
      els.push(rigidLink(cx, pipeY + 9, cx, pipeY + 50, COLORS.componentBorder, 1.5));
      els.push(labelText(cx, pipeY - 54, 'Elbow', 7, COLORS.textDim));
    }
    else els.push(labeledShape(cx, pipeY, 36, 22, comp.type, comp.value || '', COLORS.componentFill, COLORS.componentBorder, 1.5, 8));
    cxPos += 90;
  });

  // Velocity profile if laminar/turbulent in intent
  if (intent.includes('velocity profile') || intent.includes('laminar') || intent.includes('turbulent')) {
    els.push(renderVelocityProfile(40, pipeY, diam));
  }

  return els;
}

// ── C5: SEMICONDUCTORS ────────────────────────────────────────────────────────

export function layoutSemiconductors(sceneGraph) {
  const els = [];
  const intent = (sceneGraph.diagram_intent || '').toLowerCase();
  const sg = sceneGraph;

  if (intent.includes('nmos') || intent.includes('n-channel') || intent.includes('nmosfet')) {
    els.push(renderMOSFETCrossSection(200, 120, 'nmos'));
  } else if (intent.includes('pmos') || intent.includes('p-channel') || intent.includes('pmosfet')) {
    els.push(renderMOSFETCrossSection(200, 120, 'pmos'));
  } else if (intent.includes('finfet') || intent.includes('fin')) {
    els.push(renderFinFET(200, 130));
  } else if (intent.includes('bjt') || intent.includes('bipolar') || intent.includes('npn') || intent.includes('pnp')) {
    els.push(renderBJTCrossSection(200, 130));
  } else if (intent.includes('quantum well') || intent.includes('hetero')) {
    els.push(renderHeterojunctionBands(200, 130));
    if (intent.includes('quantum')) els.push(renderQuantumWell(200, 130));
  } else if (intent.includes('pn junction') || intent.includes('diode') || intent.includes('junction')) {
    const dtype = intent.includes('zener') ? 'zener' : intent.includes('schottky') ? 'schottky' : 'pn';
    els.push(renderPNJunction(200, 130, dtype));
  } else if (intent.includes('dram')) {
    els.push(renderDRAMCell(200, 130));
  } else if (intent.includes('flash') || intent.includes('floating gate')) {
    els.push(renderFlashCell(200, 130));
  } else if (intent.includes('mems')) {
    els.push(renderMEMSDiaphragm(200, 130));
  } else if (intent.includes('tcad mesh') || intent.includes('mesh')) {
    // Generic FEA mesh on MOSFET
    els.push(renderMOSFETCrossSection(200, 110, 'nmos'));
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 8; c++) {
        els.push(rigidLink(70 + c * 20, 50 + r * 16, 90 + c * 20, 50 + r * 16, COLORS.textDim, 0.5));
        els.push(rigidLink(70 + c * 20, 50 + r * 16, 70 + c * 20, 66 + r * 16, COLORS.textDim, 0.5));
      }
    }
  } else {
    // Default: show MOSFET cross-section
    els.push(renderMOSFETCrossSection(200, 120, 'nmos'));
  }

  return els;
}

// ── C6: AEROSPACE ─────────────────────────────────────────────────────────────

export function layoutAerospace(sceneGraph) {
  const els = [];
  const intent = (sceneGraph.diagram_intent || '').toLowerCase();

  if (intent.includes('airfoil') || intent.includes('naca') || intent.includes('rae')) {
    const aoa = parseFloat(sceneGraph.angle_of_attack) || 0;
    els.push(renderAirfoil(200, 130, 180, aoa));
  } else if (intent.includes('turbojet')) {
    els.push(renderTurbojet(200, 130));
  } else if (intent.includes('turbofan')) {
    els.push(renderTurbofan(200, 130));
  } else if (intent.includes('rocket')) {
    els.push(renderRocketEngine(200, 130));
  } else if (intent.includes('satellite') && intent.includes('orbit') || intent.includes('hohmann')) {
    els.push(renderHohmannTransfer(200, 130));
    els.push(renderSatellite(295, 75));
  } else if (intent.includes('satellite')) {
    els.push(renderSatellite(200, 130));
    els.push(renderOrbit(200, 130, 80, 'orbit'));
  } else if (intent.includes('wing planform') || intent.includes('wing plan')) {
    const type = intent.includes('delta') ? 'delta' : intent.includes('swept') ? 'swept' : intent.includes('taper') ? 'tapered' : intent.includes('ellip') ? 'elliptical' : 'rectangular';
    els.push(renderWingPlanform(200, 130, type));
  } else if (intent.includes('boundary layer')) {
    els.push(renderBoundaryLayer(30, 200, 320, 60));
  } else if (intent.includes('wing') || intent.includes('lift') || intent.includes('drag')) {
    els.push(renderAirfoil(200, 130, 180, 8));
    els.push(vectorFromPoint(200, 130, 270, 50, COLORS.normalForce, 'arrow-green', 'L'));
    els.push(vectorFromPoint(200, 130, 0, 36, COLORS.forceArrow, 'arrow-red', 'D'));
    els.push(vectorFromPoint(200, 130, 90, 36, COLORS.forceArrow, 'arrow-red', 'W'));
  } else if (intent.includes('turboprop')) {
    els.push(renderTurbojet(200, 130));
    els.push(renderWheel(110, 130, 24, '')); // propeller
    els.push(labelText(200, 20, 'Turboprop', 9, COLORS.textDim));
  } else if (intent.includes('ramjet') || intent.includes('scramjet')) {
    els.push(labeledShape(200, 130, 200, 60, intent.includes('scram') ? 'SCRAMJET' : 'RAMJET', 'No moving parts', COLORS.componentFill, COLORS.componentBorder, 2, 10));
    els.push(renderFlame(200, 130, 30, 'Combustion'));
  } else {
    // Generic aircraft forces
    els.push(renderAirfoil(200, 130, 160, 5));
    els.push(vectorFromPoint(200, 130, 270, 44, COLORS.normalForce, 'arrow-green', 'L'));
    els.push(vectorFromPoint(200, 130,  90, 30, COLORS.forceArrow, 'arrow-red', 'W'));
    els.push(vectorFromPoint(200, 130,   0, 30, COLORS.forceArrow, 'arrow-red', 'T'));
    els.push(vectorFromPoint(200, 130, 180, 30, COLORS.friction, 'arrow-amber', 'D'));
  }

  return els;
}

// ── C7: THERMAL ──────────────────────────────────────────────────────────────

export function layoutThermal(sceneGraph) {
  const els = [];
  const intent = (sceneGraph.diagram_intent || '').toLowerCase();
  const sg = sceneGraph;

  if (intent.includes('composite wall') || intent.includes('conduction') && intent.includes('wall')) {
    const layers = sg.layers || [
      { label: 'Layer 1', color: 'rgba(239,68,68,0.2)', w: 40 },
      { label: 'Layer 2', color: 'rgba(59,130,246,0.2)', w: 40 },
    ];
    els.push(renderCompositeWall(200, 130, layers));
  } else if (intent.includes('fin')) {
    els.push(renderFin(60, 130, 260, 16, 'T_fin(x)'));
    els.push(groundHatch(60, 140, 10));
    els.push(rigidLink(60, 122, 60, 138, COLORS.ground, 3));
    els.push(labelText(60, 110, 'T_base', 8, COLORS.hot));
    els.push(labelText(320, 110, 'T_tip', 8, COLORS.cold));
    // Convection arrows
    for (let i = 1; i <= 5; i++) {
      els.push(vectorFromPoint(60 + i * 40, 122, 270, 16, COLORS.cold, 'arrow-cold', i === 3 ? 'h·A' : ''));
    }
  } else if (intent.includes('heat exchanger')) {
    const type = intent.includes('counter') ? 'counter' : 'parallel';
    els.push(renderHeatExchanger(200, 130, type));
  } else if (intent.includes('heat pipe')) {
    els.push(renderHeatPipe(200, 130));
  } else if (intent.includes('thermoelectric') || intent.includes('peltier') || intent.includes('tec')) {
    const mode = intent.includes('generator') || intent.includes('teg') ? 'generator' : 'cooler';
    els.push(renderThermoelectric(200, 130, mode));
  } else if (intent.includes('refrigerat') || intent.includes('hvac') || intent.includes('cycle')) {
    els.push(renderRefrigCycle(200, 130));
  } else if (intent.includes('boiling') || intent.includes('nucleat')) {
    els.push(renderBoilingCurve(200, 130));
  } else if (intent.includes('cooling tower')) {
    els.push(renderCoolingTower(200, 130));
  } else if (intent.includes('flame') || intent.includes('combustion') || intent.includes('burner')) {
    els.push(renderFlame(200, 160, 60, 'Flame'));
    els.push(groundHatch(200, 200, 80));
    els.push(rigidLink(160, 200, 240, 200, COLORS.ground, 2));
    els.push(labelText(200, 220, 'Burner', 8, COLORS.textDim));
  } else if (intent.includes('boundary layer')) {
    els.push(renderBoundaryLayer(30, 200, 320, 60));
  } else {
    // Default: plane wall with heat flux arrows
    els.push(renderCompositeWall(200, 130, [
      { label: 'Wall', color: 'rgba(59,130,246,0.2)', w: 60 },
    ]));
  }

  return els;
}

// ── C8: CONTROL SYSTEMS ───────────────────────────────────────────────────────

export function layoutControl(sceneGraph) {
  const els = [];
  const intent = (sceneGraph.diagram_intent || '').toLowerCase();
  const sg = sceneGraph;

  if (intent.includes('closed-loop') || intent.includes('closed loop') || intent.includes('feedback')) {
    els.push(renderClosedLoop(200, 130));
    // Add PID if mentioned
    if (intent.includes('pid')) {
      els.push(renderPID(130, 130));
    }
  } else if (intent.includes('bode')) {
    els.push(renderBodePlot(200, 110));
  } else if (intent.includes('nyquist')) {
    els.push(renderNyquistPlot(200, 130));
  } else if (intent.includes('root locus')) {
    const poles = sg.poles || [{ x: -1, y: 0 }, { x: -2, y: 1 }, { x: -2, y: -1 }];
    els.push(renderRootLocus(200, 130, poles));
  } else if (intent.includes('pole-zero') || intent.includes('pole zero')) {
    const poles = sg.poles || [{ x: -1, y: 1 }, { x: -1, y: -1 }];
    const zeros = sg.zeros || [{ x: 0, y: 0 }];
    els.push(renderPoleZeroPlot(200, 130, poles, zeros));
  } else if (intent.includes('pid')) {
    els.push(renderPID(200, 130));
    els.push(renderSignalArrow(110, 130, 165, 130, 'e(t)'));
    els.push(renderSignalArrow(235, 130, 290, 130, 'u(t)'));
  } else if (intent.includes('plc')) {
    els.push(renderPLC(200, 130));
  } else if (intent.includes('scada') || intent.includes('dcs') || intent.includes('hmi')) {
    els.push(renderSCADA(200, 130));
  } else if (intent.includes('servo')) {
    els.push(renderServoSystem(200, 130));
  } else if (intent.includes('encoder')) {
    els.push(renderEncoder(200, 130));
  } else if (intent.includes('lvdt')) {
    els.push(renderLVDT(200, 130));
  } else if (intent.includes('vfd') || intent.includes('variable frequency')) {
    els.push(renderVFD(200, 130));
  } else if (intent.includes('pll')) {
    els.push(renderPLL(200, 130));
  } else {
    // Generic block diagram
    const blocks = sg.blocks || [
      { label: 'G(s)', sublabel: 'Plant' },
    ];
    const n = blocks.length;
    const spacing = Math.min(100, 280 / (n + 1));
    let x = 80;
    // Sum junction
    els.push(renderSumJunction(x, 130, ['+', '−']));
    x += 40;
    blocks.forEach(b => {
      els.push(renderSignalArrow(x, 130, x + 20, 130));
      x += 20;
      els.push(renderControlBlock(x + 30, 130, b.label || 'G(s)', b.sublabel || ''));
      x += 80;
    });
    els.push(renderSignalArrow(x, 130, x + 30, 130, 'y'));
    // Feedback
    els.push(rigidLink(x + 30, 130, x + 30, 180, COLORS.wire, 1.5));
    els.push(rigidLink(80, 180, x + 30, 180, COLORS.wire, 1.5));
    els.push(rigidLink(80, 180, 80, 142, COLORS.wire, 1.5, 'arrow-white'));
  }

  return els;
}

// ── C9: MATERIALS ─────────────────────────────────────────────────────────────

export function layoutMaterials(sceneGraph) {
  const els = [];
  const intent = (sceneGraph.diagram_intent || '').toLowerCase();

  if (intent.includes('bcc')) {
    els.push(renderBCC(200, 130));
  } else if (intent.includes('fcc')) {
    els.push(renderFCC(200, 130));
  } else if (intent.includes('hcp') || intent.includes('hexagonal')) {
    // HCP: two hexagonal layers
    const hexCenters = [[0,0],[24,0],[-12,20],[12,20],[0,40],[24,40]];
    hexCenters.forEach(([dx, dy]) => els.push(circle(200 + dx, 130 + dy - 20, 8, COLORS.componentBorder, COLORS.componentBorder, 2)));
    els.push(circle(200 + 12, 130, 8, COLORS.forceArrow, COLORS.forceArrow, 2));
    els.push(labelText(200, 170, 'HCP', 9, COLORS.textDim));
  } else if (intent.includes('grain boundary') || intent.includes('grain')) {
    els.push(renderGrainBoundary(200, 130));
  } else if (intent.includes('phase diagram') || intent.includes('eutectic') || intent.includes('binary')) {
    els.push(renderPhaseDiagram(200, 130));
  } else if (intent.includes('stress-strain') || intent.includes('stress strain') || intent.includes('tensile test')) {
    els.push(renderStressStrain(200, 130));
  } else if (intent.includes('dislocation')) {
    els.push(renderDislocation(200, 130));
  } else if (intent.includes('mohr') || intent.includes("mohr's")) {
    els.push(renderMohrsCircle(200, 130, 50, 'σ₁', 'σ₂', 'τ_max'));
    els.push(labelText(200, 16, "Mohr's Circle", 9, COLORS.textDim));
  } else if (intent.includes('xrd')) {
    els.push(renderXRD(200, 130));
  } else if (intent.includes('sem') || intent.includes('electron microscop')) {
    els.push(renderSEM(200, 130));
  } else if (intent.includes('tensile machine') || intent.includes('tensile test machine')) {
    els.push(renderTensileMachine(200, 130));
  } else if (intent.includes('charpy') || intent.includes('impact test')) {
    els.push(renderCharpy(200, 130));
  } else if (intent.includes('composite') || intent.includes('laminate') || intent.includes('layup')) {
    // Laminate layup
    const angles = [0, 45, 90, -45, 0];
    angles.forEach((a, i) => {
      els.push(`<rect x="80" y="${90 + i * 14}" width="240" height="12" fill="${['rgba(59,130,246,0.3)','rgba(239,68,68,0.3)','rgba(16,185,129,0.3)','rgba(245,158,11,0.3)','rgba(139,92,246,0.3)'][i]}" stroke="${COLORS.componentBorder}" stroke-width="1"/>`);
      els.push(labelText(336, 96 + i * 14, `${a}°`, 8, COLORS.textDim, 'start'));
    });
    els.push(labelText(200, 80, 'Composite Laminate', 9, COLORS.textDim));
  } else {
    // Default: grain boundary
    els.push(renderGrainBoundary(200, 130));
  }

  return els;
}

// ── C10: POWER & ENERGY ───────────────────────────────────────────────────────

export function layoutPower(sceneGraph) {
  const els = [];
  const intent = (sceneGraph.diagram_intent || '').toLowerCase();

  if (intent.includes('transformer') || intent.includes('delta') || intent.includes('wye')) {
    const connection = intent.includes('delta-wye') ? 'delta-wye' :
                       intent.includes('wye-delta') ? 'wye-delta' :
                       intent.includes('delta-delta') ? 'delta-delta' :
                       intent.includes('wye-wye') ? 'wye-wye' : 'delta-wye';
    els.push(renderThreePhaseTransformer(200, 120, connection));
  } else if (intent.includes('induction motor') || intent.includes('ac motor')) {
    els.push(renderInductionMotor(200, 120));
  } else if (intent.includes('synchronous generator') || intent.includes('sync gen')) {
    els.push(renderSyncGenerator(200, 120));
  } else if (intent.includes('dc motor') || intent.includes('dc machine')) {
    els.push(renderDCMotor(200, 120));
  } else if (intent.includes('transmission tower') || intent.includes('overhead line')) {
    els.push(renderTransmissionTower(200, 100));
  } else if (intent.includes('circuit breaker') || intent.includes('breaker') || intent.includes('switchgear')) {
    els.push(renderSwitchgear(200, 110));
  } else if (intent.includes('current transformer') || intent.includes(' ct ')) {
    els.push(renderCT(200, 130));
  } else if (intent.includes('statcom') || intent.includes('facts') || intent.includes('svc')) {
    els.push(renderSTATCOM(200, 130));
  } else if (intent.includes('solar') || intent.includes('pv')) {
    els.push(renderSolarPanel(200, 110));
  } else if (intent.includes('wind turbine')) {
    els.push(renderWindTurbine(200, 100));
  } else if (intent.includes('battery') || intent.includes('li-ion') || intent.includes('lead-acid')) {
    const type = intent.includes('li-ion') ? 'Li-ion' : intent.includes('lead') ? 'Lead-Acid' : 'Battery';
    els.push(renderBattery(200, 130, type));
  } else if (intent.includes('hydro') && !intent.includes('hydraulic')) {
    els.push(renderHydropower(200, 130));
  } else if (intent.includes('francis')) {
    els.push(renderFrancisTurbine(200, 130));
  } else if (intent.includes('nuclear') || intent.includes('reactor')) {
    els.push(renderNuclearReactor(200, 120));
  } else if (intent.includes('ups')) {
    const type = intent.includes('online') ? 'online' : 'offline';
    els.push(renderUPS(200, 130, type));
  } else if (intent.includes('rectifier') || intent.includes('converter') || intent.includes('inverter')) {
    // Generic power electronics block
    els.push(renderClosedLoop(200, 130));
    els.push(labelText(200, 20, intent.includes('rectifier') ? 'Rectifier System' : 'Power Converter', 9, COLORS.textDim));
  } else if (intent.includes('single line') || intent.includes('power flow') || intent.includes('fault')) {
    // Single line diagram
    els.push(renderThreePhaseTransformer(130, 130, 'delta-wye'));
    els.push(rigidLink(196, 130, 240, 130, COLORS.phaseA, 3));
    els.push(renderSwitchgear(310, 110));
    els.push(labelText(200, 20, 'Single Line Diagram', 9, COLORS.textDim));
  } else {
    // Default: induction motor
    els.push(renderInductionMotor(200, 120));
  }

  return els;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION D — MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * renderSceneGraph(sceneGraph, domain) → SVG string
 *
 * @param {object} sceneGraph — populated by Stage 1 (LLM)
 * @param {string} domain     — 'Physics'|'Circuits'|'Structural'|'Fluids'|
 *                              'Semiconductors'|'Aerospace'|'Thermal'|
 *                              'Control'|'Materials'|'Power'
 * @returns {string}          — full SVG markup
 */
export function renderSceneGraph(sceneGraph, domain) {
  // Runtime assertion: sceneGraph must be an object
  if (!sceneGraph || typeof sceneGraph !== 'object') {
    throw new Error(`[svgLayoutEngine] renderSceneGraph: sceneGraph must be an object, got ${typeof sceneGraph}`);
  }

  let elements = [];

  switch (domain) {
    case 'Physics':        elements = layoutPhysics(sceneGraph);       break;
    case 'Circuits':       elements = layoutCircuit(sceneGraph);        break;
    case 'Structural':     elements = layoutStructural(sceneGraph);     break;
    case 'Fluids':         elements = layoutFluids(sceneGraph);         break;
    case 'Semiconductors': elements = layoutSemiconductors(sceneGraph); break;
    case 'Aerospace':      elements = layoutAerospace(sceneGraph);      break;
    case 'Thermal':        elements = layoutThermal(sceneGraph);        break;
    case 'Control':        elements = layoutControl(sceneGraph);        break;
    case 'Materials':      elements = layoutMaterials(sceneGraph);      break;
    case 'Power':          elements = layoutPower(sceneGraph);          break;
    default:
      // Generic fallback — render generic scene graph elements
      elements = layoutGeneric(sceneGraph);
  }

  // Runtime assertion: at least one element must have been produced
  if (elements.length === 0) {
    console.warn(`[svgLayoutEngine] No elements produced for domain "${domain}". Scene graph:`, JSON.stringify(sceneGraph).slice(0, 200));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" role="img" aria-label="${domain} schematic">
  ${arrowDefs()}
  <rect width="400" height="260" fill="${COLORS.background}"/>
  ${elements.filter(Boolean).join('\n  ')}
</svg>`;
}

// ── Generic fallback ──────────────────────────────────────────────────────────

export function layoutGeneric(sceneGraph) {
  const els = [];
  const items = sceneGraph.elements || sceneGraph.components || sceneGraph.bodies || [];
  const title = sceneGraph.title || sceneGraph.diagram_intent || '';

  if (title) els.push(labelText(200, 18, title, 9, COLORS.textDim));

  // Place items on a grid
  const cols = Math.min(4, items.length);
  const rows = Math.ceil(items.length / cols);
  const cellW = 300 / Math.max(1, cols);
  const cellH = 180 / Math.max(1, rows);

  items.forEach((el, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = 50 + col * cellW + cellW / 2;
    const cy = 50 + row * cellH + cellH / 2;
    const lbl = el.label || el.id || el.semantic_role || el.type || `El ${i + 1}`;
    const sub = el.value || '';

    if (el.shape === 'circle' || el.type === 'circle') {
      els.push(circle(cx, cy, 20, COLORS.componentFill, COLORS.componentBorder, 2));
      els.push(labelText(cx, cy + 4, lbl, 9));
    } else if (el.shape === 'diamond') {
      els.push(triangle(cx, cy - 16, cx + 20, cy, cx - 20, cy, COLORS.componentFill, COLORS.componentBorder, 2));
      els.push(triangle(cx - 20, cy, cx + 20, cy, cx, cy + 16, COLORS.componentFill, COLORS.componentBorder, 2));
      els.push(labelText(cx, cy + 4, lbl, 8));
    } else {
      els.push(labeledShape(cx, cy, Math.min(cellW - 10, 70), Math.min(cellH - 10, 30), lbl, sub));
    }

    // Draw connections
    if (el.connects_to) {
      el.connects_to.forEach(target => {
        const ti = items.findIndex(e => (e.id || e.label || e.semantic_role) === target);
        if (ti >= 0) {
          const tcol = ti % cols, trow = Math.floor(ti / cols);
          const tx = 50 + tcol * cellW + cellW / 2;
          const ty = 50 + trow * cellH + cellH / 2;
          els.push(rigidLink(cx, cy, tx, ty, COLORS.wire, 1.5, 'arrow-white'));
        }
      });
    }
  });

  return els;
}