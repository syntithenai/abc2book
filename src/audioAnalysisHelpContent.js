import React from 'react'

export function AudioAnalysisHelpBody() {
  return (
    <div className="audio-analysis-help-body">
      <h5>Using the tool</h5>
      <ol>
        <li>
          <strong>Groups</strong> organise recording sets (e.g. one instrument or one adjustment session).
          Put related before/after bowed and tap sets in the same group.
        </li>
        <li>
          <strong>Measurement modes</strong>
          <ul>
            <li><strong>Bowed notes</strong> — pitch-gated capture of a note sequence (open / octaves / Saunders grid).</li>
            <li><strong>Tap body response</strong> — Tier‑1 impulse response with phone mic, USB interface, or optional stereo (mic + piezo). Damp strings and tap the bridge top.</li>
          </ul>
        </li>
        <li>
          <strong>Wizard</strong> — follows on-screen instructions per note or tap. Skip / retry / cancel as needed.
        </li>
        <li>
          <strong>Compare</strong> — pick baseline A and candidate B. Tabs:
          Overview, Timbre, Playability, QC, and Body modes (when both sets are tap).
        </li>
        <li>
          Keep <strong>mic distance, room, and bow/tap consistency</strong> matched across sets.
        </li>
        <li>
          <strong>Cloud sync</strong> — when you sign in, unsynced sets upload automatically. Deletes made offline
          sync too (tombstones). Use <em>Sync Drive</em> anytime. Data lives under TuneBook/<code>AudioAnalysis/</code>.
        </li>
        <li>
          <strong>Compare PDF</strong> — downloads a report with deltas, recommendations, and charts.
        </li>
      </ol>

      <h5>Tap mode (Tier‑1)</h5>
      <p>
        This is <strong>radiated tap response</strong>, not a calibrated force-hammer admittance lab.
        It is still very useful for seeing whether body resonances moved after a soundpost change.
      </p>
      <ol>
        <li>Damp all strings (cloth under the strings or firm fingers).</li>
        <li>Place the phone ~30–50 cm on the treble side <em>or</em> a flat measurement mic ~1 m; keep that position fixed between sets.</li>
        <li>Quiet room. Disable notifications / avoid handling noise. On a USB interface, turn phantom on for condenser mics and leave “Air”/EQ off.</li>
        <li>Tap the <strong>bridge top</strong> lightly with a fingertip or pencil eraser — same spot each tap.</li>
        <li>Capture the full set of taps, adjust the post once, then repeat.</li>
      </ol>
      <p>
        The app finds spectral peaks and guesses common violin ranges (A0 ~280–300 Hz, B1− ~400–460 Hz,
        B1+ ~530–550 Hz). Treat labels as hints. Compare the <strong>Body modes</strong> tab for Hz shifts.
      </p>

      <h5>Stereo tap (mic + piezo)</h5>
      <p>
        With a 2-in USB interface (e.g. Behringer UMC22), enable <strong>Stereo (mic + piezo)</strong> in the wizard
        and select the interface as the input device.
      </p>
      <ul>
        <li><strong>L / Ch1</strong> — flat radiated mic on the XLR input (+48 V phantom if needed).</li>
        <li><strong>R / Ch2</strong> — piezo/contact through a Hi‑Z buffer into the Instrument jack (not phantom).</li>
        <li>Stick the piezo lightly to the bridge with Blu‑Tack; keep mass and position identical between A and B sets.</li>
        <li>Set both channel gains so taps peak without clipping; do not change gains mid-session.</li>
      </ul>
      <p>
        Compare overlays solid L curves (radiation) and dashed R curves (piezo). Body modes lists L and R peak shifts separately.
        Timbre / soundpost heuristics still use the radiated (L) channel only.
      </p>

      <h5>Timbre metrics (Meyda-style)</h5>
      <ul>
        <li><strong>Centroid</strong> — brightness.</li>
        <li><strong>Rolloff</strong> — frequency below which most energy sits (dark ↔ open).</li>
        <li><strong>Flatness</strong> — tone vs noise (higher ≈ scratchier / noisier).</li>
        <li><strong>Sharpness</strong> — high-frequency emphasis (“harsh”).</li>
        <li><strong>Spread</strong> — how wide energy is around the centroid.</li>
        <li><strong>Flux</strong> — how much the spectrum changes over time (steadiness).</li>
        <li><strong>Richness</strong> — overtone energy vs fundamental.</li>
        <li><strong>Timbre distance</strong> — mel-band distance between A and B (low / medium / high).</li>
      </ul>
      <p>
        Chips on the compare view summarise these as Brighter/Darker, Richer/Thinner, Cleaner/Noisier, etc.
        The <strong>QC</strong> tab warns when level or flux differ enough that playing may explain the change.
      </p>

      <h5>What the tabs mean</h5>
      <ul>
        <li><strong>Overview</strong> — broad summary of tonal balance, level, stability, charts, and per-note details.</li>
        <li><strong>Timbre</strong> — overall tone colour. Use this when asking “is B brighter, harsher, richer, or cleaner than A?”</li>
        <li><strong>Playability</strong> — how willingly notes speak and hold pitch. Use this when asking “does B feel steadier or wolfier?”</li>
        <li><strong>QC</strong> — sanity-check whether different bowing, mic position, or room noise may explain the change.</li>
        <li><strong>Body modes</strong> — tap-only view of resonance peak shifts.</li>
      </ul>
      <p>
        In all compare views, the app reports <strong>B minus A</strong>. Positive means the candidate set B is higher or has
        more of that quality. For some measures that is good, for others it is bad, so always read the explanation beside the metric.
      </p>

      <h5>Reading the charts</h5>
      <ul>
        <li><strong>Bass</strong> (&lt;400 Hz) / <strong>Body</strong> (400–800 Hz) — low resonance and body modes.</li>
        <li><strong>Mid</strong> / <strong>Presence</strong> — projection and perceived sharpness.</li>
        <li><strong>Average spectrum</strong> — full frequency shape up to 4 kHz. If B sits above A in a region, B has more energy there.</li>
        <li><strong>Saunders-style level curve</strong> — loudness across notes; prefer evenness. Big peaks or valleys often point to one string/register responding differently.</li>
        <li><strong>Per-note highlight graph</strong> — fast visual scan of note-by-note changes. Bars show loudness delta for each note; dots show richness delta for the same note.</li>
        <li><strong>Stability / wolf score</strong> — unwilling or noisy notes.</li>
      </ul>
      <p>
        A good workflow is: start on <strong>Overview</strong>, inspect the charts, then use <strong>Timbre</strong> to explain
        the colour change and <strong>Playability</strong> to see whether the instrument became easier or harder to play evenly.
      </p>

      <h5>Working guide: optimising soundpost position</h5>
      <p>
        Moving a soundpost can damage an instrument. If you are not experienced, work with a luthier.
      </p>
      <ol>
        <li>
          <strong>Protocol</strong> — same mic, same room, one change at a time. Record bowed and/or tap sets,
          then re-record after a ~1 mm move.
        </li>
        <li>
          <strong>What the post mainly affects</strong> — modes below ~2–2.5 kHz. Tap peaks help show mode
          frequency shifts; bowed sets show how that sounds under the bow.
        </li>
        <li>
          <strong>Heuristics</strong> — toward bridge often brighter; toward treble f-hole tends to lower B1 modes;
          toward center tends to raise them. Weak bass → check fit/contact first.
        </li>
        <li>
          <strong>When to stop</strong> — when the response feels even and willing, not when every chart is maximised.
        </li>
      </ol>

      <p className="text-muted mb-0">
        Soundpost recommendations appear for bowed violin-family compares. Tap mode shows mode shifts instead.
      </p>
    </div>
  )
}
