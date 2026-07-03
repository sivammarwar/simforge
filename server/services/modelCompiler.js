function valueOf(field, fallback = '') {
  if (field && typeof field === 'object' && field.value !== undefined) return field.value;
  return field ?? fallback;
}

export function compileModelDeck(domain, model = {}) {
  if (domain === 'Circuits') return compileCircuitDeck(model);
  if (domain === 'Structural') return compileCalculixSummary(model);
  if (domain === 'Aerospace') return compileAerospaceBatch(model);
  if (domain === 'Fluids') return compileOpenFoamSummary(model);
  if (domain === 'Thermal') return compileElmerSummary(model);
  if (domain === 'Control') return compilePythonControlSummary(model);
  if (domain === 'Power') return compilePandapowerSummary(model);
  if (domain === 'Physics') return compilePhysicsSummary(model);
  return `# SimForge generic model deck\n# Domain: ${domain}\n# System: ${model.SYSTEM_TYPE || 'unknown'}\n`;
}

function compileCircuitDeck(model) {
  if (model.SYSTEM_TYPE === 'Voltage Divider') {
    return `* Voltage divider
V1 in 0 DC ${valueOf(model.INPUT?.['Supply voltage'], '12 V')}
R1 in out ${valueOf(model.COMPONENTS?.['Top resistor (R1)'], '1.5 kΩ')}
R2 out 0 ${valueOf(model.COMPONENTS?.['Bottom resistor (R2)'], '1 kΩ')}
.op
.end`;
  }
  return `* Circuit deck placeholder\n* System: ${model.SYSTEM_TYPE || 'Circuit'}\n`;
}

function compileCalculixSummary(model) {
  return `* CalculiX input summary
* System: ${model.SYSTEM_TYPE || 'Structural'}
* Length: ${valueOf(model.GEOMETRY?.Length, '-')}
* Load: ${valueOf(model.LOADING?.Magnitude, '-')}`;
}

function compileAerospaceBatch(model) {
  return `# Aerospace batch summary
# System: ${model.SYSTEM_TYPE || 'Aerospace'}
# Airfoil: ${valueOf(model.GEOMETRY?.Airfoil, 'NACA 4412')}`;
}

function compileOpenFoamSummary(model) {
  return `// OpenFOAM case summary
// System: ${model.SYSTEM_TYPE || 'Fluid flow'}
// Inlet: ${valueOf(model.BOUNDARY_CONDITIONS?.['Inlet velocity'], '-')}`;
}

function compileElmerSummary(model) {
  return `! Elmer SIF summary
! Power: ${valueOf(model.HEAT_LOAD?.['Power dissipation'], '-')}`;
}

function compilePythonControlSummary(model) {
  return `# python-control summary
plant = "${valueOf(model.PLANT?.['Transfer function'], '10/(s*(s+2))')}"`;
}

function compilePandapowerSummary(model) {
  return `# pandapower summary
primary = "${valueOf(model.INPUT?.['Primary voltage'], '-')}"
secondary = "${valueOf(model.INPUT?.['Secondary voltage'], '-')}"`;
}

function compilePhysicsSummary(model) {
  return `# Physics mechanics summary
system = "${model.SYSTEM_TYPE || 'Physics'}"
m1 = "${valueOf(model.MASSES?.['Mass m1'], '-')}"
m2 = "${valueOf(model.MASSES?.['Mass m2'], '-')}"`;
}
