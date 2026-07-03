import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function CircularMotionDiagram({ modelData, resultsData }) {
  const radius = modelData?.BODY?.Radius?.value || '2 m';
  const force = resultsData?.metrics?.find(item => item.name === 'Centripetal force')?.value || '-';
  return (
    <DiagramFrame title="CIRCULAR MOTION DIAGRAM" subtitle="registered visualization">
      <svg width="300" height="220" viewBox="0 0 300 220" fill="none">
        <rect width="300" height="220" fill="#0D0F12" />
        <circle cx="145" cy="110" r="70" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 4" />
        <circle cx="215" cy="110" r="12" fill="#1C2026" stroke="#22C55E" strokeWidth="2" />
        <path d="M215 110 H155" stroke="#EF4444" strokeWidth="2" />
        <path d="M215 110 V65" stroke="#F59E0B" strokeWidth="2" />
        <text x="165" y="102" fill="#EF4444" fontSize="10" fontFamily="var(--font-mono)">Fc {force}</text>
        <text x="158" y="132" fill="#8C929E" fontSize="10" fontFamily="var(--font-mono)">r {radius}</text>
      </svg>
    </DiagramFrame>
  );
}

