/**
 * sceneGraphSchemas.js
 * 
 * Domain-specific JSON schemas for structured scene descriptions.
 * The LLM populates these schemas (Stage 1), and the layout engine converts them to SVG (Stage 2).
 */

// ─── CIRCUITS SCENE GRAPH ───────────────────────────────────────────────
export const CIRCUITS_SCENE_SCHEMA = {
  type: "object",
  description: "Circuit schematic scene graph - components and their connections",
  properties: {
    components: {
      type: "array",
      description: "List of circuit components in left-to-right signal path order",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique component identifier (e.g., R1, C1, V1)" },
          type: { 
            type: "string", 
            enum: ["resistor", "capacitor", "inductor", "voltage_source", "current_source", "ground", "wire", "node"],
            description: "Component type"
          },
          value: { type: "string", description: "Component value with units (e.g., '10kΩ', '100µF', '12V')" },
          connects_to: { 
            type: "array", 
            items: { type: "string" },
            description: "List of component IDs this connects to (topological connections)"
          },
          position_hint: {
            type: "string",
            enum: ["left", "center", "right", "top", "bottom"],
            description: "Optional spatial hint for layout"
          }
        },
        required: ["id", "type"]
      }
    },
    nodes: {
      type: "array",
      description: "Junction points where multiple components connect",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Node identifier (e.g., N1, N2)" },
          voltage: { type: "string", description: "Node voltage if known (e.g., '6V', 'unknown')" },
          connects_to: {
            type: "array",
            items: { type: "string" },
            description: "Component IDs connected to this node"
          }
        },
        required: ["id"]
      }
    }
  },
  required: ["components"]
};

// ─── PHYSICS SCENE GRAPH ─────────────────────────────────────────────────
export const PHYSICS_SCENE_SCHEMA = {
  type: "object",
  description: "Physics mechanics scene graph - bodies, forces, and constraints",
  properties: {
    bodies: {
      type: "array",
      description: "Physical objects (masses, blocks, particles)",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique body identifier (e.g., m1, block1)" },
          mass: { type: "string", description: "Mass with units (e.g., '2kg', '500g')" },
          position_description: {
            type: "string",
            enum: ["on_incline", "on_surface", "hanging", "free", "attached_to_spring", "on_pulley"],
            description: "Where the body is positioned"
          },
          connects_to: {
            type: "array",
            items: { type: "string" },
            description: "Other body IDs or constraint IDs this connects to"
          }
        },
        required: ["id", "mass", "position_description"]
      }
    },
    forces: {
      type: "array",
      description: "Forces acting on bodies",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique force identifier (e.g., F1, N1, W1)" },
          type: {
            type: "string",
            enum: ["gravity", "normal", "friction", "applied", "tension", "spring_force"],
            description: "Force type"
          },
          magnitude: { type: "string", description: "Force magnitude with units (e.g., '49N', '10N')" },
          direction: {
            type: "string",
            description: "Direction in degrees or semantic (e.g., '270°', 'vertical down', 'perpendicular to surface')"
          },
          acts_on: { type: "string", description: "Body ID this force acts on" }
        },
        required: ["id", "type", "acts_on"]
      }
    },
    constraints: {
      type: "array",
      description: "Surfaces, pulleys, springs, and other constraints",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique constraint identifier" },
          type: {
            type: "string",
            enum: ["incline", "surface", "pulley", "spring", "wall", "floor"],
            description: "Constraint type"
          },
          angle: { type: "string", description: "Angle if applicable (e.g., '30°')" },
          coefficient: { type: "string", description: "Friction coefficient if applicable (e.g., '0.3')" },
          connects_to: {
            type: "array",
            items: { type: "string" },
            description: "Body IDs connected to this constraint"
          }
        },
        required: ["id", "type"]
      }
    }
  },
  required: ["bodies"]
};

// ─── STRUCTURAL SCENE GRAPH ─────────────────────────────────────────────
export const STRUCTURAL_SCENE_SCHEMA = {
  type: "object",
  description: "Structural engineering scene graph - beams, supports, loads",
  properties: {
    beam: {
      type: "object",
      properties: {
        span: { type: "string", description: "Beam length with units (e.g., '6m', '10ft')" },
        type: {
          type: "string",
          enum: ["simply_supported", "cantilever", "fixed_fixed", "fixed_pinned"],
          description: "Beam support configuration"
        }
      },
      required: ["span", "type"]
    },
    supports: {
      type: "array",
      description: "Support locations and types",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Support identifier" },
          type: {
            type: "string",
            enum: ["fixed", "pinned", "roller", "free"],
            description: "Support type"
          },
          position: {
            type: "string",
            enum: ["left", "right", "center"],
            description: "Position along beam"
          },
          reaction: { type: "string", description: "Reaction force if known (e.g., '10kN')" }
        },
        required: ["id", "type", "position"]
      }
    },
    loads: {
      type: "array",
      description: "Point loads and distributed loads",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Load identifier" },
          type: {
            type: "string",
            enum: ["point", "distributed", "moment"],
            description: "Load type"
          },
          magnitude: { type: "string", description: "Load magnitude with units (e.g., '20kN', '5kN/m')" },
          position: {
            type: "string",
            description: "Position along beam (e.g., 'midspan', '2m from left', 'left end')"
          },
          direction: {
            type: "string",
            enum: ["down", "up", "left", "right"],
            description: "Load direction"
          }
        },
        required: ["id", "type", "magnitude"]
      }
    }
  },
  required: ["beam", "supports"]
};

// ─── FLUIDS SCENE GRAPH ─────────────────────────────────────────────────
export const FLUIDS_SCENE_SCHEMA = {
  type: "object",
  description: "Fluid dynamics scene graph - pipes, components, flow",
  properties: {
    pipe_segments: {
      type: "array",
      description: "Pipe sections",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Segment identifier" },
          diameter: { type: "string", description: "Pipe diameter with units (e.g., '50mm', '2in')" },
          length: { type: "string", description: "Segment length if relevant" },
          connects_to: {
            type: "array",
            items: { type: "string" },
            description: "Other segment IDs or component IDs this connects to"
          }
        },
        required: ["id", "diameter"]
      }
    },
    components: {
      type: "array",
      description: "Pumps, valves, junctions, etc.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Component identifier" },
          type: {
            type: "string",
            enum: ["pump", "valve", "junction", "expansion", "contraction", "elbow"],
            description: "Component type"
          },
          position_hint: {
            type: "string",
            enum: ["inlet", "outlet", "middle"],
            description: "Position along flow path"
          },
          connects_to: {
            type: "array",
            items: { type: "string" },
            description: "Pipe segment IDs this connects to"
          },
          value: { type: "string", description: "Component value if applicable (e.g., pressure, flow rate)" }
        },
        required: ["id", "type"]
      }
    },
    flow: {
      type: "object",
      properties: {
        velocity: { type: "string", description: "Flow velocity with units (e.g., '2 m/s')" },
        direction: {
          type: "string",
          enum: ["left_to_right", "right_to_left"],
          description: "Flow direction"
        },
        inlet_pressure: { type: "string", description: "Pressure at inlet (e.g., '100 Pa')" },
        outlet_pressure: { type: "string", description: "Pressure at outlet (e.g., '50 Pa')" }
      },
      required: ["direction"]
    }
  },
  required: ["pipe_segments"]
};

// ─── GENERIC/CREATIVE SCENE GRAPH ───────────────────────────────────────
export const GENERIC_SCENE_SCHEMA = {
  type: "object",
  description: "Generic scene graph for novel/custom diagrams not fitting standard domains",
  properties: {
    elements: {
      type: "array",
      description: "Arbitrary diagram elements",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique element identifier" },
          shape: {
            type: "string",
            enum: ["box", "circle", "arrow", "line", "triangle", "diamond"],
            description: "Shape type"
          },
          semantic_role: { type: "string", description: "What this element represents (e.g., 'motor', 'sensor', 'controller')" },
          label: { type: "string", description: "Text label for this element" },
          value: { type: "string", description: "Value with units if applicable" },
          connects_to: {
            type: "array",
            items: { type: "string" },
            description: "Other element IDs this connects to"
          },
          position_hint: {
            type: "string",
            enum: ["left", "center", "right", "top", "bottom"],
            description: "Optional spatial hint"
          }
        },
        required: ["id", "shape", "semantic_role"]
      }
    },
    title: { type: "string", description: "Diagram title" }
  },
  required: ["elements"]
};

// ─── SCHEMA EXPORT MAP ─────────────────────────────────────────────────
export const SCENE_SCHEMAS = {
  Circuits: CIRCUITS_SCENE_SCHEMA,
  Physics: PHYSICS_SCENE_SCHEMA,
  Structural: STRUCTURAL_SCENE_SCHEMA,
  Fluids: FLUIDS_SCENE_SCHEMA,
  Generic: GENERIC_SCENE_SCHEMA
};
