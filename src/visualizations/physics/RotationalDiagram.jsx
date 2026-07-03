import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function RotationalDiagram() {
  return (
    <DiagramFrame title="ROTATIONAL DYNAMICS" subtitle="registered visualization">
      <svg width="300" height="180" viewBox="0 0 300 180" fill="none">
        <rect width="300" height="180" fill="#0D0F12" />
        <circle cx="150" cy="90" r="48" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        <path d="M150 90 L200 58" stroke="#EF4444" strokeWidth="2" />
        <text x="205" y="58" fill="#EF4444" fontSize="10" fontFamily="var(--font-mono)">τ</text>
      </svg>
    </DiagramFrame>
  );
}

