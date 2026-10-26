import React from 'react';

export default function VennDiagram({
  props,
  size
}: {
  props: {
    setA: string;
    setB: string;
    onlyA: number;
    onlyB: number;
    intersection: number;
    neither: number;
  };
  size: { width: number; height: number };
}) {
  const { setA, setB, onlyA, onlyB, intersection, neither } = props;
  const { width, height } = size;

  // Geometry
  const radius = Math.min(width, height) * 0.28;
  const centerY = height / 2;
  const offset = radius * 0.55; // overlap amount
  const centerAx = width / 2 - offset;
  const centerBx = width / 2 + offset;

  // Text positions
  const labelOffset = radius * 0.7;
  const onlyAX = centerAx - labelOffset;
  const onlyBX = centerBx + labelOffset;
  const interX = width / 2;
  const interY = centerY;
  const neitherX = width / 2;
  const neitherY = centerY + radius * 1.6;

  const fontSize = Math.max(26, Math.min(width, height) * 0.045);
  const setFontSize = Math.max(22, Math.min(width, height) * 0.035);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ background: 'var(--lm-bg)', fontFamily: 'var(--lm-font-body)' }}
      role="img"
      aria-label={`Diagrama de Venn: ${setA} y ${setB}`}
    >
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="var(--lm-ink)" flood-opacity="0.15"/>
        </filter>
      </defs>

      {/* Circles */}
      <circle
        cx={centerAx}
        cy={centerY}
        r={radius}
        fill="var(--lm-plot1)"
        fillOpacity={0.25}
        stroke="var(--lm-ink)"
        strokeWidth={2}
        filter="url(#shadow)"
      />
      <circle
        cx={centerBx}
        cy={centerY}
        r={radius}
        fill="var(--lm-plot2)"
        fillOpacity={0.25}
        stroke="var(--lm-ink)"
        strokeWidth={2}
        filter="url(#shadow)"
      />

      {/* Set labels */}
      <text
        x={centerAx}
        y={centerY - radius - 12}
        textAnchor="middle"
        dominantBaseline="alphabetic"
        fontSize={setFontSize}
        fill="var(--lm-ink)"
        fontWeight="600"
      >
        {setA}
      </text>
      <text
        x={centerBx}
        y={centerY - radius - 12}
        textAnchor="middle"
        dominantBaseline="alphabetic"
        fontSize={setFontSize}
        fill="var(--lm-ink)"
        fontWeight="600"
      >
        {setB}
      </text>

      {/* Region counts */}
      <text
        x={onlyAX}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fill="var(--lm-ink)"
        fontWeight="500"
      >
        {onlyA}
      </text>
      <text
        x={onlyBX}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fill="var(--lm-ink)"
        fontWeight="500"
      >
        {onlyB}
      </text>
      <text
        x={interX}
        y={interY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fill="var(--lm-ink)"
        fontWeight="700"
      >
        {intersection}
      </text>
      <text
        x={neitherX}
        y={neitherY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fill="var(--lm-ink)"
        fontWeight="500"
        opacity={0.7}
      >
        Ni {neither}
      </text>
    </svg>
  );
}
