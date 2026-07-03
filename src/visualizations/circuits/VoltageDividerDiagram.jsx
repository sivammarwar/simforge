import React from 'react';
import DiagramFrame from '../DiagramFrame.jsx';

export default function VoltageDividerDiagram({ modelData, resultsData }) {
  const vin = modelData?.INPUT?.['Supply voltage']?.value || '12 V';
  const r1 = modelData?.COMPONENTS?.['Top resistor (R1)']?.value || '1.5 kΩ';
  const r2 = modelData?.COMPONENTS?.['Bottom resistor (R2)']?.value || '1 kΩ';
  const vout = resultsData?.metrics?.find(item => item.name === 'Output voltage')?.value || '4.80 V';
  return (
    <DiagramFrame title="VOLTAGE DIVIDER SCHEMATIC" subtitle="registered visualization">
      <svg width="320" height="220" viewBox="0 0 320 220" fill="none">
        <rect width="320" height="220" fill="#0D0F12" />
        <path d="M70 35 V70 M70 150 V185 M70 70 H155 M155 70 V150 M155 150 H70" stroke="#E8EAF0" strokeWidth="2" />
        <rect x="48" y="80" width="44" height="18" rx="3" fill="#1C2026" stroke="#3B82F6" />
        <rect x="48" y="120" width="44" height="18" rx="3" fill="#1C2026" stroke="#3B82F6" />
        <path d="M155 110 H240" stroke="#22C55E" strokeWidth="2" />
        <text x="28" y="38" fill="#E8EAF0" fontSize="11" fontFamily="var(--font-mono)">Vin {vin}</text>
        <text x="101" y="94" fill="#E8EAF0" fontSize="11" fontFamily="var(--font-mono)">R1 {r1}</text>
        <text x="101" y="134" fill="#E8EAF0" fontSize="11" fontFamily="var(--font-mono)">R2 {r2}</text>
        <text x="164" y="104" fill="#22C55E" fontSize="11" fontFamily="var(--font-mono)">Vout {vout}</text>
        <text x="52" y="200" fill="#8C929E" fontSize="10" fontFamily="var(--font-mono)">GND</text>
      </svg>
    </DiagramFrame>
  );
}

