/**
 * PhysicalDesignResults — renders physical design results.
 *
 * The physical_design pipeline is currently LLM-driven (no deterministic
 * OpenROAD/Magic run backing it yet — see backend/domains/circuits/
 * physical_design/pipeline.py), so status/metrics/assumptions/summary are
 * already covered generically by GenericSubDomainView (metrics is a flat
 * list of {name, value} pairs, not a fixed schema). This only adds the two
 * fields PhysicalDesignResult actually defines beyond that generic contract:
 * parasitic_rc and area_report.
 */
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function PhysicalDesignResults(props) {
  const { resultsData } = props;
  const parasiticRc = resultsData?.parasitic_rc;
  const areaReport = resultsData?.area_report;

  return (
    <GenericSubDomainView {...props} isPreview title="Physical Design (Preview)">
      {parasiticRc && (
        <div className="result-section">
          <h4>Parasitic RC</h4>
          <table className="metrics-table">
            <tbody>
              {Object.entries(parasiticRc).map(([k, v]) => (
                <tr key={k}>
                  <td className="metric-name">{k}</td>
                  <td className="metric-value">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {areaReport && (
        <div className="result-section">
          <h4>Area Report</h4>
          <pre className="area-report">{areaReport}</pre>
        </div>
      )}
    </GenericSubDomainView>
  );
}
