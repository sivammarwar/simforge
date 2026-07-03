import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function InclineDiagram({ modelData }) {
  const angle = modelData?.CONTACT?.['Incline angle']?.value || '30 deg';
  return (
    <DiagramFrame title="INCLINED PLANE FBD" subtitle="registered visualization">
      <svg width="320" height="190" viewBox="0 0 320 190" fill="none">
        <rect width="320" height="190" fill="#0D0F12" />
        <path d="M50 145 L250 65 L250 145 Z" stroke="#8C929E" strokeWidth="3" fill="none" />
        <g transform="rotate(-22 145 104)">
          <rect x="115" y="84" width="60" height="40" rx="3" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        </g>
        <text x="65" y="160" fill="#8C929E" fontSize="10" fontFamily="var(--font-mono)">θ {angle}</text>
      </svg>
    </DiagramFrame>
  );
}

