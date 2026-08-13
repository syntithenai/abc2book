import React from 'react'

var AUDIO_ANALYSIS_HELP_PRINT_STYLES = [
  '@page { size: A4; margin: 0.6in; }',
  'body { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.45; color: #111; }',
  'h1.print-help-title { font-family: system-ui, sans-serif; font-size: 18pt; margin: 0 0 0.35in; }',
  '.audio-analysis-help-body h5 { font-family: system-ui, sans-serif; font-size: 13pt; margin: 0.35in 0 0.12in; page-break-after: avoid; }',
  '.audio-analysis-help-body h6 { font-family: system-ui, sans-serif; font-size: 11pt; margin: 0.22in 0 0.08in; page-break-after: avoid; }',
  '.audio-analysis-help-body p, .audio-analysis-help-body li { margin: 0 0 0.1in; }',
  '.audio-analysis-help-body ol, .audio-analysis-help-body ul { margin: 0 0 0.12in; padding-left: 1.2em; }',
  '.audio-analysis-help-body code { font-family: ui-monospace, monospace; font-size: 0.92em; }',
  '.help-figure { margin: 0.15in 0 0.25in; max-width: 4.8in; page-break-inside: avoid; break-inside: avoid; }',
  '.help-figure img { display: block; width: 100%; max-width: 100%; height: auto; border: 1px solid #ccc; }',
  '.help-figure figcaption { font-family: system-ui, sans-serif; font-size: 9pt; color: #444; margin-top: 0.06in; }',
  '.text-muted { color: #555 !important; }',
  '.mb-0 { margin-bottom: 0 !important; }'
].join('\n')

function absolutizeHelpImageSrcs(rootEl) {
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return
  var imgs = rootEl.querySelectorAll('img')
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i]
    img.removeAttribute('loading')
    var src = img.getAttribute('src')
    if (!src || /^(https?:|data:|blob:)/i.test(src)) continue
    try {
      img.setAttribute('src', new URL(src, document.baseURI).href)
    } catch (err) {
      // leave relative src
    }
  }
}

function whenDocumentImagesReady(doc, callback) {
  var finished = false
  function done() {
    if (finished) return
    finished = true
    callback()
  }
  var imgs = Array.prototype.slice.call((doc && doc.images) || [])
  if (!imgs.length) {
    done()
    return
  }
  var pending = imgs.length
  function oneDone() {
    pending -= 1
    if (pending <= 0) done()
  }
  imgs.forEach(function(img) {
    if (img.complete) {
      oneDone()
      return
    }
    img.addEventListener('load', oneDone)
    img.addEventListener('error', oneDone)
  })
  setTimeout(done, 4000)
}

/** Open a print dialog for the Audio Analysis help body (works despite app @media print hiding modals). */
export function printAudioAnalysisHelp(rootEl) {
  if (!rootEl || typeof document === 'undefined') return

  var clone = rootEl.cloneNode(true)
  absolutizeHelpImageSrcs(clone)

  var title = 'Audio Analysis help'
  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    title +
    '</title><style>' +
    AUDIO_ANALYSIS_HELP_PRINT_STYLES +
    '</style></head><body>' +
    '<h1 class="print-help-title">ABC Tune Book — Audio Analysis help</h1>' +
    clone.outerHTML +
    '</body></html>'

  var iframe = document.createElement('iframe')
  iframe.setAttribute('title', title)
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  var printWindow = iframe.contentWindow
  var printDoc = printWindow.document
  printDoc.open()
  printDoc.write(html)
  printDoc.close()

  whenDocumentImagesReady(printDoc, function() {
    printWindow.focus()
    setTimeout(function() {
      printWindow.print()
      setTimeout(function() {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 1000)
    }, 100)
  })
}

export const AudioAnalysisHelpBody = React.forwardRef(function AudioAnalysisHelpBody(props, ref) {
  return (
    <div ref={ref} className="audio-analysis-help-body">
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

      <h5>Hardware setups for consistent taps</h5>
      <p>
        TuneBook tap mode does not need a force-calibrated lab hammer, but <strong>repeatable excitation</strong> matters.
        The biggest gains come from fixing tap location, strike style, mic distance, and gains — then keeping them identical
        between baseline A and candidate B sets.
      </p>

      <h6 className="h6">Home / workshop setup</h6>
      <p>
        This is enough for useful before/after soundpost or setup comparisons:
      </p>
      <ul>
        <li>
          <strong>Excitation</strong> — fingertip or pencil eraser on the <strong>same bridge spot</strong> every tap.
          A small wooden dowel (~8–12 mm) gives a slightly sharper impulse than a fingertip. Mark the spot with tape if needed.
        </li>
        <li>
          <strong>Radiated mic</strong> — phone at 30–50 cm on the treble side, on a small tripod or stack of books so it
          cannot move; or a budget USB interface (e.g. Behringer UMC22, Focusrite Scarlett Solo) with a flat small-diaphragm
          condenser on the XLR input (+48 V phantom).
        </li>
        <li>
          <strong>Optional stereo</strong> — add a contact piezo on channel R (see below). Good condenser choices at this tier
          include Behringer TM1, Audio-Technica AT2020, Rode NT1, or any “measurement” or “instrument” mic with EQ/Air switched off.
        </li>
        <li>
          <strong>Room &amp; handling</strong> — quiet space, damped strings, notifications off, same mic stand height and angle
          for every set. Do not change interface gain between A and B.
        </li>
      </ul>

      <h6 className="h6">Pro / luthier workshop setup</h6>
      <p>
        For laboratory-grade repeatability, violin acoustics researchers use a <strong>pendulum- or stage-mounted impulse hammer</strong>
        with a force sensor in the tip, plus a flat omnidirectional measurement microphone at a fixed distance. Joseph Curtin’s
        impulse measurement rig is a widely used example: the violin hangs on elastic supports, a miniature PCB impact hammer
        (model 086C80 / 086E80 class) swings on a consistent arc to the bass corner of the bridge, and a precision mic records
        radiated sound. A 3-axis positioning stage keeps strike point and angle identical across dozens of taps.
      </p>
      <figure className="help-figure">
        <img
          alt="Joseph Curtin impulse measurement rig with violin, microphone boom, and pendulum impact hammer"
          src="helpimages/audio-analysis-curtin-rig.jpg"
          loading="lazy"
        />
        <figcaption className="text-muted small">
          Pro sound-radiation rig (Joseph Curtin Studios) — elastic violin support, fixed mic distance, pendulum impact hammer.
        </figcaption>
      </figure>
      <figure className="help-figure">
        <img
          alt="Pendulum-mounted miniature impact hammer aligned to violin bridge"
          src="helpimages/audio-analysis-hammer-mount.jpg"
          loading="lazy"
        />
        <figcaption className="text-muted small">
          Hammer mount detail — consistent swing path and bridge contact point across taps.
        </figcaption>
      </figure>
      <figure className="help-figure">
        <img
          alt="PCB Piezotronics miniature impact hammer with force sensor in the tip"
          src="helpimages/audio-analysis-impulse-hammer.jpg"
          loading="lazy"
        />
        <figcaption className="text-muted small">
          Miniature force-calibrated impact hammer (PCB 086C80 class) — the pro standard for repeatable bridge taps.
        </figcaption>
      </figure>
      <p>
        Pro-tier additions beyond TuneBook’s Tier‑1 tap workflow:
      </p>
      <ul>
        <li>
          <strong>Force channel</strong> — hammer output into a dedicated IEPE/ICP conditioner (e.g. PCB 485B39) so software
          can compute true radiativity (sound per unit force). TuneBook uses mic-only tap spectra, which are still excellent for
          A/B peak shifts when protocol is matched.
        </li>
        <li>
          <strong>Measurement mic</strong> — flat omnidirectional models at 20 cm–1 m: Earthworks M30/M50, GRAS 46AE, PCB 378B02,
          or similar calibrated condensers. Avoid vocal mics with presence boosts.
        </li>
        <li>
          <strong>Bridge admittance</strong> — lightweight accelerometer (&lt;0.5 g, e.g. PCB 352A73) on the bridge plus hammer
          force gives bridge mobility; useful for modal work but separate from radiated tap capture in this app.
        </li>
        <li>
          <strong>Mounting</strong> — instrument on soft elastic bands (ponytail ties work); damp strings with foam or ribbon;
          mark mic distance on a boom stand. Curtin-style rigs pack into a carry-on for hall measurements.
        </li>
      </ul>

      <h5>Microphones &amp; piezos for recording</h5>

      <h6 className="h6">Radiated microphone (L channel, or mono tap)</h6>
      <p>
        Choose a mic with the <strong>flattest frequency response</strong> you can manage — no “vocal warmth” or Air/EQ enhancement.
        Omnidirectional capsules are preferred for measurement; cardioids work close if aimed at the bridge and kept at the same distance.
      </p>
      <ul>
        <li>
          <strong>Phone mic</strong> — acceptable for relative A/B work at 30–50 cm when the phone is clamped in place. Near-field
          placement reduces room colouration.
        </li>
        <li>
          <strong>Home USB / XLR</strong> — Behringer TM1, AT2020, Rode NT1, sE X1, or any entry condenser on a 2-in interface
          (UMC22, Scarlett 2i2). Enable +48 V phantom; set gain once and leave it.
        </li>
        <li>
          <strong>Pro measurement</strong> — Earthworks M30/M50, GRAS 46AE ½″, PCB 378B02, or B&amp;K class-I condensers with
          known calibration curves. Often used at 37 cm–1 m on a boom for radiation maps.
        </li>
      </ul>
      <figure className="help-figure">
        <img
          alt="PCB precision measurement microphone for acoustic testing"
          src="helpimages/audio-analysis-pcb-mic.jpg"
          loading="lazy"
        />
        <figcaption className="text-muted small">
          Example precision measurement microphone (PCB 378B02 class) — flat omnidirectional response for radiated tap capture.
        </figcaption>
      </figure>

      <h6 className="h6">Contact / piezo pickup (R channel, stereo tap)</h6>
      <p>
        For the R channel you want a <strong>structure-borne</strong> sensor, not an amplified bridge pickup meant for stage volume.
        A small disc or film piezo on the bridge top (bass or treble foot — pick one and mark it) senses bridge motion directly
        and is less sensitive to room reflections than the air mic.
      </p>
      <ul>
        <li>
          <strong>Placement</strong> — Blu‑Tack or double-sided tape under the piezo; same mass and position for every set.
          Route the cable so it does not pull on the bridge.
        </li>
        <li>
          <strong>Preamp / interface</strong> — piezos need a <strong>high-impedance (Hi‑Z)</strong> input: instrument jack on a
          guitar interface, Radial StageBug PZ, Fishman Aura DI, or a dedicated piezo preamp. Never apply +48 V phantom to a raw piezo.
        </li>
        <li>
          <strong>Hardware examples</strong> — K&amp;K or Fishman bridge transducers, cheap disc piezos with a buffer, or a spare
          under-saddle film element taped lightly to the bridge. Commercial violin bridge pickups (see below) can work if buffered
          and kept off the strings.
        </li>
      </ul>
      <figure className="help-figure">
        <img
          alt="Piezoelectric transducer embedded in a violin bridge pickup"
          src="helpimages/audio-analysis-piezo-bridge.jpg"
          loading="lazy"
        />
        <figcaption className="text-muted small">
          Piezo element in a violin bridge pickup (Wikimedia Commons) — for measurement, use a small contact disc on the bridge
          top rather than a full performance pickup when possible.
        </figcaption>
      </figure>

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
})
