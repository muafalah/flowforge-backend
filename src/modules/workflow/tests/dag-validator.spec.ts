import {
  validateDag,
  topologicalSort,
  type DagDefinition,
} from '../utils/dag-validator';

describe('DAG Validator', () => {
  describe('validateDag', () => {
    it('should validate a simple valid DAG', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'step1', type: 'http' },
          { id: 'step2', type: 'script' },
          { id: 'step3', type: 'transform' },
        ],
        edges: [
          { from: 'step1', to: 'step2' },
          { from: 'step2', to: 'step3' },
        ],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.executionOrder).toEqual(['step1', 'step2', 'step3']);
    });

    it('should validate a single-node DAG with no edges', () => {
      const definition: DagDefinition = {
        nodes: [{ id: 'only', type: 'http' }],
        edges: [],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.executionOrder).toEqual(['only']);
    });

    it('should detect duplicate node IDs', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'step1', type: 'http' },
          { id: 'step1', type: 'script' },
        ],
        edges: [],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate node ID: "step1".');
    });

    it('should detect edges referencing non-existent source nodes', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'step1', type: 'http' },
          { id: 'step2', type: 'script' },
        ],
        edges: [{ from: 'nonexistent', to: 'step2' }],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Edge references non-existent source node: "nonexistent".',
      );
    });

    it('should detect edges referencing non-existent target nodes', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'step1', type: 'http' },
          { id: 'step2', type: 'script' },
        ],
        edges: [{ from: 'step1', to: 'missing' }],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Edge references non-existent target node: "missing".',
      );
    });

    it('should detect self-loops', () => {
      const definition: DagDefinition = {
        nodes: [{ id: 'step1', type: 'http' }],
        edges: [{ from: 'step1', to: 'step1' }],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Self-loop detected on node: "step1".');
    });

    it('should detect simple cycles (A → B → A)', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'A', type: 'http' },
          { id: 'B', type: 'script' },
        ],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' },
        ],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Cycle detected');
    });

    it('should detect complex cycles (A → B → C → A)', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'A', type: 'http' },
          { id: 'B', type: 'script' },
          { id: 'C', type: 'transform' },
        ],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'A' },
        ],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Cycle detected');
    });

    it('should validate a diamond-shaped DAG', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'start', type: 'trigger' },
          { id: 'left', type: 'http' },
          { id: 'right', type: 'script' },
          { id: 'merge', type: 'transform' },
        ],
        edges: [
          { from: 'start', to: 'left' },
          { from: 'start', to: 'right' },
          { from: 'left', to: 'merge' },
          { from: 'right', to: 'merge' },
        ],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.executionOrder).toBeDefined();
      // 'start' must come first, 'merge' must come last
      expect(result.executionOrder![0]).toBe('start');
      expect(result.executionOrder![result.executionOrder!.length - 1]).toBe(
        'merge',
      );
    });

    it('should validate a DAG with multiple roots', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'root1', type: 'trigger' },
          { id: 'root2', type: 'trigger' },
          { id: 'sink', type: 'output' },
        ],
        edges: [
          { from: 'root1', to: 'sink' },
          { from: 'root2', to: 'sink' },
        ],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(true);
      expect(result.executionOrder).toBeDefined();
      // Both roots should come before sink
      const sinkIdx = result.executionOrder!.indexOf('sink');
      expect(result.executionOrder!.indexOf('root1')).toBeLessThan(sinkIdx);
      expect(result.executionOrder!.indexOf('root2')).toBeLessThan(sinkIdx);
    });

    it('should handle disconnected nodes', () => {
      const definition: DagDefinition = {
        nodes: [
          { id: 'A', type: 'http' },
          { id: 'B', type: 'script' },
          { id: 'isolated', type: 'transform' },
        ],
        edges: [{ from: 'A', to: 'B' }],
      };

      const result = validateDag(definition);

      expect(result.valid).toBe(true);
      expect(result.executionOrder).toContain('isolated');
    });
  });

  describe('topologicalSort', () => {
    it('should return correct execution order for a linear chain', () => {
      const nodes = [
        { id: '1', type: 'a' },
        { id: '2', type: 'b' },
        { id: '3', type: 'c' },
      ];
      const edges = [
        { from: '1', to: '2' },
        { from: '2', to: '3' },
      ];

      const order = topologicalSort(nodes, edges);
      expect(order).toEqual(['1', '2', '3']);
    });

    it('should return all nodes even with no edges', () => {
      const nodes = [
        { id: 'A', type: 'x' },
        { id: 'B', type: 'y' },
      ];

      const order = topologicalSort(nodes, []);
      expect(order).toHaveLength(2);
      expect(order).toContain('A');
      expect(order).toContain('B');
    });
  });
});
