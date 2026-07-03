function v(field, fallback = '') {
  return field?.value ?? field ?? fallback;
}

export function xfoilBatch(model = {}) {
  const airfoil = String(v(model.GEOMETRY?.Airfoil, 'NACA 4412')).match(/(\d{4})/)?.[1] || '4412';
  const alpha = v(model.FLIGHT_CONDITIONS?.['Angle of attack'], '6 deg');
  return `NACA ${airfoil}
PANE
OPER
ALFA ${alpha}
QUIT`;
}

