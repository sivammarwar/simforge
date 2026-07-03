import React from 'react';
import DiagramFallback from './DiagramFallback.jsx';
import VoltageDividerDiagram from './circuits/VoltageDividerDiagram.jsx';
import SpringPulleyDiagram from './physics/SpringPulleyDiagram.jsx';
import PulleyDiagram from './physics/PulleyDiagram.jsx';
import CircularMotionDiagram from './physics/CircularMotionDiagram.jsx';
import BeamDiagram from './structural/BeamDiagram.jsx';
import WingDiagram from './aerospace/WingDiagram.jsx';
import NozzleDiagram from './aerospace/NozzleDiagram.jsx';
import BlockDiagram from './control/BlockDiagram.jsx';
import OneLineDiagram from './power/OneLineDiagram.jsx';

export default function VisualizationRenderer({ activeDomain, modelData, resultsData }) {
  const systemType = String(modelData?.SYSTEM_TYPE || '').toLowerCase();
  const capability = resultsData?.visualization_capability;

  if (capability && capability.diagram_status !== 'fully_rendered') {
    return <DiagramFallback capability={capability} />;
  }

  if (activeDomain === 'Circuits' && modelData?.SYSTEM_TYPE === 'Voltage Divider') {
    return <VoltageDividerDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if ((activeDomain === 'Physics' || activeDomain === 'Structural') && systemType.includes('spring') && systemType.includes('pulley')) {
    return <SpringPulleyDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if ((activeDomain === 'Physics' || activeDomain === 'Structural') && (systemType.includes('pulley') || systemType.includes('block'))) {
    return <PulleyDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if (activeDomain === 'Physics' && systemType.includes('circular')) {
    return <CircularMotionDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if (activeDomain === 'Structural' && systemType.includes('beam')) {
    return <BeamDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if (activeDomain === 'Aerospace' && systemType.includes('wing')) {
    return <WingDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if (activeDomain === 'Aerospace' && systemType.includes('nozzle')) {
    return <NozzleDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if (activeDomain === 'Control') {
    return <BlockDiagram modelData={modelData} resultsData={resultsData} />;
  }
  if (activeDomain === 'Power') {
    return <OneLineDiagram modelData={modelData} resultsData={resultsData} />;
  }

  return <DiagramFallback capability={capability} />;
}

