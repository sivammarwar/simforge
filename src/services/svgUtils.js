/**
 * svgUtils.js — SVG validation and repair utilities
 */

// ─── SVG VALIDATION ─────────────────────────────────────────────────
/**
 * Validates SVG output from brain before rendering
 * @param {string} svgString - SVG string to validate
 * @returns {string|null} Valid SVG or null if invalid
 */
export function validateSVGOutput(svgString) {
  if (!svgString) return null;
  const s = svgString.trim();
  if (!s.startsWith('<svg')) return null;
  if (!s.includes('</svg>')) return null;
  if (s.length < 300) return null; // A real diagram needs at least 300 chars
  if (s.includes('TODO') || s.includes('placeholder') || s.includes('lorem')) return null;
  
  // Must contain at least one shape element beyond the background rect
  const shapeCount = (s.match(/<(line|circle|rect|path|polyline|polygon|ellipse)/g) || []).length;
  if (shapeCount < 3) return null; // Background rect counts as 1, need at least 2 more shapes
  
  // Must contain at least one text label
  if (!s.includes('<text')) return null;
  
  // Must have viewBox
  if (!s.includes('viewBox')) return null;
  
  return s;
}

// ─── SVG REPAIR ───────────────────────────────────────────────────
/**
 * Repairs SVG output by injecting missing required elements
 * @param {string} svgString - SVG string to repair
 * @param {object} context - Context object for metadata
 * @returns {string} Repaired SVG string
 */
export function repairSVGOutput(svgString, context = {}) {
  if (!svgString) return svgString;
  let repaired = svgString;
  
  // Fix escaped quotes in SVG attributes (common issue with AI-generated SVG)
  repaired = repaired.replace(/\\"/g, '"');
  
  // Check if <defs> is present - if not, inject arrowhead marker defs after <svg ...>
  if (!repaired.includes('<defs>')) {
    const defsBlock = `<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" fill="#EF4444"/>
  </marker>
  <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" fill="#10B981"/>
  </marker>
  <marker id="arrow-yellow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" fill="#F59E0B"/>
  </marker>
</defs>`;
    repaired = repaired.replace(/<svg[^>]*>/, (match) => match + defsBlock);
  }
  
  // Check if a title text is present - if not, inject at top center
  if (!repaired.includes('<text') || !repaired.includes('y="18"')) {
    const titleText = `<text x="200" y="16" text-anchor="middle" fill="#94A3B8" font-size="11" font-family="monospace">${context.system_type || context.domain || 'Diagram'}</text>`;
    repaired = repaired.replace('</defs>', '</defs>' + titleText);
  }
  
  // Check if viewBox is "0 0 400 260" - if not, correct it
  if (!repaired.includes('viewBox="0 0 400 260"')) {
    repaired = repaired.replace(/viewBox="[^"]*"/, 'viewBox="0 0 400 260"');
  }
  
  return repaired;
}
