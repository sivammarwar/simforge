import { parseNgspiceMeasurements, parseNgspiceOperatingPoint } from '../../services/resultParsers.js';

export function parseNgspiceResult(log) {
  return {
    operatingPoint: parseNgspiceOperatingPoint(log),
    measurements: parseNgspiceMeasurements(log)
  };
}

