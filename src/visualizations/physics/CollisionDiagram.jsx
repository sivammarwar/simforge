import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function CollisionDiagram() {
  return (
    <DiagramFrame title="COLLISION BEFORE / AFTER" subtitle="registered visualization">
      <svg width="320" height="170" viewBox="0 0 320 170" fill="none">
        <rect width="320" height="170" fill="#0D0F12" />
        <circle cx="90" cy="75" r="18" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        <circle cx="210" cy="75" r="18" fill="#1C2026" stroke="#22C55E" strokeWidth="2" />
        <path d="M112 75 H175" stroke="#F59E0B" strokeWidth="2" />
        <text x="135" y="62" fill="#F59E0B" fontSize="10" fontFamily="var(--font-mono)">impact</text>
      </svg>
    </DiagramFrame>
  );
}

