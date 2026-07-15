import React, { useState } from 'react';

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'views', title: 'Views & layout' },
  { id: 'voices', title: 'Voices' },
  { id: 'note-input', title: 'Note input' },
  { id: 'staff', title: 'Staff editing' },
  { id: 'abc-view', title: 'ABC text view' },
  { id: 'piano-roll', title: 'Piano roll' },
  { id: 'midi', title: 'MIDI keyboard' },
  { id: 'virtual-piano', title: 'Virtual piano' },
  { id: 'barlines', title: 'Bar lines & layout' },
  { id: 'marks', title: 'Marks & articulations' },
  { id: 'tuplets', title: 'Tuplets & grace notes' },
  { id: 'selection', title: 'Selection & clipboard' },
  { id: 'quantize', title: 'Quantize' },
  { id: 'wizards', title: 'Layout wizards' },
  { id: 'shortcuts', title: 'Keyboard shortcuts' },
  { id: 'undo', title: 'Undo & redo' },
];

function scrollToSection(id) {
  const el = document.getElementById('notation-help-' + id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function NotationEditorHelp(props) {
  const [activeSection, setActiveSection] = useState('overview');

  function navTo(id) {
    setActiveSection(id);
    scrollToSection(id);
  }

  return (
    <div className="notation-editor-help-page">
      {props.onOpenWalkthrough ? (
        <div className="notation-editor-help-walkthrough-banner">
          <div>
            <strong>Interactive walkthrough</strong>
            <p className="mb-0 text-muted">
              Step-by-step tour of every staff, piano roll, MIDI, and editing feature — 35 guided steps.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={props.onOpenWalkthrough}
          >
            Start walkthrough
          </button>
        </div>
      ) : null}
      <div className="help-layout notation-editor-help-layout">
        <nav className="help-section-nav notation-editor-help-nav" aria-label="Notation editor help sections">
          <ul>
            {SECTIONS.map(function(section) {
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={activeSection === section.id ? 'active' : ''}
                    onClick={function() { navTo(section.id); }}
                  >
                    {section.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="help-main notation-editor-help-main">
          <section id="notation-help-overview" className="help-section">
            <h2>Overview</h2>
            <div className="help-section-body">
              <p>
                The music editor lets you enter and edit tunes visually while keeping ABC notation in sync.
                It works similarly to MuseScore: you choose a duration, enter pitches, and the app writes ABC for you.
              </p>
              <p>
                Use the view-mode dropdown in the Music editor header to switch between <strong>Staff</strong>, <strong>Piano roll</strong>,
                <strong> Staff + Roll</strong>, and <strong>ABC Notes</strong>. The active voice determines what you edit; check voice boxes to show multiple parts in the preview.
              </p>
              <p>
                Toolbars use compact dropdown menus (like bar lines): durations, accidentals, tools, marks, tuplets, and MIDI options.
              </p>
              <p className="help-tip">
                This guide is also listed under <strong>Help → Notation editor</strong> on the main Help page.
                In the Music editor, the <strong>Help</strong> button opens the same content plus an interactive walkthrough.
              </p>
            </div>
          </section>

          <section id="notation-help-views" className="help-section">
            <h2>Views & layout</h2>
            <div className="help-section-body">
              <ul>
                <li><strong>Staff</strong> — standard notation with toolbars for note input, durations, bar lines, quantize, and MIDI. The virtual piano appears below the staff.</li>
                <li><strong>Piano roll</strong> — time-and-pitch grid for the active voice. Drag notes, draw new ones, and resize durations.</li>
                <li><strong>Staff + Roll</strong> — split view with a draggable divider between staff and piano roll.</li>
                <li><strong>ABC Notes</strong> — split pane with editable ABC text on the left and a live notation preview on the right for the active voice.</li>
              </ul>
              <p className="help-tip">
                Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>P</kbd> to cycle Staff, Piano roll, and Staff + Roll views.
                The view-mode dropdown is in the Music editor header (eye icon).
              </p>
            </div>
          </section>

          <section id="notation-help-voices" className="help-section">
            <h2>Voices</h2>
            <div className="help-section-body">
              <p>
                Multi-voice tunes show a <strong>Voices</strong> row at the top of the editor. Click a voice tab to edit that part.
                Press the green <strong>+</strong> button to add another voice, or <strong>×</strong> to delete the active voice (when more than one exists).
              </p>
              <p>
                The active voice is what you edit in the piano roll and ABC textarea. Check voice boxes to show additional parts in the staff and ABC preview; gray notes in the piano roll represent other displayed voices.
                Switching voices saves pending edits for the voice you are leaving before loading the next voice.
              </p>
            </div>
          </section>

          <section id="notation-help-note-input" className="help-section">
            <h2>Note input</h2>
            <div className="help-section-body">
              <p>
                Press <kbd>N</kbd> or click the pencil (✎) button in the duration toolbar to enter <strong>note input</strong> mode.
                Press <kbd>N</kbd> or <kbd>Esc</kbd> again to return to normal mode.
              </p>
              <ul>
                <li>In note input mode, letter keys <kbd>A</kbd>–<kbd>G</kbd> insert notes at the caret using the selected duration.</li>
                <li>Press <kbd>0</kbd> to insert a rest. Right-click on the staff also inserts a rest at the click position.</li>
                <li>In select mode, click a note then press <kbd>A</kbd>–<kbd>G</kbd> to replace its pitch, or <kbd>1</kbd>–<kbd>9</kbd> to change duration.</li>
                <li>Accidentals (−/=/+) apply to the selection when notes are selected; otherwise they set carry for the next typed note.</li>
                <li>Press <kbd>.</kbd> to toggle dotted duration, or pick a duration with keys <kbd>1</kbd>–<kbd>9</kbd> (defaults: <kbd>5</kbd> = quarter note).</li>
                <li><kbd>Shift</kbd>+<kbd>A</kbd>–<kbd>G</kbd> adds a chord tone to the previous note instead of starting a new one.</li>
              </ul>
            </div>
          </section>

          <section id="notation-help-staff" className="help-section">
            <h2>Staff editing</h2>
            <div className="help-section-body">
              <ul>
                <li>Click the staff to move the caret or select a note. The caret indicator appears at the top-left of the staff area.</li>
                <li><kbd>Shift</kbd>+click extends the selection from the anchor note.</li>
                <li>Arrow keys move between events; <kbd>Ctrl</kbd>+arrow keys jump by measure.</li>
                <li>Clicking a note selects it and updates the caret without leaving staff view.</li>
                <li>On <strong>multiline</strong> tunes, click the note on the system line you intend to edit — line 2 clicks should select line 2 notes, not notes from line 1.</li>
                <li>Clicking an <strong>empty beat</strong> inside a partially filled measure may snap to the nearest note or measure boundary; use arrow keys to fine-tune the caret.</li>
              </ul>
              <p>
                The staff toolbar (wand, bar lines, ↵, Q, MIDI) is only visible in staff view.
                Duration buttons and note input appear in the row above the staff.
              </p>
            </div>
          </section>

          <section id="notation-help-abc-view" className="help-section">
            <h2>ABC text view</h2>
            <div className="help-section-body">
              <p>
                The ABC view shows the raw note text for the <strong>active voice</strong> in a monospace textarea.
                The preview pane on the right renders that text as notation, honouring line breaks you type.
              </p>
              <ul>
                <li>Press <kbd>Enter</kbd> to split the music across multiple stored rows — each row becomes a separate line in the preview.</li>
                <li>Type bar lines (<code>|</code>, <code>||</code>, repeats) directly in the text.</li>
                <li>Edits are saved automatically and stay associated with the voice you are editing.</li>
                <li>When you switch voices, the textarea and preview reload that voice&apos;s saved ABC.</li>
              </ul>
            </div>
          </section>

          <section id="notation-help-piano-roll" className="help-section">
            <h2>Piano roll</h2>
            <div className="help-section-body">
              <p>
                Use <strong>Staff + Roll</strong> split view to edit pitch on the staff and timing on the piano roll at the same time.
                <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>P</kbd> cycles Staff, Piano roll, and Split views.
              </p>
              <h4>Tools</h4>
              <ul>
                <li><strong>Sel</strong> — select, drag, marquee-select, and resize notes.</li>
                <li><strong>Draw</strong> — click empty space to insert a note.</li>
                <li><strong>Split</strong> — click a note to split at the grid position.</li>
                <li><strong>Erase</strong> — click a note to delete it.</li>
              </ul>
              <h4>Mouse editing</h4>
              <ul>
                <li><strong>Drag a note</strong> — change timing (horizontal) and pitch (vertical).</li>
                <li><strong>Shift+drag</strong> — timing only. <strong>Alt+drag</strong> — pitch only. <strong>Ctrl+drag</strong> — duplicate (+0.25 beat).</li>
                <li><strong>Resize handles</strong> — drag left handle to change start+duration; right handle for duration only.</li>
                <li><strong>Marquee select</strong> — drag on empty space in Select mode.</li>
                <li><strong>Ruler click</strong> — seek linked media to that beat. <strong>Piano key labels</strong> — audition pitch.</li>
              </ul>
              <h4>Toolbar</h4>
              <ul>
                <li><strong>Snap</strong> (<kbd>s</kbd>) and subdivision dropdown (1/4–1/32 beat).</li>
                <li><strong>Wave</strong> — linked media waveform along the top.</li>
                <li><strong>Q</strong> — quantize dialog. <strong>Align</strong> — slide +0.25 beat, set downbeat from playhead, snap to playback region.</li>
                <li><strong>H- / H+ / V- / V+</strong> — horizontal and vertical zoom.</li>
              </ul>
              <p>Blue notes are the active voice (yellow when selected). Gray notes are other displayed voices. A red playhead and yellow playback region appear when media is linked.</p>
              <p>With piano roll focus: <kbd>←</kbd>/<kbd>→</kbd> nudge timing, <kbd>↑</kbd>/<kbd>↓</kbd> nudge pitch, <kbd>Delete</kbd> removes selection.</p>
            </div>
          </section>

          <section id="notation-help-midi" className="help-section">
            <h2>MIDI keyboard</h2>
            <div className="help-section-body">
              <p>Click the <strong>MIDI</strong> button in the staff toolbar, then open the dropdown for options (Chrome/Edge recommended).</p>
              <ul>
                <li><strong>Input device</strong> — pick a keyboard or use all inputs.</li>
                <li><strong>Step chord</strong> — notes within the chord window (ms) become one chord.</li>
                <li><strong>Add tone</strong> — each key adds to the previous note or chord.</li>
                <li><strong>Single notes</strong> — each key press creates a separate note.</li>
                <li><strong>Record</strong> — capture real-time performance; stop and Apply to insert quantized notes at the caret.</li>
              </ul>
              <p>Step-time MIDI input works in note input mode. Recording works whenever MIDI is enabled.</p>
            </div>
          </section>

          <section id="notation-help-virtual-piano" className="help-section">
            <h2>Virtual piano</h2>
            <div className="help-section-body">
              <p>
                The on-screen keyboard appears <strong>only in staff view</strong>, below the notation.
                Octave buttons (◀ Oct / Oct ▶) are stacked on the left side of the keyboard.
              </p>
              <ul>
                <li>Click a key to insert a note (automatically enables note input if needed).</li>
                <li><kbd>Shift</kbd>+click adds a chord tone.</li>
              </ul>
            </div>
          </section>

          <section id="notation-help-barlines" className="help-section">
            <h2>Bar lines & layout</h2>
            <div className="help-section-body">
              <p>Bar line and layout controls are in the staff toolbar dropdowns:</p>
              <ul>
                <li><strong>|</strong> split button — single bar; menu has double bar, repeats, final, section</li>
                <li><strong>Tools</strong> — layout wizards and quantize</li>
                <li><strong>↵</strong> on the duration row — system break (<kbd>!</kbd>)</li>
              </ul>
              <p>
                In note input mode, press <kbd>|</kbd> to insert a single bar line at the caret,
                or <kbd>!</kbd> for a system break.
              </p>
              <h3>Delete a bar line</h3>
              <ol>
                <li>Select the bar line — click a note next to it, then press <kbd>←</kbd> or <kbd>→</kbd> until the bar is selected (selection outlines that event).</li>
                <li>Press <kbd>Delete</kbd> or <kbd>Backspace</kbd> to remove it.</li>
              </ol>
              <p>
                You can also use <kbd>Ctrl</kbd>+<kbd>Delete</kbd> (or <kbd>Ctrl</kbd>+<kbd>Backspace</kbd>) to remove any selected events entirely.
                In the <strong>ABC text</strong> view (or <strong>ABC Notes</strong> tab), delete the <code>|</code> character from the voice text.
              </p>
              <p>
                Layout wizards (Auto Fix, halve/double lengths, 4/6/8-bar layout) run on <strong>every voice</strong> in the tune.
              </p>
            </div>
          </section>

          <section id="notation-help-marks" className="help-section">
            <h2>Marks & articulations</h2>
            <div className="help-section-body">
              <p>The <strong>♪</strong> marks button toggles a <strong>tie</strong> on the selection or note before the caret (<kbd>T</kbd>). Open the dropdown for more:</p>
              <ul>
                <li><strong>Phrasing</strong> — slur (from selection when possible; otherwise click start/end), clear slur</li>
                <li><strong>Articulations</strong> — staccato, tenuto, accent, staccatissimo, breath mark</li>
                <li><strong>Ornaments</strong> — trill, mordent, turn, pralltriller</li>
                <li><strong>Dynamics</strong> — p, mp, mf, f, ff, crescendo/diminuendo start and end</li>
                <li><strong>Other</strong> — fermata, upbow, downbow</li>
              </ul>
              <p>
                <strong>Slur:</strong> with two or more notes selected, Slur spans first→last (MuseScore-style).
                With one note selected, slur extends to the next note. With no useful selection, enter click start/end mode.
                Drag the blue endpoint handles on a slurred selection; a red snap mark shows the landing note.
                <strong>Clear slur</strong> removes the whole slur group for any selected member.
                Star favorites in the palette menu expand as compact toolbar buttons when width allows.
              </p>
              <p>Marks apply to selected notes. Selecting a note plays a short piano audition. Selected notes use a blue fill highlight. Vertical pitch drag shows a notehead landing marker.</p>
              <p>
                <strong>Edit selected notes:</strong> press <kbd>1</kbd>–<kbd>9</kbd> (or the duration toolbar) to change length;
                press <kbd>A</kbd>–<kbd>G</kbd> to replace pitch; use the accidental control or <kbd>-</kbd>/<kbd>=</kbd>/<kbd>+</kbd> for flat/natural/sharp;
                press <kbd>J</kbd> to respell enharmonically (sharp↔flat, same pitch);
                use this Marks menu for accent, staccato, and other articulations.
              </p>
            </div>
          </section>

          <section id="notation-help-tuplets" className="help-section">
            <h2>Tuplets & grace notes</h2>
            <div className="help-section-body">
              <p>The <strong>(3</strong> tuplets button starts triplet input mode; new notes inherit tuplet timing until the group is complete or you end tuplet mode. With two or more notes selected, the same control applies the tuplet to the selection instead.</p>
              <ul>
                <li>Choose duplet, triplet, quadruplet, quintuplet, or sextuplet from the menu.</li>
                <li><strong>Break beam before selection</strong> (Tools or Tuplets menu) inserts an ABC beam break before the second and later selected notes.</li>
                <li><strong>Grace before</strong> adds a short grace note before the selected note (acciaccatura or appoggiatura).</li>
              </ul>
              <p>A badge shows when tuplet or slur mode is active.</p>
            </div>
          </section>

          <section id="notation-help-selection" className="help-section">
            <h2>Selection & clipboard</h2>
            <div className="help-section-body">
              <ul>
                <li><strong>Click</strong> a note, rest, or bar line — select that event (sets the selection anchor).</li>
                <li><kbd>Shift</kbd>+click — contiguous range from the anchor to the clicked event.</li>
                <li><kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click — toggle an event in or out of the selection.</li>
                <li><strong>Drag on empty staff</strong> — marquee-select events whose glyphs intersect the box.</li>
                <li><strong>Double-click</strong> a note — select the whole measure (through that measure&apos;s bar line).</li>
                <li><kbd>←</kbd>/<kbd>→</kbd> — move selection to previous/next event (works even if the staff left focus on the page body).</li>
                <li><kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> — extend the selection from the anchor.</li>
                <li><strong>Vertical drag</strong> on a note — a notehead ghost shows the landing pitch; commit on release.</li>
                <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> — copy, cut, paste selected events (internal clipboard).</li>
                <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> — swap selection with clipboard.</li>
                <li><kbd>R</kbd> — repeat last note or repeat selection at caret.</li>
                <li><kbd>Q</kbd> / <kbd>W</kbd> — halve / double duration; <kbd>Shift</kbd>+<kbd>Q</kbd>/<kbd>W</kbd> dot-aware.</li>
                <li><kbd>Delete</kbd> — turn selected notes into rests; remove selected bar lines / system breaks. <kbd>Ctrl</kbd>+<kbd>Delete</kbd> removes any selected events entirely.</li>
                <li><kbd>↑</kbd>/<kbd>↓</kbd> — chromatic transpose; <kbd>Ctrl</kbd>+↑/↓ octave; <kbd>Alt</kbd>+<kbd>Shift</kbd>+↑/↓ diatonic.</li>
                <li><kbd>J</kbd> — enharmonic respell of selected pitches.</li>
                <li><kbd>Insert</kbd> or <kbd>Ctrl</kbd>+<kbd>B</kbd> — insert an empty measure (full-bar rest + bar line) at the caret.</li>
              </ul>
            </div>
          </section>

          <section id="notation-help-quantize" className="help-section">
            <h2>Quantize</h2>
            <div className="help-section-body">
              <p>
                Open <strong>Tools → Quantize…</strong> in the staff toolbar, or press <strong>Q</strong> in the piano roll toolbar.
                If notes are selected, only those are quantized; otherwise the entire active voice is processed.
                Timing snaps in beat space onto the chosen subdivision. Notes already on that grid will not move — the dialog reports when nothing changed.
              </p>
              <ul>
                <li><strong>Strength</strong> — 0–100% how strongly notes move toward the grid.</li>
                <li><strong>Grid subdivision</strong> — 1/4, 1/8, 1/16, or 1/32 beat.</li>
                <li><strong>Quantize start / duration</strong> — choose which aspects to adjust.</li>
              </ul>
              <p>
                The piano roll <strong>Align</strong> menu offers additional actions: slide selection +0.25 beat,
                set downbeat from playhead, and snap to playback region start.
              </p>
            </div>
          </section>

          <section id="notation-help-wizards" className="help-section">
            <h2>Layout wizards</h2>
            <div className="help-section-body">
              <p>The wand button in the staff toolbar opens wizards that transform note text:</p>
              <ul>
                <li><strong>Auto Fix</strong> — clean up common ABC formatting issues.</li>
                <li><strong>Halve / Double Note Lengths</strong> — scale all note durations.</li>
                <li><strong>4 / 6 / 8 Bar Layout</strong> — reflow music with regular line breaks.</li>
              </ul>
              <p className="help-tip">Import from media is available in the Info tab under Links, not in the wizard dialog.</p>
            </div>
          </section>

          <section id="notation-help-shortcuts" className="help-section">
            <h2>Keyboard shortcuts</h2>
            <div className="help-section-body">
              <ul>
                <li><kbd>N</kbd> / <kbd>Esc</kbd> — toggle / exit note input</li>
                <li><kbd>1</kbd>–<kbd>9</kbd> — duration presets; <kbd>.</kbd> dotted; <kbd>0</kbd> rest</li>
                <li><kbd>A</kbd>–<kbd>G</kbd> — pitch; <kbd>Shift</kbd>+letter chord tone</li>
                <li><kbd>-</kbd> / <kbd>=</kbd> / <kbd>+</kbd> — flat / natural / sharp carry</li>
                <li><kbd>T</kbd> tie; <kbd>R</kbd> repeat; <kbd>Q</kbd>/<kbd>W</kbd> halve/double duration</li>
                <li><kbd>|</kbd> bar line; <kbd>!</kbd> system break (note input mode)</li>
                <li>Select bar + <kbd>Delete</kbd> — remove bar line</li>
                <li><kbd>←</kbd>/<kbd>→</kbd> events; <kbd>Shift</kbd>+arrows extend selection; <kbd>Ctrl</kbd>+arrows measures</li>
                <li><kbd>↑</kbd>/<kbd>↓</kbd> chromatic; <kbd>Ctrl</kbd> octave; <kbd>Alt</kbd>+<kbd>Shift</kbd> diatonic</li>
                <li><kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>X</kbd>/<kbd>V</kbd> clipboard; <kbd>s</kbd> toggle snap</li>
                <li><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>P</kbd> — cycle Staff / Piano roll / Split</li>
                <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> — undo / redo</li>
              </ul>
              <p className="help-tip">Use <strong>Start walkthrough</strong> at the top of this guide for a step-by-step tour of every feature.</p>
            </div>
          </section>

          <section id="notation-help-undo" className="help-section">
            <h2>Undo & redo</h2>
            <div className="help-section-body">
              <p>
                Use the undo and redo buttons in the editor header bar, or <kbd>Ctrl</kbd>+<kbd>Z</kbd> and
                <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> when keyboard focus is not inside a text field.
              </p>
              <p>Each save creates a history entry labelled with the type of edit (e.g. &quot;Edit notation&quot;, &quot;Edit ABC text&quot;).</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
