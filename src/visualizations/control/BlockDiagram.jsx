import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function BlockDiagram() {
  return (
    <DiagramFrame title="CONTROL BLOCK DIAGRAM" subtitle="registered visualization">
      <svg width="320" height="160" viewBox="0 0 320 160" fill="none">
        <rect width="320" height="160" fill="#0D0F12" />
        <path d="M30 80 H80 M130 80 H185 M235 80 H290" stroke="#E8EAF0" strokeWidth="2" />
        <rect x="80" y="55" width="50" height="50" fill="#1C2026" stroke="#3B82F6" />
        <rect x="185" y="55" width="50" height="50" fill="#1C2026" stroke="#3B82F6" />
        <text x="105" y="84" fill="#E8EAF0" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">Gc(s)</text>
        <text x="210" y="84" fill="#E8EAF0" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">G(s)</text>
      </svg>
    </DiagramFrame>
  );
}

