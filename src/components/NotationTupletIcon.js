import React from 'react';

/**
 * Tuplet toolbar glyph: numeral centred above a downward tapered bracket arc.
 */
export default function NotationTupletIcon(props) {
  const num = props.num != null ? String(props.num) : '3';
  return (
    <span className="notation-tuplet-icon" aria-hidden="true">
      <svg viewBox="0 0 24 26" focusable="false">
        <text
          className="notation-tuplet-icon-num"
          x="12"
          y="8.5"
          textAnchor="middle"
          dominantBaseline="middle"
        >{num}</text>
        <path
          className="notation-tuplet-icon-arc"
          d="M2.5 19.5 Q12 12.5 21.5 19.5 L20.4 20.2 Q12 14.2 3.6 20.2 Z"
        />
      </svg>
    </span>
  );
}
