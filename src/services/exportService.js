/**
 * Export and Reporting Service
 */

export function exportResultsToJSON(results, model, domain) {
  return JSON.stringify({
    metadata: {
      exportDate: new Date().toISOString(),
      domain,
      systemType: model?.SYSTEM_TYPE || 'Unknown',
      solver: results?.solver_metadata?.solver || 'Unknown'
    },
    model,
    results,
    metrics: results?.metrics || []
  }, null, 2);
}

export function exportMetricsToCSV(results) {
  if (!results?.metrics) return '';
  const headers = ['Metric Name', 'Value', 'Unit'];
  const rows = results.metrics.map(m => [m.name, m.value, m.unit || '']);
  return [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
}

export function generateHTMLReport(results, model, domain) {
  const metrics = results?.metrics || [];
  const metricsHTML = metrics.map(m => `<tr><td>${m.name}</td><td>${m.value}</td><td>${m.unit || '-'}</td></tr>`).join('');
  
  return `<!DOCTYPE html><html><head><title>Report - ${domain}</title>
<style>body{font-family:sans-serif;background:#0D0F12;color:#E8EAF0;padding:20px}.container{max-width:900px;margin:0 auto;background:#13161A;padding:30px;border-radius:8px}h1{color:#3B82F6}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:12px;border-bottom:1px solid #252A32}th{background:#1A1F26;color:#3B82F6}</style></head>
<body><div class="container"><h1>Simulation Report</h1>
<p><strong>Domain:</strong> ${domain} | <strong>Solver:</strong> ${results?.solver_metadata?.solver || 'Unknown'}</p>
<h2>Metrics</h2><table><thead><tr><th>Metric</th><th>Value</th><th>Unit</th></tr></thead><tbody>${metricsHTML}</tbody></table>
</div></body></html>`;
}

export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
