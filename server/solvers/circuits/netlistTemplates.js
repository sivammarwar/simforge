function v(field, fallback = '') {
  return field?.value ?? field ?? fallback;
}

export function voltageDividerNetlist(model = {}) {
  return `* SimForge voltage divider
V1 in 0 DC ${v(model.INPUT?.['Supply voltage'], '12 V')}
R1 in out ${v(model.COMPONENTS?.['Top resistor (R1)'], '1.5 kΩ')}
R2 out 0 ${v(model.COMPONENTS?.['Bottom resistor (R2)'], '1 kΩ')}
.op
.end`;
}

export function buckConverterNetlist(model = {}) {
  return `* SimForge buck converter template
* Vin: ${v(model.INPUT?.['Supply voltage'], '5 V')}
* L1: ${v(model.COMPONENTS?.['Inductor (L1)'], '22 µH')}
* C1: ${v(model.COMPONENTS?.['Capacitor (C1)'], '100 µF')}
* ESR: ${v(model.COMPONENTS?.['ESR (C1)'], '20 mΩ')}
* Fsw: ${v(model.COMPONENTS?.['Switch freq'], '500 kHz')}`;
}

