import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function OneLineDiagram() {
  return (
    <DiagramFrame title="POWER ONE-LINE DIAGRAM" subtitle="registered visualization">
      <svg width="320" height="160" viewBox="0 0 320 160" fill="none">
        <rect width="320" height="160" fill="#0D0F12" />
        <path d="M35 80 H120 M200 80 H285" stroke="#E8EAF0" strokeWidth="2" />
        <circle cx="160" cy="80" r="38" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        <text x="160" y="84" fill="#E8EAF0" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">XFMR</text>
      </svg>
    </DiagramFrame>
  );
}

