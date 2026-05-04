import { z } from 'zod';

// --- Zod Schemas for DAG Structure ---

export const dagNodeSchema = z.object({
  id: z.string().min(1, 'Node ID must not be empty.'),
  name: z.string().min(1, 'Node name must not be empty.'),
  description: z.string().optional(),
  type: z.string().min(1, 'Node type must not be empty.'),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const dagEdgeSchema = z.object({
  from: z.string().min(1, 'Edge source must not be empty.'),
  to: z.string().min(1, 'Edge target must not be empty.'),
  condition: z.string().optional(),
});

export const dagDefinitionSchema = z.object({
  nodes: z
    .array(dagNodeSchema)
    .min(1, 'DAG must have at least one node.')
    .max(100, 'DAG cannot have more than 100 nodes.'),
  edges: z
    .array(dagEdgeSchema)
    .max(500, 'DAG cannot have more than 500 edges.')
    .default([]),
});

export type DagNode = z.infer<typeof dagNodeSchema>;
export type DagEdge = z.infer<typeof dagEdgeSchema>;
export type DagDefinition = z.infer<typeof dagDefinitionSchema>;

// --- Validation Result ---

export interface DagValidationResult {
  valid: boolean;
  errors: string[];
  executionOrder?: string[];
}

// --- Validation Functions ---

/**
 * Check for duplicate node IDs in the DAG.
 */
function checkDuplicateNodeIds(nodes: DagNode[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (seen.has(node.id)) {
      errors.push(`Duplicate node ID: "${node.id}".`);
    }
    seen.add(node.id);
  }

  return errors;
}

/**
 * Check that all edge endpoints reference valid node IDs.
 */
function checkEdgeReferences(nodes: DagNode[], edges: DagEdge[]): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge references non-existent source node: "${edge.from}".`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge references non-existent target node: "${edge.to}".`);
    }
    if (edge.from === edge.to) {
      errors.push(`Self-loop detected on node: "${edge.from}".`);
    }
  }

  return errors;
}

/**
 * Detect cycles in the DAG using DFS with three-color marking.
 * WHITE = unvisited, GRAY = in current path, BLACK = fully processed.
 */
function detectCycles(nodes: DagNode[], edges: DagEdge[]): string[] {
  const errors: string[] = [];
  const adjacency = new Map<string, string[]>();

  // Build adjacency list
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    const neighbors = adjacency.get(edge.from);
    if (neighbors) {
      neighbors.push(edge.to);
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  for (const node of nodes) {
    color.set(node.id, WHITE);
  }

  function dfs(nodeId: string, path: string[]): boolean {
    color.set(nodeId, GRAY);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (color.get(neighbor) === GRAY) {
        // Found a cycle — extract the cycle from the path
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStart).concat(neighbor);
        errors.push(`Cycle detected: ${cyclePath.join(' → ')}.`);
        return true;
      }
      if (color.get(neighbor) === WHITE) {
        if (dfs(neighbor, path)) {
          return true;
        }
      }
    }

    path.pop();
    color.set(nodeId, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      dfs(node.id, []);
    }
  }

  return errors;
}

/**
 * Perform topological sort using Kahn's algorithm.
 * Returns the execution order of node IDs.
 * Assumes the graph is acyclic (call after cycle detection).
 */
export function topologicalSort(nodes: DagNode[], edges: DagEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const neighbors = adjacency.get(edge.from);
    if (neighbors) {
      neighbors.push(edge.to);
    }
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  // Start with all nodes having in-degree 0
  const queue: string[] = [];
  for (const node of nodes) {
    if (inDegree.get(node.id) === 0) {
      queue.push(node.id);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return order;
}

/**
 * Main validation function for DAG definitions.
 * Validates structure, uniqueness, references, acyclicity,
 * and returns the topological execution order on success.
 */
export function validateDag(definition: DagDefinition): DagValidationResult {
  const errors: string[] = [];

  // 1. Check for duplicate node IDs
  errors.push(...checkDuplicateNodeIds(definition.nodes));

  // 2. Check edge references (only if no duplicate IDs)
  if (errors.length === 0) {
    errors.push(...checkEdgeReferences(definition.nodes, definition.edges));
  }

  // 3. Cycle detection (only if edges are valid)
  if (errors.length === 0 && definition.edges.length > 0) {
    errors.push(...detectCycles(definition.nodes, definition.edges));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 4. Topological sort for execution order
  const executionOrder = topologicalSort(definition.nodes, definition.edges);

  return {
    valid: true,
    errors: [],
    executionOrder,
  };
}
