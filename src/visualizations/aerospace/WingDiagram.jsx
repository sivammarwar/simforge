import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function WingDiagram({ modelData }) {
  const span = modelData?.GEOMETRY?.Wingspan?.value || '2 m';
  const chord = modelData?.GEOMETRY?.Chord?.value || '0.3 m';
  return (
    <DiagramFrame title="RECTANGULAR WING" subtitle="registered visualization">
      <svg width="320" height="190" viewBox="0 0 320 190" fill="none">
        <rect width="320" height="190" fill="#0D0F12" />
        <rect x="45" y="70" width="230" height="48" rx="4" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        <path d="M45 135 H275" stroke="#8C929E" strokeDasharray="4 4" />
        <text x="142" y="153" fill="#8C929E" fontSize="10" fontFamily="var(--font-mono)">span {span}</text>
        <text x="282" y="98" fill="#8C929E" fontSize="10" fontFamily="var(--font-mono)">chord {chord}</text>
      </svg>
    </DiagramFrame>
  );
}

