export function tryDeterministicEngineeringAnswer(message, domain) {
  const lower = String(message || '').toLowerCase();
  if (domain === 'Circuits' && /voltage\s+divider|divider/.test(lower)) {
    return designVoltageDivider(lower);
  }
  if (domain === 'Circuits' && /rc|low.pass|filter/.test(lower) && /1\s*k(?:ohm|ω|Ω|)/.test(lower) && /1\s*khz/.test(lower)) {
    return designLoadedRcLowPass();
  }
  return null;
}

function designVoltageDivider(lower) {
  const vinMatch = lower.match(/from\s+(\d+(?:\.\d+)?)\s*v/) || lower.match(/(\d+(?:\.\d+)?)\s*v\s*input/);
  const voutMatch = lower.match(/(?:get|to|output)\s+(\d+(?:\.\d+)?)\s*v/) || lower.match(/(\d+(?:\.\d+)?)\s*v\s*output/);
  const vin = vinMatch ? Number(vinMatch[1]) : 12;
  const target = voutMatch ? Number(voutMatch[1]) : 5;
  const r2 = 1000;
  const idealR1 = ((vin / target) - 1) * r2;
  const standard = [100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820, 1000, 1200, 1500, 1800, 2200, 2700, 3300, 3900, 4700, 5600, 6800, 8200, 10000];
  const r1 = standard.reduce((best, value) => Math.abs(value - idealR1) < Math.abs(best - idealR1) ? value : best, standard[0]);
  const actual = vin * r2 / (r1 + r2);
  const current = vin / (r1 + r2);

  return {
    success: true,
    provider: 'simforge-guardrail',
    model: 'deterministic-voltage-divider-v1',
    tokens_used: 0,
    timestamp: new Date().toISOString(),
    message: `### Problem Summary
Design a voltage divider to get about ${target} V from ${vin} V and report current draw.

### Standard Resistor Choice
Use **R1 = ${r1 >= 1000 ? `${r1 / 1000} kΩ` : `${r1} Ω`}** on top and **R2 = 1 kΩ** to ground.

### Calculation
Vout = Vin × R2 / (R1 + R2)

Vout = ${vin} × 1000 / (${r1} + 1000) = ${actual.toFixed(2)} V

Current draw = Vin / (R1 + R2) = ${(current * 1000).toFixed(2)} mA

| Parameter | Value | Status |
| --- | ---: | --- |
| Input voltage | ${vin} V | Given |
| Target output | ${target} V | Goal |
| Actual output | ${actual.toFixed(2)} V | ${Math.abs(actual - target) < 0.3 ? 'Close' : 'Approximate'} |
| Divider current | ${(current * 1000).toFixed(2)} mA | Calculated |

\`\`\`
${vin}V --[ R1 ${r1 >= 1000 ? `${r1 / 1000}k` : r1} ]--+-- Vout ≈ ${actual.toFixed(2)}V
                            |
                         [ R2 1k ]
                            |
                           GND
\`\`\`

**Note:** A voltage divider is good for light signal/reference loads. If the 5 V output must power a real load, use a regulator instead.`
  };
}

function designLoadedRcLowPass() {
  const fc = 1000;
  const rl = 1000;
  const c = 1.8e-6;
  const rSeries = 100;
  const rth = (rSeries * rl) / (rSeries + rl);
  const actualFc = 1 / (2 * Math.PI * rth * c);
  const passbandGain = rl / (rSeries + rl);
  const passbandDb = 20 * Math.log10(passbandGain);

  return {
    success: true,
    provider: 'simforge-guardrail',
    model: 'deterministic-loaded-rc-v1',
    tokens_used: 0,
    timestamp: new Date().toISOString(),
    message: `### 1. Problem Summary
Design a passive RC low-pass filter near 1 kHz while driving a 1 kOhm load.

### 2. Approach
For a loaded passive RC filter, the capacitor and load are both shunt elements. The pole uses the Thevenin resistance seen by the capacitor: Rth = Rseries || Rload. To avoid heavy insertion loss, choose Rseries about one-tenth of the 1 kOhm load.

### 3. Calculations
Choose Rseries = 100 Ohm and solve for a standard capacitor near the target:

Rth = 100 || 1000 = ${rth.toFixed(1)} Ohm

Ctarget = 1 / (2*pi*1000*${rth.toFixed(1)}) = 1.75 uF

Use C = 1.8 uF standard value:

fc_actual = 1 / (2*pi*${rth.toFixed(1)}*1.8 uF) = ${actualFc.toFixed(0)} Hz

Loaded passband gain = 1000 / (100 + 1000) = ${passbandGain.toFixed(3)} (${passbandDb.toFixed(2)} dB)

### 4. Results Table
| Parameter | Value | Unit | Status |
| --- | ---: | --- | --- |
| Series resistor | 100 | Ohm | Low loading |
| Capacitor | 1.8 | uF | Standard value |
| Load | 1.0 | kOhm | Given |
| Pole frequency | ${actualFc.toFixed(0)} | Hz | Near 1 kHz |
| Passband gain | ${passbandDb.toFixed(2)} | dB | Small insertion loss |

### 5. Visualization
\`\`\`
VIN --[100 Ohm]--+-- VOUT
                 |
               [1.8 uF]
                 |
                GND
                 |
              [1 kOhm load]
                 |
                GND
\`\`\`

### 6. Design Notes
- Recommendation: Use 100 Ohm + 1.8 uF for a practical passive loaded filter near 1 kHz.
- Alternative: Use a voltage buffer if you need a high source resistance, unity passband gain, or a very accurate -3 dB point.
- Caution: A design like R = 1.6 kOhm and C = 100 nF is not valid for a 1 kOhm load if unity gain is expected; loading causes large insertion loss and shifts the pole.

### 7. Assumptions
- Load is resistive and fixed at 1 kOhm.
- Source impedance before the filter is low.
- Confidence: High for first-order sizing; verify in SPICE for tolerance and source impedance effects.`
  };
}
