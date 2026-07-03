/**
 * PixelSprite — a small original pixel-art chibi character (Stardew Valley-style proportions:
 * big rounded head, distinct hair/skin/outfit tones), tinted per agent via its shirt color.
 * Replaces emoji avatars everywhere, and replaces the plain traveling dot in GraphView with the
 * same character mid-stride along the connection line (ChatDev-style).
 */

const SKIN = '#f0c199'
const HAIR = '#5c3a21'
const PANTS = '#33415c'
const SHOE = '#241a12'

interface BodyProps {
  color: string
  walking?: boolean
}

/** The character itself — a <g> of blocky rects on a 16x18 grid. Nest this inside any SVG. */
export function PixelBody({ color, walking = false }: BodyProps) {
  return (
    <g className={walking ? 'ps-walk' : undefined}>
      {/* legs + shoes (drawn first so the torso overlaps their tops) */}
      <rect className="ps-leg-l" x="4" y="12" width="3" height="4" fill={PANTS} />
      <rect className="ps-leg-l" x="4" y="16" width="3" height="2" fill={SHOE} />
      <rect className="ps-leg-r" x="9" y="12" width="3" height="4" fill={PANTS} />
      <rect className="ps-leg-r" x="9" y="16" width="3" height="2" fill={SHOE} />
      {/* arms — sleeve in the agent color, hand in skin tone */}
      <rect x="2" y="7" width="2" height="4" fill={color} />
      <rect x="2" y="11" width="2" height="1" fill={SKIN} />
      <rect x="12" y="7" width="2" height="4" fill={color} />
      <rect x="12" y="11" width="2" height="1" fill={SKIN} />
      {/* torso (the agent's shirt) */}
      <rect x="4" y="6" width="8" height="6" fill={color} />
      {/* head — big and round, chibi-proportioned */}
      <rect x="5" y="2" width="6" height="4" fill={SKIN} />
      <rect x="5" y="0" width="6" height="2" fill={HAIR} />
      <rect x="4" y="2" width="1" height="2" fill={HAIR} />
      <rect x="11" y="2" width="1" height="2" fill={HAIR} />
      {/* eyes */}
      <rect x="6" y="4" width="1" height="1" fill="#241a12" />
      <rect x="9" y="4" width="1" height="1" fill="#241a12" />
    </g>
  )
}

interface IconProps extends BodyProps {
  size?: number
  className?: string
}

/** Standalone icon for HTML contexts — node avatars, chat bubbles, the sidebar legend. */
export function PixelAgentIcon({ color, size = 24, walking = false, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size * 1.125}
      viewBox="0 0 16 18"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <PixelBody color={color} walking={walking} />
    </svg>
  )
}
