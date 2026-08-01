import React from 'react';

/** Marquee selection tool: dashed rectangle. */
export default function NotationSelectToolIcon() {
  return (
    <span className="notation-select-tool-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <rect
          className="notation-select-tool-icon-rect"
          x="4.5"
          y="6.5"
          width="15"
          height="11"
          rx="0.75"
        />
      </svg>
    </span>
  );
}
