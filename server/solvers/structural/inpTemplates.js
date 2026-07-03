function v(field, fallback = '') {
  return field?.value ?? field ?? fallback;
}

export function cantileverInpSummary(model = {}) {
  return `* SimForge CalculiX cantilever input summary
* Length: ${v(model.GEOMETRY?.Length, '500 mm')}
* Width: ${v(model.GEOMETRY?.Width, '30 mm')}
* Height: ${v(model.GEOMETRY?.Height, '10 mm')}
* Load: ${v(model.LOADING?.Magnitude, '500 N')}`;
}

