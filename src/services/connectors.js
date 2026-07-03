// External Connectors Registry for SimForge
// Looks up components, material profiles, and fluid data.

const DATASHEETS = {
  // Inductors
  'tdk mlz2012m220wt': {
    name: 'TDK MLZ2012M220WT (Inductor)',
    source: 'TDK Component Database v14.2',
    fields: {
      'Inductor (L1)': '22 µH',
      'Source impedance': '150 mΩ',
      'Max current': '800 mA',
      'Self-Resonant Freq': '25 MHz'
    }
  },
  'coilcraft xal7070-223': {
    name: 'Coilcraft XAL7070-223MEC',
    source: 'Coilcraft Power Inductors Catalog',
    fields: {
      'Inductor (L1)': '22 µH',
      'Source impedance': '45 mΩ',
      'Max current': '5.5 A',
      'Self-Resonant Freq': '18 MHz'
    }
  },
  // Capacitors
  'murata grm32er71a106k': {
    name: 'Murata GRM32ER71A106KA01 (Capacitor)',
    source: 'Murata Chip Ceramic Caps',
    fields: {
      'Capacitor (C1)': '10 µF',
      'ESR (C1)': '5 mΩ',
      'V-Rating': '10 V'
    }
  },
  'panasonic 25svp100m': {
    name: 'Panasonic OS-CON 25SVP100M',
    source: 'Panasonic Polymer Capacitors',
    fields: {
      'Capacitor (C1)': '100 µF',
      'ESR (C1)': '20 mΩ',
      'V-Rating': '25 V'
    }
  }
};

const MATERIALS = {
  'structural steel': {
    name: 'Structural Steel (AISI 1020)',
    source: 'ASM Material Database',
    fields: {
      'Material': 'Structural steel (AISI 1020)',
      'Young\'s modulus': '200 GPa',
      'Poisson\'s ratio': '0.29',
      'Density': '7850 kg/m³',
      'Yield strength': '250 MPa'
    }
  },
  'aisi 1020': {
    name: 'Structural Steel (AISI 1020)',
    source: 'ASM Material Database',
    fields: {
      'Material': 'Structural steel (AISI 1020)',
      'Young\'s modulus': '200 GPa',
      'Poisson\'s ratio': '0.29',
      'Density': '7850 kg/m³',
      'Yield strength': '250 MPa'
    }
  },
  '6061 aluminum': {
    name: 'Aluminum 6061-T6 Alloy',
    source: 'Alcoa Technical Reference',
    fields: {
      'Material': 'Aluminum 6061-T6',
      'Young\'s modulus': '69 GPa',
      'Poisson\'s ratio': '0.33',
      'Density': '2700 kg/m³',
      'Yield strength': '276 MPa'
    }
  },
  'aluminum': {
    name: 'Aluminum 6061-T6 Alloy',
    source: 'Alcoa Technical Reference',
    fields: {
      'Material': 'Aluminum 6061-T6',
      'Young\'s modulus': '69 GPa',
      'Poisson\'s ratio': '0.33',
      'Density': '2700 kg/m³',
      'Yield strength': '276 MPa'
    }
  },
  'titanium ti-6al-4v': {
    name: 'Titanium Grade 5 (Ti-6Al-4V)',
    source: 'MIL-HDBK-5H Aerospace Materials',
    fields: {
      'Material': 'Titanium Grade 5 (Ti-6Al-4V)',
      'Young\'s modulus': '114 GPa',
      'Poisson\'s ratio': '0.34',
      'Density': '4430 kg/m³',
      'Yield strength': '880 MPa'
    }
  }
};

const FLUIDS = {
  'air': {
    name: 'Dry Air at 25°C',
    source: 'NIST Chemistry WebBook',
    fields: {
      'Fluid': 'Air at 25°C',
      'Density': '1.184 kg/m³',
      'Dynamic viscosity': '1.849e-5 Pa·s'
    }
  },
  'water': {
    name: 'Liquid Water at 25°C',
    source: 'NIST IAPWS Formulations',
    fields: {
      'Fluid': 'Water at 25°C',
      'Density': '997 kg/m³',
      'Dynamic viscosity': '8.90e-4 Pa·s'
    }
  },
  'oil': {
    name: 'Engine Oil (SAE 30) at 25°C',
    source: 'Chevron Lubricant Table',
    fields: {
      'Fluid': 'Engine Oil (SAE 30)',
      'Density': '880 kg/m³',
      'Dynamic viscosity': '0.29 Pa·s'
    }
  }
};

export function lookupComponent(query) {
  const q = query.toLowerCase().trim();
  
  // Try exact matches or contains matches
  for (const [key, value] of Object.entries(DATASHEETS)) {
    if (q.includes(key) || key.includes(q)) {
      return { type: 'datasheet', data: value };
    }
  }
  return null;
}

export function lookupMaterial(query) {
  const q = query.toLowerCase().trim();
  for (const [key, value] of Object.entries(MATERIALS)) {
    if (q.includes(key) || key.includes(q)) {
      return { type: 'material_db', data: value };
    }
  }
  return null;
}

export function lookupFluid(query) {
  const q = query.toLowerCase().trim();
  for (const [key, value] of Object.entries(FLUIDS)) {
    if (q.includes(key) || key.includes(q)) {
      return { type: 'fluid_db', data: value };
    }
  }
  return null;
}

export function detectAllLookups(text) {
  const cResult = lookupComponent(text);
  if (cResult) return cResult;
  
  const mResult = lookupMaterial(text);
  if (mResult) return mResult;
  
  const fResult = lookupFluid(text);
  if (fResult) return fResult;
  
  return null;
}
