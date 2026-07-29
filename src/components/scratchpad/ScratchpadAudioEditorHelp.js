import { useState } from 'react'
import { SCRATCHPAD_SHORTCUT_BINDINGS, shortcutLabel } from '../../scratchpadAudioShortcuts'

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'tracks', title: 'Tracks and takes' },
  { id: 'transport', title: 'Transport and recording' },
  { id: 'editing', title: 'Editing' },
  { id: 'markers', title: 'Markers and loops' },
  { id: 'effects', title: 'Effects' },
  { id: 'stems', title: 'Stem separation' },
  { id: 'export', title: 'Export and associate' },
  { id: 'shortcuts', title: 'Keyboard shortcuts' },
  { id: 'sync', title: 'Sync' },
]

function scrollToSection(id) {
  const el = document.getElementById('scratchpad-audio-help-' + id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export default function ScratchpadAudioEditorHelp() {
  const [activeSection, setActiveSection] = useState('overview')

  function navTo(id) {
    setActiveSection(id)
    scrollToSection(id)
  }

  return (
    <div className="scratchpad-audio-editor-help-page">
      <div className="help-layout scratchpad-audio-editor-help-layout">
        <nav className="help-section-nav scratchpad-audio-editor-help-nav" aria-label="Scratchpad audio editor help sections">
          <ul>
            {SECTIONS.map(function(section) {
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={activeSection === section.id ? 'active' : ''}
                    onClick={function() { navTo(section.id) }}
                  >
                    {section.title}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="help-main scratchpad-audio-editor-help-main">
          <section id="scratchpad-audio-help-overview" className="help-section">
            <h2>Overview</h2>
            <div className="help-section-body">
              <p>
                The scratchpad audio editor is a multitrack workspace for recording, editing, and mixing audio drafts
                before you attach them to tunes. Open an audio item from <strong>Scratchpad</strong> to see the waveform
                timeline, track sidebar, menu bar, and transport dock.
              </p>
              <p>
                A slim <strong>menu bar</strong> below the title row has <strong>Edit</strong>, <strong>Process</strong>,
                <strong> Export</strong>, and <strong>View</strong> dropdowns. Transport controls (play, stop, record),
                tempo, metronome, and zoom live in the <strong>bottom dock</strong>. Open <strong>View → Help</strong> for this guide.
              </p>
              <p className="help-tip">
                This guide is also listed under <strong>Help → Scratchpad audio editor</strong> on the main Help page.
              </p>
            </div>
          </section>

          <section id="scratchpad-audio-help-tracks" className="help-section">
            <h2>Tracks and takes</h2>
            <div className="help-section-body">
              <p>
                Use <strong>+ Track</strong> at the top of the track sidebar to add an audio track, record a new track, or import an audio file.
                MIDI lanes are available when <strong>View → Advanced features</strong> is enabled.
              </p>
              <ul>
                <li>The first audio track is <strong>armed automatically</strong> when you open a project. Only the armed track receives new recordings.</li>
                <li>Click <strong>Arm</strong> on another track to switch the record target.</li>
                <li>Each audio track can hold <strong>multiple takes</strong>. Click a take to make it active; use <strong>+ Take</strong> to add another.</li>
                <li>Enable <strong>Comp</strong> on a track to assign different time ranges to different takes. Select a region on the waveform, then click <strong>Comp</strong> on the target take.</li>
                <li>MIDI tracks open a piano-roll editor aligned to the project timeline (advanced mode).</li>
                <li>Per-track controls on the waveform (mute, solo, volume, pan, collapse, remove) adjust the mix layout.</li>
              </ul>
            </div>
          </section>

          <section id="scratchpad-audio-help-transport" className="help-section">
            <h2>Transport and recording</h2>
            <div className="help-section-body">
              <p>
                The <strong>Transport</strong> block in the bottom dock has rewind, play/pause, stop, and record.
                Click <strong>Record</strong> again while recording to stop and save. The armed track must be an audio track.
              </p>
              <p>
                The <strong>Tempo &amp; Zoom</strong> block has BPM, metronome controls, zoom buttons, and <strong>Record settings</strong>.
              </p>
              <p>Record settings configure:</p>
              <ul>
                <li><strong>Tempo</strong> — used for count-in clicks (BPM).</li>
                <li><strong>Count-in</strong> — metronome bars before recording starts (badge next to the metronome icon).</li>
                <li><strong>Metronome</strong> — enable clicks during playback and/or while recording.</li>
                <li><strong>Punch-in</strong> — when enabled, recording starts at the start of your current selection.</li>
                <li><strong>Record mode</strong> — <em>New take</em> adds a take when the current one has audio; <em>Replace take</em> overwrites the active take.</li>
              </ul>
              <p>
                If recording does not start, check microphone permissions in your browser and open <strong>Record settings → Audio settings</strong>.
              </p>
            </div>
          </section>

          <section id="scratchpad-audio-help-editing" className="help-section">
            <h2>Editing</h2>
            <div className="help-section-body">
              <p>Open the <strong>Edit</strong> menu to choose how you interact with the waveform:</p>
              <ul>
                <li><strong>Seek</strong> — click to move the playhead.</li>
                <li><strong>Select</strong> — drag to highlight a region. With a selection active, use <strong>Trim</strong> to remove audio outside the selection.</li>
                <li><strong>Align</strong> — drag a clip to shift it along the timeline.</li>
                <li><strong>Fade in / Fade out</strong> — drag on clip edges to add fades.</li>
                <li><strong>Insert audio…</strong> — paste audio from another scratchpad item or linked tune media.</li>
              </ul>
            </div>
          </section>

          <section id="scratchpad-audio-help-markers" className="help-section">
            <h2>Markers and loops</h2>
            <div className="help-section-body">
              <p>
                Use <strong>Process → Add marker at playhead</strong> to place a marker. Markers appear on the region bar above the waveform.
                Drag a marker chip to reposition it. Click a chip to seek and edit its label, time, or loop role.
              </p>
              <p>
                <strong>Double-click the region bar</strong> between two markers to select that time range (like Reaper&apos;s ruler).
                Click before the first marker selects from the start; after the last marker selects to the end.
              </p>
              <p>
                Set a marker&apos;s loop role to <strong>loop start</strong> or <strong>loop end</strong> to define a practice region.
                When loop repeat is enabled, playback restarts at the loop start when it reaches the loop end.
              </p>
            </div>
          </section>

          <section id="scratchpad-audio-help-effects" className="help-section">
            <h2>Effects</h2>
            <div className="help-section-body">
              <p>
                Open <strong>Process → Effects (FX)</strong> to apply an effect to the active take on the armed
                or first audio track. If you have a selection, the effect applies only to that region.
              </p>
              <ul>
                <li><strong>Normalize</strong> — adjust peak level to a target dBFS.</li>
                <li><strong>Amplify</strong> — add gain in dB.</li>
                <li><strong>EQ</strong> — boost or cut low, mid, and high bands.</li>
                <li><strong>Reverb</strong> — add ambience with mix and decay controls.</li>
              </ul>
              <p>Effects create an undo snapshot so you can revert with <strong>Undo</strong>.</p>
            </div>
          </section>

          <section id="scratchpad-audio-help-stems" className="help-section">
            <h2>Stem separation</h2>
            <div className="help-section-body">
              <p>
                <strong>Process → Separate stems</strong> runs Demucs stem separation on the armed (or first) audio track via the media resolver.
                You must be logged in and have the resolver configured (see Help → Media resolver).
              </p>
              <p>
                When complete, new stem tracks (vocals, drums, bass, other) are added to the project. Stem results are cached
                for faster re-use.
              </p>
            </div>
          </section>

          <section id="scratchpad-audio-help-export" className="help-section">
            <h2>Export and associate</h2>
            <div className="help-section-body">
              <p>
                Use <strong>Export → Mix and save</strong> or <strong>Export…</strong> to open the export dialog.
                Choose project or selection scope, WAV or MP3 format, filename, and optional ID3/WAV metadata tags.
              </p>
              <p>
                From the editor chrome, use <strong>Associate</strong> to attach the mixdown or selected stems to a tune as a linked
                recording or other supported association mode.
              </p>
              <p>
                If silence is detected at the start or end of the first track, an <strong>Auto-trim</strong> option may appear in the
                <strong> Process</strong> menu.
              </p>
            </div>
          </section>

          <section id="scratchpad-audio-help-shortcuts" className="help-section">
            <h2>Keyboard shortcuts</h2>
            <div className="help-section-body">
              <p>Shortcuts are disabled while typing in a text field. On macOS, use ⌘ instead of Ctrl.</p>
              <ul>
                {SCRATCHPAD_SHORTCUT_BINDINGS.map(function(binding) {
                  return (
                    <li key={binding.id}>
                      <strong>{shortcutLabel(binding)}</strong> — {binding.id}
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section id="scratchpad-audio-help-sync" className="help-section">
            <h2>Sync</h2>
            <div className="help-section-body">
              <p>
                When logged in with Google, scratchpad items sync to your <strong>ABC Tune Book/Scratchpad</strong> folder in Google Drive.
                Multitrack audio projects sync as multiple files per project (takes, stems, and mixdown).
              </p>
              <p>
                Data is stored on this device first and uploads when online. Deletes sync via tombstones, similar to tunes.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
