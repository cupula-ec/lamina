import React from 'react';

interface NodeData {
  id: string;
  label: string;
  probability?: number;
  branches?: BranchData[];
}

interface BranchData {
  label: string;
  probability?: number;
  child: NodeData;
}

interface Props {
  root: NodeData;
  orientation?: 'horizontal' | 'vertical';
  showProbabilities?: boolean;
  showLabels?: boolean;
  nodeRadius?: number;
  branchLength?: number;
  fontSize?: number;
  highlightPath?: string[];
}

export default function ProbabilityTree({
  props,
  size
}: {
  props: Props;
  size: { width: number; height: number };
}) {
  const {
    root,
    orientation = 'horizontal',
    showProbabilities = true,
    showLabels = true,
    nodeRadius = 28,
    branchLength = 220,
    fontSize = 26,
    highlightPath = []
  } = props;

  const { width, height } = size;

  // Compute positions recursively
  const positions = new Map<string, { x: number; y: number }>();
  const maxDepth = getMaxDepth(root);
  const depthCount = new Map<number, number>();

  function getMaxDepth(node: NodeData, depth = 0): number {
    if (!node.branches || node.branches.length === 0) return depth;
    return Math.max(...node.branches.map(b => getMaxDepth(b.child, depth + 1)));
  }

  function layout(node: NodeData, depth = 0, index = 0, parentPos?: { x: number; y: number }) {
    const horizontal = orientation === 'horizontal';
    const spacing = horizontal ? branchLength : branchLength;
    const start = horizontal ? nodeRadius * 2 : height / 2 - (maxDepth * spacing) / 2;
    let x, y;
    if (horizontal) {
      x = nodeRadius * 2 + depth * spacing;
      // vertical distribution
      const totalAtDepth = countNodesAtDepth(root, depth);
      const offset = (height - nodeRadius * 4) / (totalAtDepth + 1);
      y = nodeRadius * 2 + (index + 1) * offset;
    } else {
      y = nodeRadius * 2 + depth * spacing;
      const totalAtDepth = countNodesAtDepth(root, depth);
      const offset = (width - nodeRadius * 4) / (totalAtDepth + 1);
      x = nodeRadius * 2 + (index + 1) * offset;
    }
    positions.set(node.id, { x, y });
    if (node.branches) {
      node.branches.forEach((branch, i) => {
        layout(branch.child, depth + 1, i, { x, y });
      });
    }
  }

  function countNodesAtDepth(node: NodeData, targetDepth: number, currentDepth = 0): number {
    if (currentDepth === targetDepth) return 1;
    if (!node.branches) return 0;
    return node.branches.reduce((sum, b) => sum + countNodesAtDepth(b.child, targetDepth, currentDepth + 1), 0);
  }

  // Run layout
  layout(root);

  // Draw branches and nodes
  const branchElements: React.ReactNode[] = [];
  const nodeElements: React.ReactNode[] = [];
  const labelElements: React.ReactNode[] = [];
  const probElements: React.ReactNode[] = [];

  function draw(node: NodeData, parentPos?: { x: number; y: number }, branchLabel?: string, branchProb?: number) {
    const pos = positions.get(node.id)!;
    const highlighted = highlightPath.includes(node.id);
    // Branch line
    if (parentPos) {
      branchElements.push(
        <line
          key={`branch-${node.id}`}
          x1={parentPos.x}
          y1={parentPos.y}
          x2={pos.x}
          y2={pos.y}
          stroke={highlighted ? 'var(--lm-accent)' : 'var(--lm-ink)'}
          strokeWidth={highlighted ? 3 : 2}
          strokeLinecap="round"
        />
      );
      // Branch label and probability
      const midX = (parentPos.x + pos.x) / 2;
      const midY = (parentPos.y + pos.y) / 2;
      if (showLabels && branchLabel) {
        labelElements.push(
          <text
            key={`label-${node.id}`}
            x={midX}
            y={midY - 8}
            textAnchor="middle"
            fontSize={fontSize * 0.8}
            fill="var(--lm-ink)"
            fontFamily="var(--lm-font-body)"
          >
            {branchLabel}
          </text>
        );
      }
      if (showProbabilities && branchProb !== undefined) {
        probElements.push(
          <text
            key={`prob-${node.id}`}
            x={midX}
            y={midY + 12}
            textAnchor="middle"
            fontSize={fontSize * 0.7}
            fill="var(--lm-accent)"
            fontFamily="var(--lm-font-body)"
          >
            {branchProb.toFixed(2)}
          </text>
        );
      }
    }
    // Node circle
    nodeElements.push(
      <circle
        key={`node-${node.id}`}
        cx={pos.x}
        cy={pos.y}
        r={nodeRadius}
        fill={highlighted ? 'var(--lm-accent)' : 'var(--lm-bg)'}
        stroke={highlighted ? 'var(--lm-accent2)' : 'var(--lm-ink)'}
        strokeWidth={highlighted ? 3 : 2}
      />
    );
    // Node label
    if (showLabels) {
      nodeElements.push(
        <text
          key={`node-label-${node.id}`}
          x={pos.x}
          y={pos.y + fontSize / 3}
          textAnchor="middle"
          fontSize={fontSize}
          fill={highlighted ? 'var(--lm-bg)' : 'var(--lm-ink)'}
          fontFamily="var(--lm-font-display)"
        >
          {node.label}
        </text>
      );
    }
    // Node probability
    if (showProbabilities && node.probability !== undefined) {
      nodeElements.push(
        <text
          key={`node-prob-${node.id}`}
          x={pos.x}
          y={pos.y + nodeRadius + fontSize}
          textAnchor="middle"
          fontSize={fontSize * 0.7}
          fill="var(--lm-accent)"
          fontFamily="var(--lm-font-body)"
        >
          {node.probability.toFixed(2)}
        </text>
      );
    }
    if (node.branches) {
      node.branches.forEach(b => draw(b.child, pos, b.label, b.probability));
    }
  }

  draw(root);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ background: 'var(--lm-bg)', fontFamily: 'var(--lm-font-body)' }}>
      <defs>
        <marker
          id="arrowhead"
          markerWidth={10}
          markerHeight={7}
          refX={nodeRadius}
          refY={3.5}
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--lm-ink)" />
        </marker>
      </defs>
      <g>{branchElements}</g>
      <g>{labelElements}</g>
      <g>{probElements}</g>
      <g>{nodeElements}</g>
    </svg>
  );
}
