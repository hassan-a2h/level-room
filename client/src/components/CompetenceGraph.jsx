import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

/** Theme-backed styling and text labels for every lesson state. */
const STATE_STYLES = {
  not_started: {
    fill: 'var(--ui-neutral-bg)',
    stroke: 'var(--ui-neutral-border)',
    text: 'var(--ui-neutral-text)',
    strokeWidth: 1,
    strokeDasharray: '4 2',
    glow: false,
    label: 'Not started',
  },
  practicing: {
    fill: 'var(--ui-warning-bg)',
    stroke: 'var(--ui-warning-border)',
    text: 'var(--ui-warning-text)',
    strokeWidth: 2,
    strokeDasharray: null,
    glow: true,
    label: 'Practicing',
  },
  passed: {
    fill: 'var(--ui-success-bg)',
    stroke: 'var(--ui-success-border)',
    text: 'var(--ui-success-text)',
    strokeWidth: 2,
    strokeDasharray: null,
    glow: true,
    label: 'Passed',
  },
  skipped: {
    fill: 'var(--ui-surface-alt)',
    stroke: 'var(--ui-neutral-border)',
    text: 'var(--ui-neutral-text)',
    strokeWidth: 1,
    strokeDasharray: '6 3',
    glow: false,
    label: 'Skipped',
  },
  tested_out: {
    fill: 'var(--ui-progress-bg)',
    stroke: 'var(--ui-progress-border)',
    text: 'var(--ui-progress-text)',
    strokeWidth: 2,
    strokeDasharray: null,
    glow: true,
    label: 'Tested out',
  },
  quiz_pending: {
    fill: 'var(--ui-progress-bg)',
    stroke: 'var(--ui-progress-border)',
    text: 'var(--ui-progress-text)',
    strokeWidth: 2,
    strokeDasharray: null,
    glow: true,
    label: 'Quiz pending',
  },
  remediating: {
    fill: 'var(--ui-warning-bg)',
    stroke: 'var(--ui-warning-border)',
    text: 'var(--ui-warning-text)',
    strokeWidth: 2,
    strokeDasharray: null,
    glow: true,
    label: 'Remediating',
  },
}

const UNKNOWN_STATE_STYLE = { ...STATE_STYLES.not_started, label: 'Unknown' }

const NODE_WIDTH = 160
const NODE_HEIGHT = 64
const NODE_RX = 8
const VERTICAL_GAP = 80
const HORIZONTAL_GAP = 40

/**
 * Build a topological layout for lessons across modules.
 * We arrange modules horizontally and lessons vertically within each module.
 * Prerequisite edges connect across positions.
 */
function computeLayout(modules) {
  const nodes = []
  const nodeMap = new Map()
  let xOffset = 60

  modules.forEach((mod, modIndex) => {
    const modWidth = Math.max(
      NODE_WIDTH,
      mod.lessons.length > 0 ? NODE_WIDTH + 20 : 0
    )
    const centerX = xOffset + modWidth / 2

    mod.lessons.forEach((lesson, lessonIndex) => {
      const y = 60 + lessonIndex * (NODE_HEIGHT + VERTICAL_GAP)
      const node = {
        id: lesson.id,
        x: centerX - NODE_WIDTH / 2,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: lesson,
        moduleIndex: modIndex,
        lessonIndex,
      }
      nodes.push(node)
      nodeMap.set(lesson.id, node)
    })

    xOffset += modWidth + HORIZONTAL_GAP
  })

  const edges = []
  nodes.forEach((node) => {
    const prereqs = node.data.prerequisites || []
    prereqs.forEach((pr) => {
      const source = nodeMap.get(pr.lessonId)
      if (source) {
        edges.push({
          source: source.id,
          target: node.id,
          sourceNode: source,
          targetNode: node,
        })
      }
    })
  })

  // Compute bounding box
  let maxX = 0
  let maxY = 0
  nodes.forEach((n) => {
    maxX = Math.max(maxX, n.x + n.width + 40)
    maxY = Math.max(maxY, n.y + n.height + 40)
  })

  return { nodes, edges, width: Math.max(maxX, 400), height: Math.max(maxY, 300) }
}

function EdgeLine({ source, target, isHighlighted, isDimmed }) {
  const sx = source.x + source.width / 2
  const sy = source.y + source.height
  const tx = target.x + target.width / 2
  const ty = target.y

  // Bezier curve
  const cp1x = sx
  const cp1y = sy + (ty - sy) / 2
  const cp2x = tx
  const cp2y = ty - (ty - sy) / 2

  const d = `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tx} ${ty}`

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={isHighlighted ? 'var(--ui-action)' : 'var(--ui-divider)'}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        strokeDasharray={isHighlighted ? null : '4 2'}
        opacity={isDimmed ? 0.2 : 1}
        className="transition-all duration-300"
      />
      {/* Arrowhead */}
      <polygon
        points={`${tx - 4},${ty - 6} ${tx + 4},${ty - 6} ${tx},${ty}`}
        fill={isHighlighted ? 'var(--ui-action)' : 'var(--ui-divider)'}
        opacity={isDimmed ? 0.2 : 1}
        className="transition-all duration-300"
      />
    </g>
  )
}

function GraphNode({ node, isFocused, isHovered, onClick, onFocus, onBlur, onMouseEnter, onMouseLeave }) {
  const { data } = node
  const style = STATE_STYLES[data.state] || UNKNOWN_STATE_STYLE
  const nodeRef = useRef(null)

  useEffect(() => {
    if (isFocused && nodeRef.current) {
      nodeRef.current.focus()
    }
  }, [isFocused])

  const title = data.title || 'Untitled'
  const tooltipId = `competence-graph-tooltip-${node.moduleIndex}-${node.lessonIndex}`
  const truncated = title.length > 22 ? title.slice(0, 19) + '...' : title

  const lockIcon = data.locked ? '🔒' : null
  const continueIcon = data.state === 'practicing' ? '▶' : null

  return (
    <g
      ref={nodeRef}
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${style.label}${data.locked ? ', locked' : ''}${data.depth ? ', depth ' + data.depth : ''}`}
      aria-describedby={isFocused ? tooltipId : undefined}
      onClick={() => onClick(data)}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(data)
        }
      }}
      className="cursor-pointer"
      style={{ outline: 'none' }}
    >
      {/* Glow filter for active states */}
      {style.glow && (
        <defs>
          <filter id={`glow-${data.id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
      )}

      {/* Node rect */}
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={NODE_RX}
        ry={NODE_RX}
        fill={style.fill}
        stroke={isFocused || isHovered ? 'var(--ui-focus)' : style.stroke}
        strokeWidth={isFocused || isHovered ? 3 : style.strokeWidth}
        strokeDasharray={style.strokeDasharray}
        className="transition-all duration-300"
        style={style.glow ? { filter: `url(#glow-${data.id})` } : undefined}
      />

      {/* Focus ring (visible when focused) */}
      {(isFocused || isHovered) && (
        <rect
          x={node.x - 3}
          y={node.y - 3}
          width={node.width + 6}
          height={node.height + 6}
          rx={NODE_RX + 3}
          ry={NODE_RX + 3}
          fill="none"
          stroke="var(--ui-focus)"
          strokeWidth={2}
          strokeDasharray="4 2"
          className="transition-all duration-300"
        />
      )}

      {/* Continue/play icon for practicing */}
      {continueIcon && (
        <circle
          cx={node.x + node.width - 10}
          cy={node.y + 14}
          r={6}
          fill="var(--ui-warning-text)"
          className="animate-pulse"
        />
      )}

      {/* Lock icon */}
      {lockIcon && (
        <text
          x={node.x + node.width - 16}
          y={node.y + 16}
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          🔒
        </text>
      )}

      {/* Title text */}
      <text
        x={node.x + node.width / 2}
        y={node.y + 23}
        fontSize={12}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={style.text}
        className="transition-colors duration-300 select-none pointer-events-none"
      >
        {truncated}
      </text>

      <text
        x={node.x + node.width / 2}
        y={node.y + 48}
        fontSize={10}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={style.text}
        className="select-none pointer-events-none"
      >
        {style.label}
      </text>
    </g>
  )
}

function Tooltip({ node, mousePos }) {
  const { data } = node
  const style = STATE_STYLES[data.state] || UNKNOWN_STATE_STYLE
  const tooltipId = `competence-graph-tooltip-${node.moduleIndex}-${node.lessonIndex}`

  const prereqNames = (data.prerequisites || [])
    .filter((pr) => {
      // Show prerequisites that are NOT passed/tested_out
      return data.locked
    })
    .map((pr) => pr.title)
    .join(', ')

  return (
    <div
      className="ui-surface-raised ui-text absolute z-50 text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none max-w-xs"
      style={{
        left: mousePos.x + 12,
        top: mousePos.y - 12,
      }}
      role="tooltip"
      id={tooltipId}
    >
      <div className="font-semibold mb-1">{data.title}</div>
      <div className="ui-text-secondary mb-1">Status: {style.label}</div>
      {data.estimated_time && data.state !== 'passed' && data.state !== 'tested_out' && (
        <div className="ui-text-secondary mb-1">~{data.estimated_time} min</div>
      )}
      {data.depth && (
        <div className="ui-text-secondary mb-1">Depth: {data.depth}</div>
      )}
      {prereqNames && (
        <div style={{ color: 'var(--ui-danger-text)' }}>Locked: needs {prereqNames}</div>
      )}
      {data.locked && !prereqNames && (
        <div style={{ color: 'var(--ui-danger-text)' }}>Locked</div>
      )}
    </div>
  )
}

export default function CompetenceGraph({ modules, onNodeClick, onStateChange }) {
  const svgRef = useRef(null)
  const scrollRegionRef = useRef(null)
  const [focusedNodeId, setFocusedNodeId] = useState(null)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [tooltipNode, setTooltipNode] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const { nodes, edges, width, height } = useMemo(() => computeLayout(modules || []), [modules])

  const handleNodeClick = useCallback(
    (lesson) => {
      if (lesson.locked) {
        // Show locked tooltip via a temporary highlight
        setHoveredNodeId(lesson.id)
        return
      }
      onNodeClick?.(lesson)
    },
    [onNodeClick]
  )

  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [])

  // Collect upstream and downstream IDs for highlighting
  const highlightedIds = useMemo(() => {
    const ids = new Set()
    if (!hoveredNodeId && !focusedNodeId) return ids
    const targetId = hoveredNodeId || focusedNodeId
    if (!targetId) return ids

    // Upstream (prerequisites)
    edges.forEach((edge) => {
      if (edge.target === targetId) {
        ids.add(edge.source)
      }
    })
    // Downstream (dependents)
    edges.forEach((edge) => {
      if (edge.source === targetId) {
        ids.add(edge.target)
      }
    })
    ids.add(targetId)
    return ids
  }, [hoveredNodeId, focusedNodeId, edges])

  return (
    <div className="relative w-full" role="region" aria-label="Competence graph">
      <div
        ref={scrollRegionRef}
        className="overflow-x-auto"
        role="group"
        aria-label="Competence graph, scroll horizontally to explore lessons"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            scrollRegionRef.current.scrollLeft += event.key === 'ArrowRight' ? 120 : -120
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="block max-w-none h-auto"
          style={{ width: `${width}px` }}
          role="application"
          aria-label="Competence graph showing lesson nodes and prerequisite relationships"
          onMouseMove={handleMouseMove}
        >
        {/* Edges */}
        {edges.map((edge) => {
          const source = nodes.find((n) => n.id === edge.source)
          const target = nodes.find((n) => n.id === edge.target)
          if (!source || !target) return null
          const isHighlighted = highlightedIds.has(source.id) && highlightedIds.has(target.id)
          const isDimmed = (hoveredNodeId || focusedNodeId) && !isHighlighted
          return (
            <EdgeLine
              key={`${edge.source}-${edge.target}`}
              source={source}
              target={target}
              isHighlighted={isHighlighted}
              isDimmed={isDimmed}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isFocused = focusedNodeId === node.id
          const isHovered = hoveredNodeId === node.id
          const isDimmed = (hoveredNodeId || focusedNodeId) && !highlightedIds.has(node.id)

          return (
            <g
              key={node.id}
              opacity={isDimmed ? 0.3 : 1}
              className="transition-opacity duration-300"
            >
              <GraphNode
                node={node}
                isFocused={isFocused}
                isHovered={isHovered}
                onClick={handleNodeClick}
                onFocus={() => {
                  setFocusedNodeId(node.id)
                  setTooltipNode(node)
                }}
                onBlur={() => {
                  setFocusedNodeId(null)
                  setTooltipNode(null)
                }}
                onMouseEnter={() => {
                  setHoveredNodeId(node.id)
                  setTooltipNode(node)
                }}
                onMouseLeave={() => {
                  setHoveredNodeId(null)
                  setTooltipNode(null)
                }}
              />
            </g>
          )
        })}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltipNode && (
        <Tooltip node={tooltipNode} mousePos={mousePos} />
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs ui-text-secondary" role="list" aria-label="Lesson status legend">
        {Object.entries(STATE_STYLES).map(([key, s]) => (
          <div key={key} className="flex items-center gap-1.5" role="listitem">
            <span
              className="inline-block w-3 h-3 rounded-sm border"
              style={{
                backgroundColor: s.fill,
                borderColor: s.stroke,
                borderStyle: s.strokeDasharray ? 'dashed' : 'solid',
              }}
            />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
