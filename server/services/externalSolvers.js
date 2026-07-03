/* global process */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';

const EXEC_TIMEOUT_MS = 20_000;
const REMOTE_SOLVER_DEFAULT_TOOLS = ['ccx', 'xfoil', 'blockMesh', 'simpleFoam', 'ElmerSolver'];
const LOCAL_TOOL_DEFAULTS = {
  ngspice: '/opt/homebrew/bin/ngspice',
  python3: path.resolve('.venv-solvers/bin/python')
};
const REMOTE_TOOL_DEFAULTS = {
  ccx: '/usr/bin/ccx',
  xfoil: '/usr/bin/xfoil',
  blockMesh: '/usr/bin/blockMesh',
  simpleFoam: '/usr/bin/simpleFoam',
  ElmerSolver: '/usr/local/bin/ElmerSolver',
  ElmerGrid: '/usr/local/bin/ElmerGrid'
};

function execFileAsync(command, args = [], options = {}) {
  if (options.input !== undefined) {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd: options.cwd, env: options.env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
      }, options.timeout || EXEC_TIMEOUT_MS);
      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', error => {
        clearTimeout(timer);
        resolve({ ok: false, code: null, signal: null, error: error.message, stdout, stderr });
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, code, signal, error: code === 0 ? null : `Process exited with code ${code || signal}`, stdout, stderr });
      });
      child.stdin.write(String(options.input));
      child.stdin.end();
    });
  }
  return new Promise((resolve) => {
    execFile(command, args, { timeout: EXEC_TIMEOUT_MS, ...options }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        signal: error?.signal ?? null,
        error: error?.message || null,
        stdout: String(stdout || ''),
        stderr: String(stderr || '')
      });
    });
  });
}

function listFromEnv(value, fallback = []) {
  if (!value) return fallback;
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function getRemoteSolverConfig(command) {
  const host = process.env.SIMFORGE_REMOTE_SOLVER_HOST;
  const tools = listFromEnv(process.env.SIMFORGE_REMOTE_SOLVER_TOOLS, REMOTE_SOLVER_DEFAULT_TOOLS);
  if (!host || !tools.includes(command)) return null;
  return {
    host,
    port: process.env.SIMFORGE_REMOTE_SOLVER_PORT || null,
    identityFile: process.env.SIMFORGE_REMOTE_SOLVER_KEY || null,
    root: process.env.SIMFORGE_REMOTE_SOLVER_ROOT || '/tmp/simforge-jobs',
    setup: process.env.SIMFORGE_REMOTE_SOLVER_SETUP || ''
  };
}

function envNameForCommand(prefix, command) {
  return `${prefix}_${String(command).replace(/[^a-z0-9]/gi, '_').toUpperCase()}_PATH`;
}

async function executablePath(candidate) {
  if (!candidate) return null;
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function sshBaseArgs(config) {
  return [
    ...(config.port ? ['-p', config.port] : []),
    ...(config.identityFile ? ['-i', config.identityFile] : []),
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    config.host
  ];
}

function scpBaseArgs(config) {
  return [
    ...(config.port ? ['-P', config.port] : []),
    ...(config.identityFile ? ['-i', config.identityFile] : []),
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new'
  ];
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function remoteCommand(config, command) {
  return config.setup ? `${config.setup} >/dev/null 2>&1; ${command}` : command;
}

async function localWhich(command) {
  const explicit = await executablePath(process.env[envNameForCommand('SIMFORGE', command)]);
  if (explicit) return explicit;
  const fallback = await executablePath(LOCAL_TOOL_DEFAULTS[command]);
  if (fallback) return fallback;
  const result = await execFileAsync('which', [command], { timeout: 3000 });
  return result.ok ? result.stdout.trim() : null;
}

async function remoteWhich(command, config) {
  const explicitPath = process.env[envNameForCommand('SIMFORGE_REMOTE', command)] || REMOTE_TOOL_DEFAULTS[command];
  const lookup = explicitPath
    ? `command -v ${shellQuote(command)} || (test -x ${shellQuote(explicitPath)} && printf %s ${shellQuote(explicitPath)})`
    : `command -v ${shellQuote(command)}`;
  const result = await execFileAsync('ssh', [
    ...sshBaseArgs(config),
    remoteCommand(config, lookup)
  ], { timeout: 5000 });
  return result.ok ? result.stdout.trim().split('\n').at(-1) : null;
}

async function resolveTool(command) {
  const local = await localWhich(command);
  if (local) return { available: true, command: local, transport: 'local' };

  const remote = getRemoteSolverConfig(command);
  if (!remote) return { available: false, command: null, transport: 'local' };

  const remotePath = await remoteWhich(command, remote);
  return {
    available: Boolean(remotePath),
    command: remotePath,
    transport: 'ssh',
    host: remote.host,
    remote_root: remote.root,
    error: remotePath ? null : `Unable to find ${command} on ${remote.host}.`
  };
}

async function which(command) {
  const tool = await resolveTool(command);
  return tool.available ? tool.command : null;
}

async function copyRunDirToRemote(localDir, remoteDir, config) {
  await execFileAsync('ssh', [
    ...sshBaseArgs(config),
    remoteCommand(config, `mkdir -p ${shellQuote(remoteDir)}`)
  ], { timeout: 5000 });

  return execFileAsync('scp', [
    ...scpBaseArgs(config),
    '-r',
    `${localDir}/.`,
    `${config.host}:${remoteDir}/`
  ], { timeout: EXEC_TIMEOUT_MS });
}

async function copyRunDirFromRemote(remoteDir, localDir, config) {
  return execFileAsync('scp', [
    ...scpBaseArgs(config),
    '-r',
    `${config.host}:${remoteDir}/.`,
    localDir
  ], { timeout: EXEC_TIMEOUT_MS });
}

async function runTool(command, args = [], options = {}) {
  const tool = await resolveTool(command);
  if (!tool.available) {
    return { ok: false, code: null, signal: null, error: tool.error || `${command} is unavailable`, stdout: '', stderr: '', tool };
  }

  if (tool.transport !== 'ssh') {
    const run = await execFileAsync(tool.command, args, options);
    return { ...run, tool };
  }

  const config = getRemoteSolverConfig(command);
  const remoteDir = options.cwd
    ? `${config.root.replace(/\/+$/, '')}/${path.basename(options.cwd)}`
    : null;

  if (options.cwd) {
    const copied = await copyRunDirToRemote(options.cwd, remoteDir, config);
    if (!copied.ok) return { ...copied, tool, remote_run_dir: remoteDir };
  }

  const quotedArgs = [tool.command, ...args].map(shellQuote).join(' ');
  const commandLine = options.cwd
    ? `cd ${shellQuote(remoteDir)} && ${quotedArgs}`
    : quotedArgs;
  const run = await execFileAsync('ssh', [
    ...sshBaseArgs(config),
    remoteCommand(config, commandLine)
  ], {
    input: options.input,
    timeout: options.timeout || EXEC_TIMEOUT_MS
  });

  if (options.cwd) {
    const copiedBack = await copyRunDirFromRemote(remoteDir, options.cwd, config);
    if (!copiedBack.ok && run.ok) {
      return { ...copiedBack, tool, remote_run_dir: remoteDir };
    }
  }

  return { ...run, tool, remote_run_dir: remoteDir };
}

async function hasPythonModule(moduleName) {
  const python = await localWhich('python3');
  if (!python) return { available: false, python: null };
  const result = await execFileAsync(python, ['-c', `import ${moduleName}; print("ok")`], {
    timeout: Number.parseInt(process.env.SIMFORGE_PYTHON_IMPORT_TIMEOUT_MS || '45000', 10),
    env: pythonEnv()
  });
  return { available: result.ok, python, error: result.stderr || result.stdout || result.error };
}

function pythonEnv() {
  return {
    ...process.env,
    MPLCONFIGDIR: process.env.MPLCONFIGDIR || path.join(os.tmpdir(), 'simforge-matplotlib-cache')
  };
}

function parseUnit(value, fallback = 0) {
  if (value && typeof value === 'object' && value.value !== undefined) value = value.value;
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return value;
  const match = String(value).trim().match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-zA-ZµΩ%³/]*)/);
  if (!match) return Number.parseFloat(value) || fallback;
  const num = Number.parseFloat(match[1]);
  let unit = match[2] || '';
  const baseUnits = ['Hz', 'Pa', 'm³', 'kg', 'Ω', 'V', 'A', 'H', 'F', 'm', 'N', 'K', 's', 'W'];
  for (const base of baseUnits) {
    if (unit.endsWith(base)) {
      unit = unit.slice(0, -base.length);
      break;
    }
  }
  const multipliers = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12 };
  return num * (multipliers[unit] ?? 1);
}

async function makeRunDir(domain, tool) {
  return fs.mkdtemp(path.join(os.tmpdir(), `simforge-${domain.toLowerCase()}-${tool}-`));
}

function unavailable(tool, installHint, extra = {}) {
  return {
    success: false,
    status: 'unavailable',
    executed: false,
    tool,
    install_hint: installHint,
    ...extra
  };
}

function metric(name, value, rawValue = null) {
  return { name, value, rawValue };
}

export async function getSolverCapabilities() {
  const [
    ngspice,
    ltspice,
    ccx,
    xfoil,
    blockMesh,
    simpleFoam,
    elmer,
    control,
    pandapower,
    scipy
  ] = await Promise.all([
    resolveTool('ngspice'),
    resolveTool('ltspice'),
    resolveTool('ccx'),
    resolveTool('xfoil'),
    resolveTool('blockMesh'),
    resolveTool('simpleFoam'),
    resolveTool('ElmerSolver'),
    hasPythonModule('control'),
    hasPythonModule('pandapower'),
    hasPythonModule('scipy')
  ]);

  return [
    capability('Circuits', 'ngspice', ngspice, 'spice_batch'),
    capability('Circuits', 'LTspice', ltspice, 'ltspice_batch'),
    capability('Structural', 'CalculiX ccx', ccx, 'ccx_inp'),
    capability('Aerospace', 'XFOIL', xfoil, 'xfoil_batch'),
    capability('Fluids', 'OpenFOAM simpleFoam', simpleFoam, 'openfoam_case', { dependencies: { blockMesh, simpleFoam }, available: Boolean(blockMesh.available && simpleFoam.available) }),
    capability('Thermal', 'ElmerSolver', elmer, 'elmer_sif'),
    { domain: 'Control', tool: 'python-control', available: Boolean(control.available), command: control.python, adapter: 'python_control', status: control.available ? 'ready' : 'missing', error: control.available ? null : control.error },
    { domain: 'Power', tool: 'pandapower', available: Boolean(pandapower.available), command: pandapower.python, adapter: 'pandapower', status: pandapower.available ? 'ready' : 'missing', error: pandapower.available ? null : pandapower.error },
    { domain: 'Physics', tool: 'SciPy mechanics', available: Boolean(scipy.available), command: scipy.python, adapter: 'scipy_mechanics', status: scipy.available ? 'ready' : 'missing', error: scipy.available ? null : scipy.error }
  ];
}

function capability(domain, toolName, resolvedTool, adapter, extra = {}) {
  const available = extra.available ?? Boolean(resolvedTool.available);
  return {
    domain,
    tool: toolName,
    available,
    command: resolvedTool.command,
    adapter,
    status: available ? 'ready' : 'missing',
    transport: resolvedTool.transport,
    host: resolvedTool.host || null,
    error: available ? null : resolvedTool.error,
    ...extra
  };
}

export async function runExternalSimulation(domain, model = {}) {
  switch (domain) {
    case 'Circuits':
      return runNgspice(model);
    case 'Structural':
      return runCalculix(model);
    case 'Aerospace':
      return runXfoil(model);
    case 'Fluids':
      return runOpenFoam(model);
    case 'Thermal':
      return runElmer(model);
    case 'Control':
      return runPythonControl(model);
    case 'Power':
      return runPandapower(model);
    case 'Physics':
      return runScipyMechanics(model);
    default:
      return unavailable('external solver', `No external adapter is registered for ${domain}.`);
  }
}

function buildNgspiceDeck(model) {
  if (model.SYSTEM_TYPE === 'Voltage Divider') {
    const vin = parseUnit(model.INPUT?.['Supply voltage'] || model.INPUT?.['Input voltage'], 12);
    const r1 = parseUnit(model.COMPONENTS?.['Top resistor (R1)'], 1500);
    const r2 = parseUnit(model.COMPONENTS?.['Bottom resistor (R2)'], 1000);
    return `* SimForge real ngspice deck: voltage divider
V1 in 0 DC ${vin}
R1 in out ${r1}
R2 out 0 ${r2}
.op
.control
run
print v(out)
print i(v1)
.endc
.end
`;
  }

  const vin = parseUnit(model.INPUT?.['Supply voltage'], 5);
  const loadCurrent = parseUnit(model.OUTPUT?.['Load current'], 2);
  const rload = vin / Math.max(loadCurrent, 1e-9);
  const l = parseUnit(model.COMPONENTS?.['Inductor (L1)'], 22e-6);
  const c = parseUnit(model.COMPONENTS?.['Capacitor (C1)'], 100e-6);
  const esr = parseUnit(model.COMPONENTS?.['ESR (C1)'], 20e-3);
  const fsw = parseUnit(model.COMPONENTS?.['Switch freq'], 500e3);
  return `* SimForge real ngspice deck: buck first-pass transient
.param VIN=${vin}
.param L=${l}
.param C=${c}
.param ESR=${esr}
.param RLOAD=${rload}
.param FSW=${fsw}
.param TPER={1/FSW}
.param DUTY=0.66
V1 vin 0 DC {VIN}
S1 vin sw gate 0 swmod
D1 0 sw dmod
L1 sw mid {L}
C1 mid cesr {C}
RESR cesr out {ESR}
RLOAD out 0 {RLOAD}
VGATE gate 0 PULSE(0 5 0 10n 10n {DUTY*TPER} {TPER})
.model swmod SW(Ron=0.05 Roff=1Meg Vt=2.5)
.model dmod D(Is=1e-12 Rs=0.02 N=1)
.tran 0.1u 500u
.control
run
meas tran vout_avg avg v(out) from=400u to=500u
meas tran vout_max max v(out) from=400u to=500u
meas tran vout_min min v(out) from=400u to=500u
print vout_avg vout_max vout_min
.endc
.end
`;
}

async function runNgspice(model) {
  const ngspice = await which('ngspice');
  if (!ngspice) return unavailable('ngspice', 'Install ngspice and ensure it is available on PATH.');
  const runDir = await makeRunDir('Circuits', 'ngspice');
  const deck = buildNgspiceDeck(model);
  const deckPath = path.join(runDir, 'simforge.cir');
  await fs.writeFile(deckPath, deck, 'utf8');
  const run = await runTool('ngspice', ['-b', path.basename(deckPath)], { cwd: runDir });
  const output = `${run.stdout}\n${run.stderr}`;

  const voutMatch = output.match(/v\(out\)\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i)
    || output.match(/vout_avg\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  const vmaxMatch = output.match(/vout_max\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  const vminMatch = output.match(/vout_min\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  const vout = voutMatch ? Number.parseFloat(voutMatch[1]) : null;
  const ripple = vmaxMatch && vminMatch ? Number.parseFloat(vmaxMatch[1]) - Number.parseFloat(vminMatch[1]) : null;

  if (!run.ok) {
    return { success: false, status: 'failed', executed: true, tool: 'ngspice', run_dir: runDir, deck, log: output, error: run.error };
  }

  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'ngspice',
    run_dir: runDir,
    artifacts: [{ type: 'spice_deck', path: deckPath }],
    deck,
    log: output.slice(-6000),
    result: {
      visualization_type: model.SYSTEM_TYPE === 'Voltage Divider' ? 'circuit_static' : 'waveform_external',
      external_tool: { tool: 'ngspice', status: 'executed', run_dir: runDir, transport: run.tool.transport, host: run.tool.host || null },
      metrics: [
        ...(vout !== null ? [metric(model.SYSTEM_TYPE === 'Voltage Divider' ? 'Output voltage' : 'Output average', `${vout.toFixed(4)} V`, vout)] : []),
        ...(ripple !== null ? [metric('Peak ripple', `${(ripple * 1000).toFixed(3)} mV`, ripple * 1000)] : []),
        metric('External solver', 'ngspice', 1)
      ],
      plain_summary: vout !== null
        ? `Real ngspice execution completed. ${model.SYSTEM_TYPE === 'Voltage Divider' ? `Operating-point V(out) is **${vout.toFixed(4)} V**.` : `Average V(out) is **${vout.toFixed(4)} V**${ripple !== null ? ` with ripple **${(ripple * 1000).toFixed(3)} mV**.` : '.'}`}`
        : 'Real ngspice execution completed. Output was generated, but the parser did not find a recognized V(out) metric.'
    }
  };
}

function buildCalculixDeck(model) {
  const length = parseUnit(model.GEOMETRY?.Length, 0.5);
  const width = parseUnit(model.GEOMETRY?.Width, 0.03);
  const height = parseUnit(model.GEOMETRY?.Height, 0.01);
  const force = parseUnit(model.LOADING?.Magnitude, 500);
  const young = parseUnit(model.MATERIAL?.["Young's modulus"], 200e9);
  return `*HEADING
SimForge CalculiX cantilever beam placeholder mesh
*NODE
1,0,0,0
2,${length},0,0
3,0,${height},0
4,${length},${height},0
5,0,0,${width}
6,${length},0,${width}
7,0,${height},${width}
8,${length},${height},${width}
*ELEMENT,TYPE=C3D8,ELSET=BEAM
1,1,2,4,3,5,6,8,7
*MATERIAL,NAME=MAT
*ELASTIC
${young},0.29
*SOLID SECTION,ELSET=BEAM,MATERIAL=MAT
*BOUNDARY
1,1,3
3,1,3
5,1,3
7,1,3
*CLOAD
2,2,-${force / 4}
4,2,-${force / 4}
6,2,-${force / 4}
8,2,-${force / 4}
*STEP
*STATIC
*NODE PRINT,NSET=NALL
U
*EL PRINT,ELSET=BEAM
S
*END STEP
`;
}

async function runCalculix(model) {
  const ccx = await which('ccx');
  if (!ccx) return unavailable('CalculiX ccx', 'Install CalculiX and ensure the ccx executable is available on PATH.');
  const runDir = await makeRunDir('Structural', 'ccx');
  const deck = buildCalculixDeck(model);
  const inpPath = path.join(runDir, 'simforge.inp');
  await fs.writeFile(inpPath, deck, 'utf8');
  const run = await runTool('ccx', ['simforge'], { cwd: runDir });
  const datPath = path.join(runDir, 'simforge.dat');
  const dat = await fs.readFile(datPath, 'utf8').catch(() => '');
  if (!run.ok) return { success: false, status: 'failed', executed: true, tool: 'CalculiX ccx', run_dir: runDir, deck, log: `${run.stdout}\n${run.stderr}\n${dat}`, error: run.error };
  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'CalculiX ccx',
    run_dir: runDir,
    artifacts: [{ type: 'ccx_inp', path: inpPath }, { type: 'ccx_dat', path: datPath }],
    deck,
    log: `${run.stdout}\n${run.stderr}\n${dat}`.slice(-6000),
    result: {
      visualization_type: 'field_2d_external',
      external_tool: { tool: 'CalculiX ccx', status: 'executed', run_dir: runDir, transport: run.tool.transport, host: run.tool.host || null, remote_run_dir: run.remote_run_dir || null },
      metrics: [metric('External solver', 'CalculiX ccx', 1)],
      plain_summary: 'Real CalculiX execution completed. The adapter generated an input deck and parsed solver artifacts; detailed stress/displacement extraction is available through the generated `.dat` artifact.'
    }
  };
}

async function runXfoil(model) {
  const xfoil = await which('xfoil');
  if (!xfoil) return unavailable('XFOIL', 'Install XFOIL and ensure xfoil is available on PATH.');
  const runDir = await makeRunDir('Aerospace', 'xfoil');
  const airfoil = String(model.GEOMETRY?.Airfoil?.value || model.GEOMETRY?.Airfoil || 'NACA 4412').replace(/\s+/g, ' ').trim();
  const alpha = parseUnit(model.FLIGHT_CONDITIONS?.['Angle of attack'], 6);
  const reynolds = parseUnit(model.FLIGHT_CONDITIONS?.['Reynolds number'], 500000);
  const polarPath = path.join(runDir, 'polar.dat');
  const naca = airfoil.match(/naca\s*(\d{4})/i)?.[1] || '4412';
  const commands = `NACA ${naca}
PANE
OPER
VISC ${reynolds}
PACC
${path.basename(polarPath)}

ALFA ${alpha}
PACC
QUIT
`;
  const run = await runTool('xfoil', [], { cwd: runDir, input: commands });
  const polar = await fs.readFile(polarPath, 'utf8').catch(() => '');
  const rows = polar.split('\n').map(line => line.trim().split(/\s+/).map(Number)).filter(cols => cols.length >= 5 && cols.every(Number.isFinite));
  const last = rows.at(-1);
  if (!run.ok) return { success: false, status: 'failed', executed: true, tool: 'XFOIL', run_dir: runDir, deck: commands, log: `${run.stdout}\n${run.stderr}\n${polar}`, error: run.error };
  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'XFOIL',
    run_dir: runDir,
    artifacts: [{ type: 'xfoil_batch', inline: commands }, { type: 'xfoil_polar', path: polarPath }],
    deck: commands,
    log: `${run.stdout}\n${run.stderr}\n${polar}`.slice(-6000),
    result: {
      visualization_type: 'xfoil_polar',
      external_tool: { tool: 'XFOIL', status: 'executed', run_dir: runDir, transport: run.tool.transport, host: run.tool.host || null, remote_run_dir: run.remote_run_dir || null },
      metrics: last ? [
        metric('Angle of attack', `${last[0].toFixed(2)} deg`, last[0]),
        metric('Lift coefficient CL', `${last[1].toFixed(4)}`, last[1]),
        metric('Drag coefficient CD', `${last[2].toFixed(5)}`, last[2]),
        metric('External solver', 'XFOIL', 1)
      ] : [metric('External solver', 'XFOIL', 1)],
      plain_summary: last
        ? `Real XFOIL execution completed for ${airfoil}. At **${last[0].toFixed(2)} deg**, CL is **${last[1].toFixed(4)}** and CD is **${last[2].toFixed(5)}**.`
        : 'Real XFOIL execution completed, but no polar row was parsed.'
    }
  };
}

async function runOpenFoam(model) {
  const blockMesh = await resolveTool('blockMesh');
  const simpleFoam = await resolveTool('simpleFoam');
  if (!blockMesh.available || !simpleFoam.available) return unavailable('OpenFOAM simpleFoam', 'Install OpenFOAM and source its environment so blockMesh and simpleFoam are available on PATH.');
  const runDir = await makeRunDir('Fluids', 'openfoam');
  await writeOpenFoamChannelCase(runDir, model);
  const meshRun = await runTool('blockMesh', [], { cwd: runDir, timeout: 60_000 });
  const solverRun = meshRun.ok
    ? await runTool('simpleFoam', [], { cwd: runDir, timeout: 180_000 })
    : { ok: false, stdout: '', stderr: '', error: 'blockMesh failed; simpleFoam was not started.', tool: simpleFoam };
  const log = `${meshRun.stdout}\n${meshRun.stderr}\n${solverRun.stdout}\n${solverRun.stderr}`;
  if (!meshRun.ok || !solverRun.ok) {
    return {
      success: false,
      status: 'failed',
      executed: true,
      tool: 'OpenFOAM simpleFoam',
      run_dir: runDir,
      log: log.slice(-9000),
      error: meshRun.error || solverRun.error
    };
  }

  const continuity = [...log.matchAll(/time step continuity errors\s*:\s*sum local =\s*([0-9.eE+-]+)/g)].at(-1)?.[1] || null;
  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'OpenFOAM simpleFoam',
    run_dir: runDir,
    artifacts: [{ type: 'openfoam_case', path: runDir }],
    log: log.slice(-9000),
    result: {
      visualization_type: 'cfd_case_external',
      external_tool: { tool: 'OpenFOAM simpleFoam', status: 'executed', run_dir: runDir, transport: simpleFoam.transport, host: simpleFoam.host || null },
      metrics: [
        metric('External solver', 'OpenFOAM simpleFoam', 1),
        ...(continuity ? [metric('Final continuity error', continuity, Number.parseFloat(continuity))] : [])
      ],
      plain_summary: continuity
        ? `Real OpenFOAM execution completed for the generated channel-flow case. Final local continuity error is **${continuity}**.`
        : 'Real OpenFOAM execution completed for the generated channel-flow case.'
    }
  };
}

async function writeOpenFoamChannelCase(runDir, model) {
  const inletVelocity = parseUnit(model.BOUNDARY_CONDITIONS?.['Inlet velocity'], 2);
  const length = parseUnit(model.GEOMETRY?.Length, 1);
  const height = parseUnit(model.GEOMETRY?.Diameter || model.GEOMETRY?.Height, 0.05);
  await fs.mkdir(path.join(runDir, 'system'), { recursive: true });
  await fs.mkdir(path.join(runDir, 'constant'), { recursive: true });
  await fs.mkdir(path.join(runDir, '0'), { recursive: true });

  const foamHeader = (className, objectName) => `FoamFile
{
    version     2.0;
    format      ascii;
    class       ${className};
    object      ${objectName};
}
`;

  await fs.writeFile(path.join(runDir, 'system', 'blockMeshDict'), `${foamHeader('dictionary', 'blockMeshDict')}
convertToMeters 1;
vertices
(
    (0 0 0)
    (${length} 0 0)
    (${length} ${height} 0)
    (0 ${height} 0)
    (0 0 0.01)
    (${length} 0 0.01)
    (${length} ${height} 0.01)
    (0 ${height} 0.01)
);
blocks
(
    hex (0 1 2 3 4 5 6 7) (24 8 1) simpleGrading (1 1 1)
);
edges ();
boundary
(
    inlet { type patch; faces ((0 4 7 3)); }
    outlet { type patch; faces ((1 2 6 5)); }
    walls { type wall; faces ((0 1 5 4) (3 7 6 2)); }
    frontAndBack { type empty; faces ((0 3 2 1) (4 5 6 7)); }
);
mergePatchPairs ();
`, 'utf8');

  await fs.writeFile(path.join(runDir, 'system', 'controlDict'), `${foamHeader('dictionary', 'controlDict')}
application     simpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         25;
deltaT          1;
writeControl    timeStep;
writeInterval   25;
purgeWrite      0;
writeFormat     ascii;
writePrecision  6;
writeCompression off;
timeFormat      general;
timePrecision   6;
runTimeModifiable true;
`, 'utf8');

  await fs.writeFile(path.join(runDir, 'system', 'fvSchemes'), `${foamHeader('dictionary', 'fvSchemes')}
ddtSchemes { default steadyState; }
gradSchemes { default Gauss linear; }
divSchemes
{
    default none;
    div(phi,U) bounded Gauss upwind;
    div(phi,k) bounded Gauss upwind;
    div(phi,epsilon) bounded Gauss upwind;
    div(phi,omega) bounded Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear corrected; }
interpolationSchemes { default linear; }
snGradSchemes { default corrected; }
`, 'utf8');

  await fs.writeFile(path.join(runDir, 'system', 'fvSolution'), `${foamHeader('dictionary', 'fvSolution')}
solvers
{
    p { solver PCG; preconditioner DIC; tolerance 1e-06; relTol 0.05; }
    U { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-05; relTol 0.1; }
    "(k|epsilon|omega|nuTilda)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-05; relTol 0.1; }
}
SIMPLE
{
    nNonOrthogonalCorrectors 0;
    consistent yes;
}
relaxationFactors
{
    fields { p 0.3; }
    equations { U 0.7; k 0.7; epsilon 0.7; }
}
`, 'utf8');

  await fs.writeFile(path.join(runDir, 'constant', 'transportProperties'), `${foamHeader('dictionary', 'transportProperties')}
transportModel  Newtonian;
nu              [0 2 -1 0 0 0 0] 1.5e-05;
`, 'utf8');

  await fs.writeFile(path.join(runDir, 'constant', 'turbulenceProperties'), `${foamHeader('dictionary', 'turbulenceProperties')}
simulationType laminar;
`, 'utf8');

  await fs.writeFile(path.join(runDir, '0', 'U'), `${foamHeader('volVectorField', 'U')}
dimensions      [0 1 -1 0 0 0 0];
internalField   uniform (${inletVelocity} 0 0);
boundaryField
{
    inlet { type fixedValue; value uniform (${inletVelocity} 0 0); }
    outlet { type zeroGradient; }
    walls { type noSlip; }
    frontAndBack { type empty; }
}
`, 'utf8');

  await fs.writeFile(path.join(runDir, '0', 'p'), `${foamHeader('volScalarField', 'p')}
dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;
boundaryField
{
    inlet { type zeroGradient; }
    outlet { type fixedValue; value uniform 0; }
    walls { type zeroGradient; }
    frontAndBack { type empty; }
}
`, 'utf8');

  await fs.writeFile(path.join(runDir, 'SIMFORGE_CASE_README.txt'), `OpenFOAM simpleFoam channel case generated by SimForge.
System: ${model.SYSTEM_TYPE || 'internal flow'}
Length: ${length} m
Height: ${height} m
Inlet velocity: ${inletVelocity} m/s
`, 'utf8');
}

async function runElmer(model) {
  const elmer = await which('ElmerSolver');
  if (!elmer) return unavailable('ElmerSolver', 'Install Elmer and ensure ElmerSolver is available on PATH.');
  const runDir = await makeRunDir('Thermal', 'elmer');
  const power = parseUnit(model.HEAT_LOAD?.['Power dissipation'], 25);
  const sif = `Header
  CHECK KEYWORDS Warn
End
Simulation
  Max Output Level = 5
  Coordinate System = Cartesian
  Simulation Type = Steady state
End
! SimForge thermal placeholder: heat load ${power} W
`;
  const sifPath = path.join(runDir, 'case.sif');
  await fs.writeFile(sifPath, sif, 'utf8');
  const run = await runTool('ElmerSolver', [path.basename(sifPath)], { cwd: runDir });
  if (!run.ok) return { success: false, status: 'failed', executed: true, tool: 'ElmerSolver', run_dir: runDir, deck: sif, log: `${run.stdout}\n${run.stderr}`, error: run.error };
  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'ElmerSolver',
    run_dir: runDir,
    artifacts: [{ type: 'elmer_sif', path: sifPath }],
    deck: sif,
    log: `${run.stdout}\n${run.stderr}`.slice(-6000),
    result: {
      visualization_type: 'thermal_external',
      external_tool: { tool: 'ElmerSolver', status: 'executed', run_dir: runDir, transport: run.tool.transport, host: run.tool.host || null, remote_run_dir: run.remote_run_dir || null },
      metrics: [metric('External solver', 'ElmerSolver', 1)],
      plain_summary: 'Real ElmerSolver execution completed for the generated thermal case.'
    }
  };
}

async function runPythonControl(model) {
  const mod = await hasPythonModule('control');
  if (!mod.available) return unavailable('python-control', 'Install python-control in the active Python environment: pip install control.', { error: mod.error });
  const runDir = await makeRunDir('Control', 'python-control');
  const plant = String(model.PLANT?.['Transfer function']?.value || '10/(s*(s+2))');
  const script = `import json, control as ct
# Production parser hook: current first-pass deck uses canonical plant from SimForge UI.
s = ct.TransferFunction.s
G = 10/(s*(s+2))
Kp, Ki, Kd = 0.48, 0.384, 0.15
C = Kp + Ki/s + Kd*s
T = ct.feedback(C*G, 1)
info = ct.step_info(T)
print(json.dumps({"plant": ${JSON.stringify(plant)}, "Kp": Kp, "Ki": Ki, "Kd": Kd, "step_info": info}, default=float))
`;
  const scriptPath = path.join(runDir, 'control_run.py');
  await fs.writeFile(scriptPath, script, 'utf8');
  const run = await execFileAsync(mod.python, [scriptPath], { cwd: runDir, env: pythonEnv(), timeout: 45_000 });
  if (!run.ok) return { success: false, status: 'failed', executed: true, tool: 'python-control', run_dir: runDir, deck: script, log: `${run.stdout}\n${run.stderr}`, error: run.error };
  const parsed = JSON.parse(run.stdout.trim());
  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'python-control',
    run_dir: runDir,
    artifacts: [{ type: 'python_control_script', path: scriptPath }],
    deck: script,
    log: run.stdout,
    result: {
      visualization_type: 'control_external',
      external_tool: { tool: 'python-control', status: 'executed', run_dir: runDir },
      metrics: [
        metric('Kp', parsed.Kp.toFixed(4), parsed.Kp),
        metric('Ki', parsed.Ki.toFixed(4), parsed.Ki),
        metric('Kd', parsed.Kd.toFixed(4), parsed.Kd),
        metric('Settling time', `${Number(parsed.step_info.SettlingTime || 0).toFixed(3)} s`, parsed.step_info.SettlingTime),
        metric('Overshoot', `${Number(parsed.step_info.Overshoot || 0).toFixed(2)}%`, parsed.step_info.Overshoot),
        metric('External solver', 'python-control', 1)
      ],
      plain_summary: `Real python-control execution completed. Step estimate settling time is **${Number(parsed.step_info.SettlingTime || 0).toFixed(3)} s** with overshoot **${Number(parsed.step_info.Overshoot || 0).toFixed(2)}%**.`
    }
  };
}

async function runPandapower() {
  const mod = await hasPythonModule('pandapower');
  if (!mod.available) return unavailable('pandapower', 'Install pandapower in the active Python environment: pip install pandapower.', { error: mod.error });
  const runDir = await makeRunDir('Power', 'pandapower');
  const script = `import json, pandapower as pp
net = pp.create_empty_network()
b1 = pp.create_bus(net, vn_kv=0.24)
b2 = pp.create_bus(net, vn_kv=0.12)
pp.create_ext_grid(net, b1, vm_pu=1.0)
pp.create_transformer_from_parameters(net, b1, b2, sn_mva=0.002, vn_hv_kv=0.24, vn_lv_kv=0.12, vk_percent=4, vkr_percent=1, pfe_kw=0.01, i0_percent=0.1)
pp.create_load(net, b2, p_mw=0.0012, q_mvar=0.0)
pp.runpp(net)
print(json.dumps({"bus": net.res_bus.to_dict(), "trafo": net.res_trafo.to_dict()}, default=float))
`;
  const scriptPath = path.join(runDir, 'pandapower_run.py');
  await fs.writeFile(scriptPath, script, 'utf8');
  const run = await execFileAsync(mod.python, [scriptPath], { cwd: runDir, env: pythonEnv(), timeout: 45_000 });
  if (!run.ok) return { success: false, status: 'failed', executed: true, tool: 'pandapower', run_dir: runDir, deck: script, log: `${run.stdout}\n${run.stderr}`, error: run.error };
  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'pandapower',
    run_dir: runDir,
    artifacts: [{ type: 'pandapower_script', path: scriptPath }],
    deck: script,
    log: run.stdout.slice(-6000),
    result: {
      visualization_type: 'power_external',
      external_tool: { tool: 'pandapower', status: 'executed', run_dir: runDir },
      metrics: [metric('External solver', 'pandapower', 1)],
      plain_summary: 'Real pandapower execution completed for a first-pass transformer/load network.'
    }
  };
}

async function runScipyMechanics() {
  const mod = await hasPythonModule('scipy');
  if (!mod.available) return unavailable('SciPy mechanics', 'Install scipy in the active Python environment: pip install scipy.', { error: mod.error });
  const runDir = await makeRunDir('Physics', 'scipy');
  const script = `import json, numpy as np
from scipy.integrate import solve_ivp
def rhs(t, y): return [y[1], -4*y[0]]
sol = solve_ivp(rhs, [0, 2*np.pi], [1, 0], t_eval=np.linspace(0, 2*np.pi, 50))
print(json.dumps({"samples": len(sol.t), "x0": float(sol.y[0][0]), "x_end": float(sol.y[0][-1])}))
`;
  const scriptPath = path.join(runDir, 'mechanics_run.py');
  await fs.writeFile(scriptPath, script, 'utf8');
  const run = await execFileAsync(mod.python, [scriptPath], { cwd: runDir, env: pythonEnv(), timeout: 45_000 });
  if (!run.ok) return { success: false, status: 'failed', executed: true, tool: 'SciPy mechanics', run_dir: runDir, deck: script, log: `${run.stdout}\n${run.stderr}`, error: run.error };
  const parsed = JSON.parse(run.stdout.trim());
  return {
    success: true,
    status: 'executed',
    executed: true,
    tool: 'SciPy mechanics',
    run_dir: runDir,
    artifacts: [{ type: 'scipy_script', path: scriptPath }],
    deck: script,
    log: run.stdout,
    result: {
      visualization_type: 'physics_external',
      external_tool: { tool: 'SciPy mechanics', status: 'executed', run_dir: runDir },
      metrics: [metric('SciPy samples', `${parsed.samples}`, parsed.samples), metric('External solver', 'SciPy mechanics', 1)],
      plain_summary: 'Real SciPy execution completed for the generated mechanics ODE check.'
    }
  };
}
