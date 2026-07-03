import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function PulleyDiagram({ modelData, resultsData }) {
  const m1 = modelData?.MASSES?.['Mass m1']?.value || '5 kg';
  const m2 = modelData?.MASSES?.['Mass m2']?.value || '3 kg';
  const a = resultsData?.metrics?.find(item => item.name === 'Acceleration')?.value || '-';
  return (
    <DiagramFrame title="PULLEY + FREE-BODY DIAGRAM" subtitle="registered visualization">
      <svg width="340" height="230" viewBox="0 0 340 230" fill="none">
        <rect width="340" height="230" fill="#0D0F12" />
        <line x1="35" y1="132" x2="170" y2="132" stroke="#8C929E" strokeWidth="4" />
        <rect x="70" y="90" width="56" height="40" rx="3" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        <circle cx="190" cy="70" r="25" fill="#13161A" stroke="#F59E0B" strokeWidth="3" />
        <path d="M126 110 C150 110 160 70 165 70 M215 70 V158" stroke="#E8EAF0" strokeWidth="2" />
        <rect x="190" y="158" width="50" height="40" rx="3" fill="#1C2026" stroke="#3B82F6" strokeWidth="2" />
        <text x="98" y="114" fill="#E8EAF0" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">m1 {m1}</text>
        <text x="215" y="181" fill="#E8EAF0" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">m2 {m2}</text>
        <text x="252" y="65" fill="#22C55E" fontSize="10" fontFamily="var(--font-mono)">a = {a}</text>
      </svg>
    </DiagramFrame>
  );
}

