import React from 'react';
import { beatToX } from '../notation/pianoRollGeometry';

export default function PianoRollPlaybackRegion(props) {
  const { region, beatWidth, height, onRegionChange } = props;
  if (!region) return null;

  const x = beatToX(region.startBeat || 0, beatWidth);
  const endBeat = region.endBeat != null ? region.endBeat : (region.startBeat || 0) + 4;
  const w = Math.max(8, beatToX(endBeat - (region.startBeat || 0), beatWidth));

  return (
    <g className="piano-roll-playback-region">
      <rect x={x} y={0} width={w} height={height} className="piano-roll-region-fill" />
      {onRegionChange ? (
        <rect
          x={x + w - 6}
          y={0}
          width={6}
          height={height}
          className="piano-roll-region-handle"
          onPointerDown={function(e) {
            e.stopPropagation();
            const startX = e.clientX;
            const origEnd = endBeat;
            function onMove(moveEvent) {
              const dx = (moveEvent.clientX - startX) / beatWidth;
              onRegionChange({ endBeat: Math.max((region.startBeat || 0) + 0.25, origEnd + dx) });
            }
            function onUp() {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            }
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        />
      ) : null}
    </g>
  );
}
