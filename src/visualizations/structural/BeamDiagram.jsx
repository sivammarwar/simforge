import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function BeamDiagram({ modelData }) {
  const length = modelData?.GEOMETRY?.Length?.value || '500 mm';
  const load = modelData?.LOADING?.Magnitude?.value || '500 N';
  return (
    <DiagramFrame title="CANTILEVER BEAM" subtitle="registered visualization">
      <svg width="320" height="180" viewBox="0 0 320 180" fill="none">
        <rect width="320" height="180" fill="#0D0F12" />
        <rect x="35" y="55" width="25" height="80" fill="#4B5260" />
        <rect x="60" y="82" width="210" height="28" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        <path d="M270 35 V78" stroke="#EF4444" strokeWidth="3" />
        <text x="278" y="58" fill="#EF4444" fontSize="10" fontFamily="var(--font-mono)">F {load}</text>
        <text x="135" y="132" fill="#8C929E" fontSize="10" fontFamily="var(--font-mono)">L {length}</text>
      </svg>
    </DiagramFrame>
  );
}

