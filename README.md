# SimForge

SimForge is a chat-driven engineering simulation playground. The chat pane acts as the controller: it formulates models, updates parameters, calls the Groq engineering brain, runs deterministic solvers, and sends results to the Model and Results panes.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and add your Groq key:

```bash
cp .env.example .env
```

3. Start the local API server:

```bash
npm run dev:api
```

4. Start the Vite app in a second terminal:

```bash
npm run dev
```

The frontend proxies `/api/*` requests to `http://127.0.0.1:8787`.

## LLM Backend

- Active provider: Groq
- Default model: `llama-3.3-70b-versatile`
- Coming soon: Claude, GPT, Gemini

The API key is loaded only from `.env`. Do not commit `.env`.

## Verification

```bash
npm run build
curl -s http://127.0.0.1:8787/api/health
curl -s http://127.0.0.1:8787/api/providers
```

## Solver VM Bridge

SimForge can run lightweight solvers directly on macOS and dispatch VM-hosted solvers over SSH. The default local paths match the verified macOS setup:

```bash
SIMFORGE_NGSPICE_PATH=/opt/homebrew/bin/ngspice
SIMFORGE_PYTHON3_PATH=/Users/shivamkumarsingh/Documents/siva/.venv-solvers/bin/python
```

Configure the Ubuntu VM bridge in `.env`:

```bash
SIMFORGE_REMOTE_SOLVER_HOST=ubuntu-user@vm-host-or-ip
SIMFORGE_REMOTE_SOLVER_PORT=22
SIMFORGE_REMOTE_SOLVER_KEY=/absolute/path/to/private_key
SIMFORGE_REMOTE_SOLVER_ROOT=/tmp/simforge-jobs
SIMFORGE_REMOTE_SOLVER_TOOLS=ccx,xfoil,blockMesh,simpleFoam,ElmerSolver
SIMFORGE_REMOTE_CCX_PATH=/usr/bin/ccx
SIMFORGE_REMOTE_XFOIL_PATH=/usr/bin/xfoil
SIMFORGE_REMOTE_BLOCKMESH_PATH=/usr/bin/blockMesh
SIMFORGE_REMOTE_SIMPLEFOAM_PATH=/usr/bin/simpleFoam
SIMFORGE_REMOTE_ELMERSOLVER_PATH=/usr/local/bin/ElmerSolver
```

When enabled, SimForge checks local PATH first, then the configured VM for the listed tools. Solver job folders are generated on macOS, copied to the VM, executed there, and copied back so artifacts remain available to the API.

The current bridge dispatches:

- CalculiX: generated `.inp` deck, `ccx simforge`, copied `.dat` output.
- XFOIL: generated command batch, polar file copied back and parsed.
- ElmerFEM: generated `.sif` case, `ElmerSolver case.sif`.
- OpenFOAM: generated minimal channel-flow case, `blockMesh`, then `simpleFoam`.

If OpenFOAM requires environment setup on the VM, add a shell setup command:

```bash
SIMFORGE_REMOTE_SOLVER_SETUP=. /opt/openfoam*/etc/bashrc
```

Verify bridge visibility with:

```bash
curl -s http://127.0.0.1:8787/api/solver-capabilities
```

## Notes

Some high-risk benchmark prompts use deterministic guardrails before the LLM response. This prevents polished but physically invalid answers for known engineering traps such as loaded RC filter design.
# SimForge
