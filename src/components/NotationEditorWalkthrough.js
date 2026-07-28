import React, { useState } from 'react';

export const WALKTHROUGH_PHASES = [
  { id: 'start', title: 'Getting started' },
  { id: 'staff-input', title: 'Staff note input' },
  { id: 'staff-edit', title: 'Staff editing' },
  { id: 'midi', title: 'MIDI keyboard' },
  { id: 'piano-roll', title: 'Piano roll' },
  { id: 'advanced', title: 'Advanced features' },
  { id: 'reference', title: 'Shortcuts & history' },
];

export const WALKTHROUGH_STEPS = [
  {
    id: 'welcome',
    phase: 'start',
    title: 'Welcome to the music editor',
    summary: 'Learn how the editor keeps ABC notation in sync while you edit visually.',
    body: [
      'The music editor lets you enter and edit tunes on staff notation, a piano roll, or raw ABC text. Every edit is saved automatically and written back to ABC notation.',
      'Open any tune and switch to the Music editor panel. The header bar above the editor has undo/redo, a tune search box, and a view-mode dropdown (eye icon) for switching between Staff, Piano roll, Split, ABC, and other panels.',
      'When a tune has linked media, the media seek slider below the header lets you scrub playback while you align notes to the recording.',
    ],
    tryIt: [
      'Open a tune in the Music editor.',
      'Locate the undo/redo buttons and view-mode dropdown in the editor header.',
      'If the tune has a linked recording, drag the media seek slider to hear a section.',
    ],
  },
  {
    id: 'views',
    phase: 'start',
    title: 'Switching editor views',
    summary: 'Choose how you want to see and edit the music.',
    body: [
      'Use the view-mode dropdown in the Music editor header to switch between Staff, Piano roll, Staff + Roll (split), and ABC Notes.',
      'Staff view shows standard notation with editing toolbars and a virtual piano below. Piano roll view shows a time-and-pitch grid. Split view shows both, with a draggable divider between them. ABC view shows editable ABC text beside a live preview.',
      'Press Ctrl+Alt+P to cycle quickly between Staff, Piano roll, and Split views (ABC is not included in the cycle).',
    ],
    tryIt: [
      'Open the view-mode dropdown and select Staff.',
      'Switch to Piano roll, then Staff + Roll.',
      'Press Ctrl+Alt+P a few times to cycle views.',
    ],
  },
  {
    id: 'voices',
    phase: 'start',
    title: 'Working with voices',
    summary: 'Manage multiple parts in a single tune.',
    body: [
      'Multi-voice tunes show a Voices row at the top of the editor. Click a voice tab to make it the active voice — that is the part you edit in the piano roll and ABC textarea.',
      'Check the box on a voice tab to include that voice in the staff preview and ABC preview. Unchecked voices are hidden from the score but remain in the tune.',
      'Press the green + button to add a voice, or × to delete the active voice (when more than one exists). Use the name field beside the tabs to rename the active voice (this updates the ABC V: header).',
      'Gray notes in the piano roll represent other displayed voices. The active voice is shown in blue (yellow when selected).',
    ],
    tryIt: [
      'Click a different voice tab and enter a few notes.',
      'Check a second voice box and confirm both parts appear in the staff preview.',
      'Rename the active voice in the text field.',
    ],
  },
  {
    id: 'modes',
    phase: 'staff-input',
    title: 'Normal mode vs note input mode',
    summary: 'Understand the two interaction modes on the staff.',
    body: [
      'In normal mode (default), clicking the staff selects notes and moves the caret. Arrow keys step between events. Clicking a note also seeks playback to that position (unless you are in note input mode).',
      'Press N or click the pencil (✎) button in the duration toolbar to enter note input mode. A ghost caret label at the top-left of the staff shows “Input at event N” or “Caret at event N”.',
      'Press N or Esc to return to normal mode. In note input mode, staff clicks move the caret without seeking playback.',
    ],
    tryIt: [
      'Press N to enter note input mode and watch the ghost caret label appear.',
      'Click different positions on the staff to move the caret.',
      'Press Esc to return to normal mode.',
    ],
  },
  {
    id: 'durations',
    phase: 'staff-input',
    title: 'Durations and dotted notes',
    summary: 'Set how long each note lasts before you enter pitches.',
    body: [
      'The duration toolbar (row with the pencil button) controls note length. The split duration button shows the current value (default key 5 = quarter note, labelled “4”).',
      'Press keys 1–9 to pick a duration preset: 1 = sixty-fourth, 2 = thirty-second, 3 = sixteenth, 4 = eighth, 5 = quarter, 6 = half, 7 = whole, 8 = double whole, 9 = longa.',
      'Press . or click the dot button to toggle a dotted duration. The main duration button applies the current duration to selected notes.',
    ],
    tryIt: [
      'Press 5 to set quarter-note duration.',
      'Press . to make it dotted.',
      'Select a note and click the duration button to change its length.',
    ],
  },
  {
    id: 'accidentals',
    phase: 'staff-input',
    title: 'Accidentals',
    summary: 'Sharps, flats, and naturals on selection or next typed note.',
    body: [
      'With notes selected, the accidental control (♮/♭/♯) and shortcuts (-/=/+) apply to the selection.',
      'With no selection (note input), they set accidental carry for the next note(s) you type. Open the menu for double-flat (𝄫), double-sharp (𝄪), and Clear carry.',
      'Keyboard shortcuts: - (minus) = flat, = (equals) = natural, + (plus) = sharp.',
    ],
    tryIt: [
      'Select a note, press + to sharpen it.',
      'In note input, press + then G to insert G♯; Clear carry before a natural pitch.',
    ],
  },
  {
    id: 'enter-notes',
    phase: 'staff-input',
    title: 'Entering notes and rests',
    summary: 'Type pitches directly on the staff.',
    body: [
      'In note input mode, press A–G to insert notes at the caret using the selected duration and accidental carry.',
      'Press 0 to insert a rest. Right-click on the staff also inserts a rest at the click position.',
      'Press | to insert a bar line, or ! to insert a system break (line break in the score).',
    ],
    tryIt: [
      'Enter note input mode and type C D E F G on the keyboard.',
      'Press 0 to add a rest, then continue with more pitches.',
      'Press | to add a bar line.',
    ],
  },
  {
    id: 'chords',
    phase: 'staff-input',
    title: 'Building chords',
    summary: 'Stack multiple pitches on one note head.',
    body: [
      'After entering a note, hold Shift and press A–G to add chord tones to that note instead of creating a new event.',
      'The same Shift+click behaviour works on the virtual piano and on a MIDI keyboard when Add tone chord mode is selected.',
    ],
    tryIt: [
      'Enter a C note, then press Shift+G to add G as a chord tone.',
      'Add another tone with Shift+E.',
    ],
  },
  {
    id: 'virtual-piano',
    phase: 'staff-input',
    title: 'Virtual piano',
    summary: 'Click pitches on an on-screen keyboard.',
    body: [
      'Toggle the piano button in the staff toolbar to show an on-screen keyboard under the toolbar. Click white or black keys to insert notes (note input mode is enabled automatically if needed).',
      'Use ◀ Oct and Oct ▶ on the left to shift the keyboard range up or down an octave.',
      'Shift+click a key to add a chord tone. Keys highlight when corresponding MIDI notes are active.',
    ],
    tryIt: [
      'Turn on the piano toolbar button, then click a few keys on the virtual piano.',
      'Shift+click to build a chord.',
      'Change octave and enter notes in a higher register.',
    ],
  },
  {
    id: 'selection',
    phase: 'staff-edit',
    title: 'Selecting notes on the staff',
    summary: 'Click, extend, and navigate selections.',
    body: [
      'Click a note to select it and update the caret. Shift+click a second note to extend the selection from the anchor to that note.',
      'Arrow keys move the caret to the previous or next event. Ctrl+arrow keys jump to the previous or next measure.',
      'Click empty space on the staff in note input mode to position the caret without selecting a note.',
    ],
    tryIt: [
      'Click a note, then Shift+click another to select a range.',
      'Use arrow keys to move the caret event by event.',
      'Hold Ctrl and press → to jump to the next measure.',
    ],
  },
  {
    id: 'barlines',
    phase: 'staff-edit',
    title: 'Bar lines',
    summary: 'Insert every common bar line type.',
    body: [
      'Click the | split button in the staff toolbar to insert a single bar line. Open the menu for more types:',
      '|| double bar, |: start repeat, :| end repeat, :|: end/start repeat, |] final bar, [| section bar.',
      'In note input mode, press | on the keyboard to insert a single bar line.',
    ],
    tryIt: [
      'Insert a single bar line with the main | button.',
      'Open the bar line menu and add a start repeat (|:).',
      'Add a matching end repeat (:|).',
    ],
  },
  {
    id: 'signatures',
    phase: 'staff-edit',
    title: 'Key and time signature changes',
    summary: 'Insert mid-tune [K:…] and [M:…] changes.',
    body: [
      'The K split button in the staff toolbar opens signature changes.',
      'Key change… inserts [K:…] at the caret — for example [K:Am] partway through a tune.',
      'Time signature change… inserts [M:…] at the start of the current bar (after the preceding bar line).',
      'Select an existing inline key or meter token and open the same menu to edit it.',
      'Tune-level key and meter (Info tab or staff header click) still set the opening signature for the whole tune.',
    ],
    tryIt: [
      'Place the caret after a few notes and insert a key change to Am.',
      'Move to the start of a later bar and insert a 3/4 time signature change.',
      'Switch to ABC view and confirm [K:…] / [M:…] tokens appear in the voice text.',
    ],
  },
  {
    id: 'layout-breaks',
    phase: 'staff-edit',
    title: 'System breaks and layout tools',
    summary: 'Control line breaks in the score.',
    body: [
      'Open the Tools dropdown (wand icon) and choose System break ↵ to insert a line break at the caret. In note input mode, press ! instead.',
      'The same Tools menu opens Quantize… and Layout wizards (covered later in this walkthrough).',
      'The main wand button click also opens the layout wizards dialog directly.',
    ],
    tryIt: [
      'Place the caret mid-phrase and insert a system break from the Tools menu.',
      'Confirm the notation wraps to a new line in the preview.',
    ],
  },
  {
    id: 'marks',
    phase: 'staff-edit',
    title: 'Ties, slurs, and articulations',
    summary: 'Add phrasing marks and expression.',
    body: [
      'Click ♪ or press T to toggle a tie on the selected note or the note before the caret. Open the marks menu for more options.',
      'Phrasing: Slur mode (click a start note, then an end note), Clear slur.',
      'Articulations: Staccato, Tenuto, Accent, Staccatissimo, Breath mark.',
      'Ornaments: Trill, Mordent, Turn, Pralltriller.',
      'Dynamics: p, mp, mf, f, ff, Crescendo start/end, Diminuendo start/end.',
      'Other: Fermata, Upbow, Downbow.',
      'A blue “Slur” badge appears in the toolbar when slur mode is active.',
    ],
    tryIt: [
      'Select a note and press T to add a tie.',
      'Open the marks menu and add Staccato to a selected note.',
      'Enable Slur mode, click a start note, then click an end note.',
    ],
  },
  {
    id: 'tuplets',
    phase: 'staff-edit',
    title: 'Tuplets and grace notes',
    summary: 'Enter irregular groupings and grace notes.',
    body: [
      'Click the (3 tuplets button to start triplet input mode. Each new note inherits tuplet timing until the group is complete. Click the button again or choose End tuplet mode to stop.',
      'Open the tuplets menu for Duplet (2:3), Triplet (3:2), Quadruplet (4:3), Quintuplet (5:4), and Sextuplet (6:4).',
      'Grace notes: choose Grace before (acciaccatura) or Grace before (appoggiatura) to add a short ornamental note before the selected note.',
      'A blue “Tuplet N” badge shows when tuplet mode is active.',
    ],
    tryIt: [
      'Start triplet mode and enter three notes.',
      'Select a note and add a grace note from the tuplets menu.',
    ],
  },
  {
    id: 'duration-edits',
    phase: 'staff-edit',
    title: 'Changing note durations',
    summary: 'Halve, double, or scale durations after entry.',
    body: [
      'Press Q to halve the duration of the selection or the note before the caret. Press W to double it.',
      'Press Shift+Q or Shift+W for dot-aware halving and doubling (preserves dotted relationships).',
      'You can also select notes and click the duration button in the toolbar to apply the current duration preset.',
    ],
    tryIt: [
      'Select a half note and press Q to make it a quarter note.',
      'Press W to double it back.',
      'Try Shift+Q on a dotted note and observe the dot-aware behaviour.',
    ],
  },
  {
    id: 'transpose',
    phase: 'staff-edit',
    title: 'Transposing notes',
    summary: 'Move pitches up and down.',
    body: [
      '↑ and ↓ transpose chromatically by one semitone. With a selection, all selected notes move.',
      'Ctrl+↑ and Ctrl+↓ transpose by one octave (12 semitones).',
      'Alt+Shift+↑ and Alt+Shift+↓ transpose diatonically (two semitone steps in the current key context).',
      'Click the clef or key signature on the staff to open the transpose modal for the whole tune.',
    ],
    tryIt: [
      'Select a few notes and press ↑ twice.',
      'Press Ctrl+↓ to drop them an octave.',
      'Click the key signature to explore the tune-level transpose dialog.',
    ],
  },
  {
    id: 'clipboard',
    phase: 'staff-edit',
    title: 'Selection, clipboard, and repeat',
    summary: 'Copy, cut, paste, and duplicate musical material.',
    body: [
      'Ctrl+C copies the selection. Ctrl+X cuts. Ctrl+V pastes at the caret (in the piano roll, paste aligns to the first selected note’s beat).',
      'On touch devices, use the Copy / Cut / Paste / Del toolbar buttons (Swap is under the overflow menu).',
      'Ctrl+Shift+X swaps the selection with the clipboard contents.',
      'Press R to repeat the selection at the caret, or repeat the last note if nothing is selected.',
      'Delete or Backspace turns selected notes into rests and removes selected bar lines. Ctrl+Delete or Ctrl+Backspace removes selected events entirely.',
      'Ctrl+K edits a chord symbol; Ctrl+F edits piano fingering (0–5). Space advances to the next note.',
      'The clipboard is internal to the editor session, not the system clipboard.',
    ],
    tryIt: [
      'Select a short phrase, press Ctrl+C, move the caret, and press Ctrl+V.',
      'Press R to repeat the last entered note.',
      'Select notes and press Delete to convert them to rests.',
      'Select a bar line with ←/→ then Delete to remove it.',
    ],
  },
  {
    id: 'staff-playback',
    phase: 'staff-edit',
    title: 'Staff playback and tempo',
    summary: 'Hear the tune and adjust tempo.',
    body: [
      'Click a note on the staff to seek ABC synth playback to that position (disabled in note input mode).',
      'Click the tempo marking to open the tempo control when editable tempo is enabled. Changes are saved to the tune.',
      'A repeats editor button (top-right of the staff) opens the repeats modal when show-repeats is enabled.',
      'If the browser blocks autoplay, a tap-to-play prompt may appear before audio starts.',
    ],
    tryIt: [
      'Click different notes and listen for playback to jump.',
      'Open the tempo control and adjust the speed.',
    ],
  },
  {
    id: 'midi-setup',
    phase: 'midi',
    title: 'Setting up MIDI input',
    summary: 'Connect a MIDI keyboard (Chrome or Edge recommended).',
    body: [
      'Click the MIDI button in the staff toolbar (green when enabled). If your browser supports Web MIDI, a dropdown panel opens.',
      'Toggle Enable MIDI input or click the main MIDI button to request access. Choose a specific input device or leave All inputs selected.',
      'A green activity dot appears when MIDI notes are being received.',
    ],
    tryIt: [
      'Click MIDI and enable input.',
      'Play a few keys on your MIDI keyboard and watch the activity indicator.',
    ],
  },
  {
    id: 'midi-modes',
    phase: 'midi',
    title: 'MIDI chord modes',
    summary: 'Choose how simultaneous keys are interpreted.',
    body: [
      'Single notes (default): each key press creates a separate note event.',
      'Step chord: notes played within the chord window (10–500 ms, default 50 ms) are combined into one chord at the caret.',
      'Add tone: each key adds a pitch to the previous note or chord instead of starting a new event.',
      'Step-time MIDI input works in note input mode. Recording works whenever MIDI is enabled.',
    ],
    tryIt: [
      'Enter note input mode, enable MIDI, and play single notes in Single notes mode.',
      'Switch to Step chord, set the chord window, and play a triad quickly.',
      'Try Add tone mode to stack chord tones one key at a time.',
    ],
  },
  {
    id: 'midi-record',
    phase: 'midi',
    title: 'MIDI recording',
    summary: 'Capture a live performance and quantize it into notation.',
    body: [
      'In the MIDI dropdown, press Start recording to capture note on/off events with timestamps. A red ● badge appears on the MIDI button while recording.',
      'Press Stop recording when finished. Choose Apply to convert the performance into quantized notes inserted at the caret, or Discard to clear the buffer.',
      'Apply uses your most recent quantize settings (strength and grid subdivision).',
    ],
    tryIt: [
      'Position the caret where you want recorded notes to begin.',
      'Record a short phrase, stop, and Apply.',
      'Undo if needed and try again with different quantize settings.',
    ],
  },
  {
    id: 'piano-roll-overview',
    phase: 'piano-roll',
    title: 'Piano roll overview',
    summary: 'Edit timing and pitch on a grid.',
    body: [
      'Switch to Piano roll or Staff + Roll view. The piano roll shows time horizontally (beats) and pitch vertically.',
      'Blue notes belong to the active voice; selected notes turn yellow. Gray semi-transparent notes are other displayed voices.',
      'A red vertical playhead tracks linked media playback. A yellow-tinted band marks the playback region from the link’s start and end beats.',
      'Faint full-height rectangles indicate rests. A waveform may appear along the top when Wave is enabled.',
    ],
    tryIt: [
      'Switch to Piano roll view and locate the active-voice notes.',
      'If the tune has linked media, play it and watch the playhead move.',
    ],
  },
  {
    id: 'piano-roll-tools',
    phase: 'piano-roll',
    title: 'Piano roll tools',
    summary: 'Select, draw, split, and erase notes.',
    body: [
      'Sel (Select): default tool for selecting, dragging, and marquee-selecting notes.',
      'Draw: click empty canvas space to insert a note at the snapped beat and pitch.',
      'Split: click a note to split it at the click position on the beat grid.',
      'Erase: click a note to delete it.',
      'In Select mode, clicking empty canvas also inserts a note (same as Draw for empty clicks).',
    ],
    tryIt: [
      'Select Draw and click empty space to add a note.',
      'Switch to Split and click the middle of a note to divide it.',
      'Use Erase to remove a note, then undo if needed.',
    ],
  },
  {
    id: 'piano-roll-drag',
    phase: 'piano-roll',
    title: 'Dragging and resizing notes',
    summary: 'Fine-tune timing and pitch with the mouse.',
    body: [
      'Drag a note horizontally to change timing, vertically to change pitch (both snap to the grid when Snap is on).',
      'Shift+drag: timing only. Alt+drag: pitch only. Ctrl+drag: duplicate the note (offset by 0.25 beats).',
      'Drag the left resize handle to change the note start and duration together. Drag the right handle to change duration only.',
      'Drag on empty canvas in Select mode to marquee-select multiple notes.',
      'Click piano key labels on the left to audition a pitch. Click the beat ruler to seek media to that beat.',
    ],
    tryIt: [
      'Drag a note to a new pitch and beat.',
      'Shift+drag to adjust timing only.',
      'Ctrl+drag to duplicate a note.',
      'Resize a note using the left and right handles.',
    ],
  },
  {
    id: 'piano-roll-snap',
    phase: 'piano-roll',
    title: 'Snap and grid settings',
    summary: 'Control how notes align to the beat grid.',
    body: [
      'Toggle Snap on or off with the Snap button, or press s on the keyboard (when not in a text field).',
      'Use the snap subdivision dropdown to choose 1/4, 1/8, 1/16, or 1/32 of a beat.',
    ],
    tryIt: [
      'Turn Snap off, drag a note freely, then turn Snap back on.',
      'Change the subdivision to 1/8 and insert a note — notice how it aligns.',
    ],
  },
  {
    id: 'piano-roll-overlays',
    phase: 'piano-roll',
    title: 'Overlays: waveform and region',
    summary: 'Visual guides for aligning with recordings.',
    body: [
      'Wave: show or hide the linked media audio waveform along the top of the canvas.',
      'The playback region highlight and playhead help you align notes to a specific section of linked media.',
    ],
    tryIt: [
      'Toggle Wave on and off while media plays.',
      'Click the ruler to seek to a downbeat and align a note visually.',
    ],
  },
  {
    id: 'piano-roll-keyboard',
    phase: 'piano-roll',
    title: 'Piano roll keyboard shortcuts',
    summary: 'Nudge and delete notes from the keyboard.',
    body: [
      'When focus is on the piano roll workspace: ← and → nudge the selection by one snap grid step horizontally.',
      '↑ and ↓ nudge the selection by one semitone vertically.',
      'Delete or Backspace removes selected notes.',
      'Ctrl+C / Ctrl+X / Ctrl+V work for copy, cut, and paste as on the staff.',
    ],
    tryIt: [
      'Select a note in the piano roll and press → a few times.',
      'Press ↑ to raise the pitch one semitone.',
      'Press Delete to remove the selection.',
    ],
  },
  {
    id: 'piano-roll-zoom',
    phase: 'piano-roll',
    title: 'Zoom controls',
    summary: 'Adjust horizontal and vertical scale.',
    body: [
      'H- and H+ change horizontal zoom (beat width ±8, range 16–120 pixels per beat).',
      'V- and V+ change vertical zoom (row height ±2, range 8–24 pixels per semitone row).',
      'Zoom settings apply to the current session view and help when editing dense passages or wide timelines.',
    ],
    tryIt: [
      'Press H+ several times to zoom in horizontally.',
      'Press V+ to spread pitches farther apart vertically.',
      'Reset with H- and V- when finished.',
    ],
  },
  {
    id: 'split-view',
    phase: 'advanced',
    title: 'Split view',
    summary: 'Edit pitch on the staff and timing on the roll simultaneously.',
    body: [
      'Choose Staff + Roll from the view-mode dropdown. The staff appears on top and the piano roll below.',
      'Drag the horizontal resizer between them to adjust the split ratio. The ratio is saved in local storage for your next visit.',
      'Edits in either pane update the same active voice. Toolbars for both staff and piano roll are available.',
    ],
    tryIt: [
      'Switch to Staff + Roll view.',
      'Enter a note on the staff, then drag its timing in the piano roll below.',
      'Drag the resizer to give more room to the piano roll.',
    ],
  },
  {
    id: 'abc-view',
    phase: 'advanced',
    title: 'ABC text view',
    summary: 'Edit raw ABC for the active voice.',
    body: [
      'Select ABC Notes from the view-mode dropdown. The left pane is a monospace textarea with the active voice’s note text; the right pane shows a live notation preview.',
      'Press Enter to split music across multiple rows — each row becomes a separate line in the preview.',
      'Type bar lines, repeats, and ABC symbols directly. Edits auto-save after a short delay and re-parse into the event model.',
      'When you switch to ABC view, the textarea selection syncs to the current caret event range.',
    ],
    tryIt: [
      'Switch to ABC view and add a line break with Enter.',
      'Type | in the text to add a bar line and watch the preview update.',
      'Switch voices and confirm the textarea reloads that voice’s ABC.',
    ],
  },
  {
    id: 'quantize',
    phase: 'advanced',
    title: 'Quantize',
    summary: 'Snap note starts and durations to a grid.',
    body: [
      'Open Quantize from Tools → Quantize… in the staff toolbar, or press Q in the piano roll toolbar.',
      'Strength (0–100%): how strongly notes move toward the grid.',
      'Grid subdivision: 1/4, 1/8, 1/16, or 1/32 beat.',
      'Quantize start and Quantize duration: choose which aspects to adjust.',
      'If notes are selected, only those are quantized; otherwise the entire active voice is processed.',
    ],
    tryIt: [
      'Select a few slightly off-grid notes in the piano roll.',
      'Open Quantize, set strength to 100%, and Apply.',
    ],
  },
  {
    id: 'align',
    phase: 'advanced',
    title: 'Align actions',
    summary: 'Match notes to recordings and playback regions.',
    body: [
      'Open the Align dropdown in the piano roll toolbar:',
      'Slide selection +0.25 beat — nudge selected notes (or all notes if none selected) forward.',
      'Set downbeat from playhead — offset all notes so the earliest aligns with the current media beat.',
      'Snap to playback region — shift the selection so the earliest selected note starts at the link region start.',
    ],
    tryIt: [
      'Play media to a downbeat and choose Set downbeat from playhead.',
      'Select notes near the link start and choose Snap to playback region.',
    ],
  },
  {
    id: 'wizards',
    phase: 'advanced',
    title: 'Layout wizards',
    summary: 'Batch-transform note text across all voices.',
    body: [
      'Click the wand button in the staff toolbar (or Tools → Layout wizards) to open the wizards dialog.',
      'Auto Fix — clean up common ABC formatting issues on every voice.',
      'Halve Note Lengths / Double Note Lengths — scale all durations by 0.5× or 2×.',
      '4 / 6 / 8 Bar Layout — reflow music with regular line breaks every N bars.',
      'Import from media is not in this dialog; use the Info tab and Links section for media import workflows.',
    ],
    tryIt: [
      'Open the wizards and run Auto Fix on a tune with formatting quirks.',
      'Try 4 Bar Layout to reflow a long phrase with regular breaks.',
    ],
  },
  {
    id: 'shortcuts',
    phase: 'reference',
    title: 'Keyboard shortcuts reference',
    summary: 'Quick reference for the most-used shortcuts.',
    body: [
      'Mode: N toggle note input, Esc exit note input, Ctrl+Alt+P cycle Staff/Piano roll/Split.',
      'Entry: 1–9 durations, . dotted, 0 rest, A–G pitch, Shift+A–G chord tone, | bar line, ! system break.',
      'Editing: T tie, R repeat, Q/W halve/double duration, Shift+Q/W dot-aware, -/=/+ accidentals.',
      'Navigation: ←/→ events, Ctrl+←/→ measures, ↑/↓ chromatic transpose, Ctrl+↑/↓ octave, Alt+Shift+↑/↓ diatonic.',
      'Clipboard: Ctrl+C/X/V copy/cut/paste, Ctrl+Shift+X swap, Delete rests, Ctrl+Delete remove.',
      'Piano roll: s toggle snap, ←/→/↑/↓ nudge selection (when piano roll focused).',
      'History: Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo (when not in a text field).',
    ],
    tryIt: [
      'Pick three shortcuts you have not used yet and try them on a test tune.',
      'Refer to the full help guide (?) for section-by-section documentation.',
    ],
  },
  {
    id: 'undo',
    phase: 'reference',
    title: 'Undo, redo, and auto-save',
    summary: 'Every edit is tracked in tune history.',
    body: [
      'Use the undo and redo buttons in the Music editor header, or Ctrl+Z and Ctrl+Shift+Z (Ctrl+Y also redoes) when keyboard focus is not inside a text field.',
      'Each save creates a labelled history entry — for example “Edit notation”, “Piano roll edit”, “Edit ABC text”, “Quantize”, “MIDI record”, or “Virtual piano”.',
      'Notation edits auto-save with a short debounce. ABC text edits save after about 300 ms of idle typing. Switching voices saves pending edits for the voice you are leaving.',
      'You have completed the walkthrough. Use the ? help button anytime for the full reference guide.',
    ],
    tryIt: [
      'Make an edit, undo it with Ctrl+Z, then redo.',
      'Open the undo dropdown in the header to see labelled history entries.',
    ],
  },
];

function Kbd(props) {
  return <kbd>{props.children}</kbd>;
}

function StepBody(props) {
  const step = props.step;
  return (
    <div className="notation-walkthrough-step-content">
      <p className="notation-walkthrough-summary">{step.summary}</p>
      {step.body.map(function(paragraph, i) {
        return <p key={i}>{paragraph}</p>;
      })}
      {step.tryIt && step.tryIt.length > 0 ? (
        <div className="notation-walkthrough-tryit">
          <h4>Try it</h4>
          <ol>
            {step.tryIt.map(function(item, i) {
              return <li key={i}>{item}</li>;
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export default function NotationEditorWalkthrough(props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = WALKTHROUGH_STEPS[stepIndex];
  const phase = WALKTHROUGH_PHASES.find(function(p) { return p.id === step.phase; });
  const total = WALKTHROUGH_STEPS.length;
  const progress = ((stepIndex + 1) / total) * 100;

  function goTo(index) {
    const clamped = Math.max(0, Math.min(total - 1, index));
    setStepIndex(clamped);
  }

  return (
    <div className="notation-editor-walkthrough">
      <div className="notation-walkthrough-progress" aria-hidden="true">
        <div className="notation-walkthrough-progress-bar" style={{ width: progress + '%' }} />
      </div>

      <div className="notation-walkthrough-layout">
        <nav className="notation-walkthrough-outline" aria-label="Walkthrough sections">
          <p className="notation-walkthrough-outline-heading">Sections</p>
          <ul>
            {WALKTHROUGH_PHASES.map(function(phaseEntry) {
              const firstIndex = WALKTHROUGH_STEPS.findIndex(function(s) { return s.phase === phaseEntry.id; });
              const stepCount = WALKTHROUGH_STEPS.filter(function(s) { return s.phase === phaseEntry.id; }).length;
              const isActive = step.phase === phaseEntry.id;
              return (
                <li key={phaseEntry.id}>
                  <button
                    type="button"
                    className={isActive ? 'active' : ''}
                    onClick={function() { goTo(firstIndex); }}
                  >
                    {phaseEntry.title}
                    <span className="notation-walkthrough-outline-count">{stepCount}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <article className="notation-walkthrough-main">
          <header className="notation-walkthrough-header">
            <p className="notation-walkthrough-phase">{phase ? phase.title : ''}</p>
            <h2>{step.title}</h2>
            <p className="notation-walkthrough-step-counter">
              Step {stepIndex + 1} of {total}
            </p>
          </header>
          <StepBody step={step} />
        </article>
      </div>

      <footer className="notation-walkthrough-footer">
        <ButtonRow
          stepIndex={stepIndex}
          total={total}
          onPrev={function() { goTo(stepIndex - 1); }}
          onNext={function() { goTo(stepIndex + 1); }}
          onFinish={props.onFinish}
        />
      </footer>
    </div>
  );
}

function ButtonRow(props) {
  const { stepIndex, total, onPrev, onNext, onFinish } = props;
  const isLast = stepIndex >= total - 1;
  return (
    <div className="notation-walkthrough-nav">
      <button
        type="button"
        className="btn btn-outline-secondary"
        disabled={stepIndex <= 0}
        onClick={onPrev}
      >
        Previous
      </button>
      <span className="notation-walkthrough-nav-status">
        {stepIndex + 1} / {total}
      </span>
      <button
        type="button"
        className="btn btn-primary"
        onClick={isLast ? onFinish : onNext}
      >
        {isLast ? 'Finish' : 'Next'}
      </button>
    </div>
  );
}

// Export for tests / reuse of shortcut markup in help cross-links
export { Kbd };
