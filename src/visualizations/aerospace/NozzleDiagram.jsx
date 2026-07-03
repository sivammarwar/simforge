import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function NozzleDiagram() {
  return (
    <DiagramFrame title="CONVERGING-DIVERGING NOZZLE" subtitle="registered visualization">
      <svg width="320" height="180" viewBox="0 0 320 180" fill="none">
        <rect width="320" height="180" fill="#0D0F12" />
        <path d="M45 55 C95 55 105 85 150 85 C195 85 220 45 280 45 M45 125 C95 125 105 95 150 95 C195 95 220 135 280 135" stroke="#3B82F6" strokeWidth="3" />
        <text x="132" y="78" fill="#F59E0B" fontSize="10" fontFamily="var(--font-mono)">throat</text>
      </svg>
    </DiagramFrame>
  );
}

