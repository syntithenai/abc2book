import React, { useRef } from 'react';

export default function DualEndedSlider(props) {
  const min = props.min != null ? props.min : 0;
  const max = props.max != null ? props.max : 127;
  const low = Math.max(min, Math.min(max, props.low != null ? props.low : min));
  const high = Math.max(min, Math.min(max, props.high != null ? props.high : max));
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const trackRef = useRef(null);

  function format(v) {
    if (props.formatLow && v === lo) return props.formatLow(v);
    if (props.formatHigh && v === hi) return props.formatHigh(v);
    return String(v);
  }

  function valueFromX(clientX) {
    const el = trackRef.current;
    if (!el) return min;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    const step = props.step != null ? props.step : 1;
    return Math.round(raw / step) * step;
  }

  function handlePointer(e, which) {
    const v = valueFromX(e.clientX);
    if (which === 'low') props.onChange(Math.min(v, hi), hi);
    else props.onChange(lo, Math.max(v, lo));
  }

  const range = max - min || 1;
  const leftPct = ((lo - min) / range) * 100;
  const widthPct = ((hi - lo) / range) * 100;

  return (
    <div className="dual-ended-slider">
      {!props.hideLabels ? (
        <div className="dual-ended-slider-labels small text-muted d-flex justify-content-between">
          <span>{format(lo)}</span>
          <span>{format(hi)}</span>
        </div>
      ) : null}
      <div ref={trackRef} className="dual-ended-slider-track"
        onPointerDown={function(e) {
          const v = valueFromX(e.clientX);
          const distLo = Math.abs(v - lo);
          const distHi = Math.abs(v - hi);
          handlePointer(e, distLo <= distHi ? 'low' : 'high');
        }}>
        <div className="dual-ended-slider-range" style={{ left: leftPct + '%', width: widthPct + '%' }} />
        <div className="dual-ended-slider-thumb low" style={{ left: leftPct + '%' }}
          onPointerDown={function(e) {
            e.stopPropagation();
            function move(ev) { handlePointer(ev, 'low'); }
            function up() {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            }
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }} />
        <div className="dual-ended-slider-thumb high" style={{ left: (leftPct + widthPct) + '%' }}
          onPointerDown={function(e) {
            e.stopPropagation();
            function move(ev) { handlePointer(ev, 'high'); }
            function up() {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            }
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }} />
      </div>
    </div>
  );
}
