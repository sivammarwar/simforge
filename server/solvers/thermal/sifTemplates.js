function v(field, fallback = '') {
  return field?.value ?? field ?? fallback;
}

export function thermalSifSummary(model = {}) {
  return `! SimForge Elmer thermal summary
! Power: ${v(model.HEAT_LOAD?.['Power dissipation'], '25 W')}
! Ambient: ${v(model.TEMPERATURES?.['Ambient temperature'], '25 C')}`;
}

