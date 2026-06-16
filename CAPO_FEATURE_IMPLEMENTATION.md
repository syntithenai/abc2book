# Capo Feature Implementation - Detailed Code Changes

## Table of Contents
1. [Stage 1: Data Model & Persistence](#stage-1-data-model--persistence)
2. [Stage 2: UI Form Editor](#stage-2-ui-form-editor)
3. [Stage 3: Chord Display Tab Controller](#stage-3-chord-display-tab-controller)
4. [Stage 4: Chord Transposition Logic](#stage-4-chord-transposition-logic)
5. [Testing & Validation](#testing--validation)

---

## Stage 1: Data Model & Persistence

### 1.1 Update Tune Object Schema in `useTuneBook.js`

**Location:** `src/useTuneBook.js` - Default tune object creation

**Current State:** Tunes are created with properties like `id`, `name`, `abc`, `transpose`, `meter`, `key`, etc.

**Change Required:**
- Add `capo` property to the default tune object structure
- Initialize as `null` (unset) or `0` (no capo)
- Ensure it's included in tune save/load operations

**Specific Changes:**
```javascript
// In useTuneBook.js, find the function that creates a new tune object (likely in saveTune or addTune)
// Add capo property:
{
  id: ...,
  name: ...,
  abc: ...,
  transpose: 0,
  capo: null,  // NEW: Add this property
  meter: ...,
  key: ...,
  // ... other properties
}
```

**Additional Consideration:**
- Ensure backward compatibility: when loading old tunes without capo property, default to `null` or `0`
- May need migration logic in data loading code

---

### 1.2 Update ABC Notation Conversion - `useAbcTools.js`

**Location:** `src/useAbcTools.js` - Functions `json2abc()` and `abc2json()`

#### 1.2.1 JSON to ABC Conversion (`json2abc()`)

**Current Behavior:** Converts tune JSON object to ABC notation string

**Change Required:**
When generating ABC header from tune object, include capo value if present

**Code Location:** Find the ABC header generation section (typically near `X:`, `T:`, `K:` fields)

**Implementation:**
```javascript
// In the header generation section, add:
if (tune.capo && tune.capo > 0) {
  abcHeader += 'capo:' + tune.capo + '\n';
}
// OR following ABC syntax conventions, may be:
// In the comments or info section:
if (tune.capo && tune.capo > 0) {
  abcText += '%%capo ' + tune.capo + '\n';
}
```

**Notes:**
- Check ABC notation standard for proper capo field location (likely in header comments or info field)
- Consider if capo should be stored as a comment or special field
- Typical ABC headers have: `X:`, `T:`, `C:`, `M:`, `L:`, `K:`
- Capo might go in info section or as comment like `%%capo N`

#### 1.2.2 ABC to JSON Conversion (`abc2json()`)

**Current Behavior:** Parses ABC notation string into tune JSON object

**Change Required:**
Extract capo value from ABC notation and populate tune object

**Code Location:** Find ABC header parsing section

**Implementation:**
```javascript
// Add parsing for capo field from ABC notation
// Look for patterns like:
// - "capo:N" in header
// - "%%capo N" directive
// - Comments containing capo information

// Example implementation:
const capoMatch = abcText.match(/capo:\s*(\d+)/i) || 
                  abcText.match(/%%capo\s+(\d+)/i);
if (capoMatch) {
  tune.capo = parseInt(capoMatch[1]);
} else {
  tune.capo = null;
}
```

**Notes:**
- Must handle multiple capo notation formats (for flexibility with different ABC sources)
- Should be defensive: if no capo found, set to `null` or `0`

---

### 1.3 Integrate MusicXML Capo Extraction - `xml2abc.js`

**Location:** `src/xml2abc.js` - Lines 1381-1382 (already partially implemented)

**Current State:** 
```javascript
var capo = stfdtl.find ('capo').text ();
if (capo) cs += format (' capo=%s', [capo]);
```

**Change Required:**
Ensure capo value is properly propagated through the XML to ABC conversion pipeline and ultimately stored in the tune object

**Implementation Locations:**

1. **In xml2abc.js conversion output:**
   - Verify capo is included in the ABC notation string that's generated
   - Should be accessible to `abc2json()` during subsequent parsing

2. **In the tune creation flow (after xml2abc conversion):**
   - When JSON is created from converted ABC, the `abc2json()` function (from Stage 1.2.2) will extract it
   - Ensure no data loss in the conversion chain

3. **Update ABCoutput class:**
   - If `capo` is part of staff details, ensure it's preserved in header output
   - Check the `mkHeader()` function to see if capo should be included there

**Specific Code Location:** Look for `ABCoutput.prototype.mkHeader` or similar, ensure capo value reaches the output string

---

### 1.4 Update Data Persistence Layer

**Location:** `useTuneBook.js` - `saveTune()` function and related persistence methods

**Change Required:**
- Ensure `capo` property is included when saving tunes to Google Drive/Sheets (if applicable)
- Ensure `capo` is included in localStorage caching
- Verify import/export functions include capo in exported data

**Implementation:**
```javascript
// In saveTune() and related functions, ensure capo is preserved:
// When serializing: { ...tune, capo: tune.capo }
// When deserializing: { ...loadedTune, capo: loadedTune?.capo || null }
```

**Locations to check:**
- `saveTune()` - Main save function
- `importTune()` / `importTunes()` - Import functions
- `exportTune()` / `exportTunes()` - Export functions  
- `loadTuneBook()` - Data loading from persistent storage
- `useGoogleDocument.js` - If tunes are synced to Google

---

## Stage 2: UI Form Editor

### 2.1 Add Capo Input Field to Form - `components/AbcEditor.js`

**Location:** `src/components/AbcEditor.js` - Form section displaying tune metadata

**Current State:** Form likely has fields for name, composer, meter, key, etc.

**Change Required:**
Add an integer input field for capo in the "info" section

**Implementation:**

Find the section where tune info fields are rendered (look for inputs for `tune.name`, `tune.composer`, `tune.meter`, etc.)

Add new form group:
```javascript
// Add to the form rendering section:
<Form.Group>
  <Form.Label>Capo</Form.Label>
  <Form.Control
    type="number"
    min="0"
    max="12"
    value={tune.capo || 0}
    onChange={(e) => handleCapoChange(parseInt(e.target.value) || null)}
    placeholder="Leave empty for no capo"
  />
  <Form.Text className="text-muted">
    Guitar/instrument capo position (0-12 frets)
  </Form.Text>
</Form.Group>
```

**Handler Function:**
```javascript
// Add handler function in AbcEditor component:
function handleCapoChange(value) {
  if (tune) {
    const updatedTune = { ...tune, capo: value };
    tune.capo = value;
    saveTune(updatedTune);
  }
}
```

**Location Specifics:**
- Search for where other tune properties like `meter`, `key`, or `composer` are edited
- Add capo field in the same section (typically a Tab labeled "Info" or similar)
- Follow the same styling and validation pattern as other fields

**Styling Notes:**
- Use same Bootstrap Form components as existing fields
- Add validation: capo should be integer 0-12
- Make it optional (null if not set)
- Add helpful text explaining the field

---

### 2.2 Alternative Location: Separate Modal or Component

**Alternative:** If tune metadata is edited in a different component like `TitleAndLyricsEditorModal.js`

**Implementation:**
- Locate `components/TitleAndLyricsEditorModal.js`
- Add similar Form.Group for capo
- Ensure it's included in the modal's save handler

**File Pattern to Search:**
```javascript
// Look for components that have:
// - Form fields for tune metadata
// - onChange handlers that call saveTune()
// - Examples: TitleAndLyricsEditorModal, or similar
```

---

### 2.3 Update State Management

**Location:** `components/AbcEditor.js` or `components/MusicSingle.js` (depending on where capo editing happens)

**Change Required:**
- Ensure capo value is included in component state when tune is loaded
- Update state when capo is modified
- Trigger save on change

**Implementation:**
```javascript
// In the useEffect that loads tune data:
useEffect(() => {
  if (tune) {
    setCapoValue(tune.capo || 0);
  }
}, [tune?.id, tune?.capo]);

// In the change handler:
const handleCapoChange = (newValue) => {
  setCapoValue(newValue);
  if (tune) {
    const updated = { ...tune, capo: newValue };
    saveTune(updated);
  }
}
```

---

## Stage 3: Chord Display Tab Controller

### 3.1 Add Tab Controller UI - `components/MusicSingle.js`

**Location:** `src/components/MusicSingle.js` - Above the chords block rendering

**Current State:** Chords are displayed in a section, likely using `ChordsWizard` component or similar

**Change Required:**
Add a tab/button group above the chords display with three options: "transposed", "capo", "none"

**Implementation:**

```javascript
// In MusicSingle.js, add state for chord display mode:
const [chordDisplayMode, setChordDisplayMode] = useState('transposed');

// Add UI before chords rendering:
import { ButtonGroup, Button } from 'react-bootstrap';

// Render tabs/buttons:
<div style={{ marginBottom: '1em' }}>
  <ButtonGroup>
    <Button 
      variant={chordDisplayMode === 'transposed' ? 'primary' : 'outline-primary'}
      onClick={() => setChordDisplayMode('transposed')}
    >
      Transposed
    </Button>
    <Button 
      variant={chordDisplayMode === 'capo' ? 'primary' : 'outline-primary'}
      onClick={() => setChordDisplayMode('capo')}
      disabled={!tune?.capo}
    >
      Capo
    </Button>
    <Button 
      variant={chordDisplayMode === 'none' ? 'primary' : 'outline-primary'}
      onClick={() => setChordDisplayMode('none')}
    >
      None
    </Button>
  </ButtonGroup>
</div>

// Then render chords with the selected mode:
<ChordsWizard 
  tune={tune}
  chordDisplayMode={chordDisplayMode}
  // ... other props
/>
```

**Styling Considerations:**
- Use Bootstrap's ButtonGroup and Button components
- Highlight active button
- Disable "capo" button if tune.capo is not set
- Add tooltips explaining each mode

---

### 3.2 Pass Mode to Chord Rendering Component - `components/ChordsWizard.js`

**Location:** `src/components/ChordsWizard.js` - Main chord display component

**Current State:** Component renders chords from tune object

**Change Required:**
- Accept new `chordDisplayMode` prop
- Apply chord transposition based on selected mode
- Pass transposed chords to display

**Implementation:**

```javascript
// Add prop to component:
export default function ChordsWizard(props) {
  const { tune, chordDisplayMode = 'transposed', ... } = props;
  
  // Function to process chords based on display mode:
  const getDisplayChords = () => {
    if (!tune || !tune.chords) return [];
    
    const originalChords = tune.chords; // Array of chord objects or strings
    
    switch(chordDisplayMode) {
      case 'transposed':
        // Apply existing transpose logic
        return applyTranspose(originalChords, tune.transpose);
      
      case 'capo':
        // Apply capo offset
        if (tune.capo && tune.capo > 0) {
          return applyTranspose(originalChords, tune.capo);
        }
        return originalChords;
      
      case 'none':
        // Return original chords unchanged
        return originalChords;
      
      default:
        return originalChords;
    }
  };
  
  // Use displayChords in rendering:
  const displayChords = getDisplayChords();
  
  // Render chords with displayChords instead of tune.chords
  return (
    <div>
      {/* Render displayChords */}
    </div>
  );
}
```

**Important Notes:**
- Must identify how chords are currently stored (array, object, etc.)
- Must identify current transpose implementation (`applyTranspose` function)
- May need to adapt to existing chord data structure

---

### 3.3 Update Chord Rendering Logic

**Location:** In `ChordsWizard.js` rendering section

**Change Required:**
Replace references to `tune.chords` with `displayChords` throughout component

**Implementation:**
```javascript
// Search and replace pattern:
// FROM: tune.chords.map(...)
// TO:   displayChords.map(...)

// FROM: {tune.chords}
// TO:   {displayChords}
```

---

## Stage 4: Chord Transposition Logic

### 4.1 Create/Update Chord Transposition Utility

**Location:** `src/chords.js` or new file `src/chordTransposer.js`

**Current State:** Likely has chord manipulation functions; may already have transpose logic

**Change Required:**
Add (or update) function to transpose chords by semitones

**Implementation:**

```javascript
// Create or add to existing chord utility file:

/**
 * Transpose a chord symbol by a given number of semitones
 * @param {string} chord - Chord symbol (e.g., "C", "Dm", "G7", "F#maj7")
 * @param {number} semitones - Number of semitones to transpose (can be negative)
 * @returns {string} Transposed chord symbol
 */
export function transposeChord(chord, semitones) {
  if (!chord || semitones === 0) return chord;
  
  // Normalize semitones to 0-11 range
  semitones = ((semitones % 12) + 12) % 12;
  
  // Define note sequence
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notesFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  
  // Extract root note and chord type/suffix
  const rootMatch = chord.match(/^([A-G][b#]?)/);
  if (!rootMatch) return chord; // Can't parse, return unchanged
  
  const root = rootMatch[1];
  const suffix = chord.slice(root.length); // Everything after root (m, 7, maj7, etc.)
  
  // Find current root note index
  let rootIndex = notes.indexOf(root);
  if (rootIndex === -1) {
    rootIndex = notesFlat.indexOf(root);
  }
  if (rootIndex === -1) return chord; // Unknown root, return unchanged
  
  // Transpose root
  const newRootIndex = (rootIndex + semitones) % 12;
  
  // Choose which note name to use (sharp or flat)
  // Default to sharp for sharps, flat for flats in original
  const useFlat = root.includes('b');
  const newRoot = useFlat ? notesFlat[newRootIndex] : notes[newRootIndex];
  
  // Recombine and return
  return newRoot + suffix;
}

/**
 * Transpose an array of chords
 * @param {Array<string>} chords - Array of chord symbols
 * @param {number} semitones - Number of semitones to transpose
 * @returns {Array<string>} Array of transposed chord symbols
 */
export function transposeChords(chords, semitones) {
  if (!Array.isArray(chords)) return chords;
  return chords.map(chord => transposeChord(chord, semitones));
}
```

**Edge Cases to Handle:**
- Chords with sharps/flats (C#, Db, etc.)
- Extended chords (maj7, min9, sus4, etc.)
- Slash chords (C/E, etc.)
- Chords with no root found (invalid chords)
- Negative transposition
- Wrapping around octave (B + 1 semitone = C)

---

### 4.2 Handle Slash Chords (Advanced)

**Location:** Enhancement to `transposeChord()` in `chords.js`

**Change Required:**
Handle slash chords properly (e.g., C/E → D/F# when transposed up 2 semitones)

**Implementation:**

```javascript
export function transposeChord(chord, semitones) {
  if (!chord || semitones === 0) return chord;
  
  semitones = ((semitones % 12) + 12) % 12;
  
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notesFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  
  // Handle slash chords: split on '/'
  if (chord.includes('/')) {
    const [mainChord, bassNote] = chord.split('/');
    const transposedMain = transposeChord(mainChord, semitones);
    const transposedBass = transposeChord(bassNote, semitones);
    return transposedMain + '/' + transposedBass;
  }
  
  // ... rest of function as above
}
```

---

### 4.3 Integration in ChordsWizard Component

**Location:** `components/ChordsWizard.js` - Import and use transposition function

**Implementation:**

```javascript
// At top of file, add import:
import { transposeChord, transposeChords } from '../chords';

// In getDisplayChords function:
const applyTranspose = (chords, semitones) => {
  if (!Array.isArray(chords)) return chords;
  return transposeChords(chords, semitones);
};

// Alternative for single chord display:
const displayChord = (chord, semitones) => {
  return transposeChord(chord, semitones);
};
```

---

### 4.4 Handle Different Chord Data Structures

**Location:** `components/ChordsWizard.js` or chord utility functions

**Change Required:**
Adapt transposition logic to match how chords are actually stored in the tune object

**Implementation Options:**

**Option A: Chords as Array of Strings**
```javascript
tune.chords = ['C', 'F', 'G', 'C'];
const displayed = transposeChords(tune.chords, semitones);
```

**Option B: Chords as Objects**
```javascript
tune.chords = [
  { chord: 'C', position: 0 },
  { chord: 'F', position: 4 },
  ...
];
const displayed = tune.chords.map(c => ({
  ...c,
  chord: transposeChord(c.chord, semitones)
}));
```

**Option C: Chords Embedded in ABC Notation**
```javascript
// If chords are part of ABC string, need to parse and re-render
const chordRegex = /\["([^"]+)"\]/g; // ABC chord notation
// Parse, transpose, re-render
```

**Action:** Determine actual chord storage format in codebase and adapt accordingly

---

## Stage 4.5 Test Transposition Logic

**Location:** Create test file or add to existing test suite

**Test Cases:**
```javascript
// Test basic transposition
transposeChord('C', 0) === 'C'     // No change
transposeChord('C', 2) === 'D'     // Up 2 semitones
transposeChord('C', -2) === 'B'    // Down 2 semitones (wraps)
transposeChord('C', 12) === 'C'    // Octave wraps

// Test with accidentals
transposeChord('C#', 1) === 'D'
transposeChord('Db', 1) === 'D' // or 'Eb' depending on preference
transposeChord('B', 1) === 'C'   // Wrap around

// Test with chord types
transposeChord('Cm', 2) === 'Dm'
transposeChord('G7', 5) === 'C7'
transposeChord('Fmaj7', 3) === 'Abmaj7' // or 'G#maj7'

// Test slash chords
transposeChord('C/E', 2) === 'D/F#'
transposeChord('Am/G', 5) === 'Dm/C'

// Test arrays
transposeChords(['C', 'F', 'G'], 2) === ['D', 'G', 'A']
```

---

## Testing & Validation

### Integration Test Points

1. **Data Persistence Flow**
   - Create tune with capo value
   - Save to storage
   - Reload tune
   - Verify capo persists

2. **ABC Notation Round-Trip**
   - JSON tune with capo → ABC notation → JSON tune
   - Verify capo value preserved

3. **MusicXML Import**
   - Import MusicXML file with capo metadata
   - Verify capo extracted correctly
   - Verify appears in tune object

4. **Chord Display Modes**
   - Test all three modes (transposed, capo, none)
   - Verify correct chords displayed for each mode
   - Test with and without transpose value
   - Test with and without capo value

5. **Edge Cases**
   - Capo = 0 (should behave like "none" mode)
   - Capo + transpose stacking
   - Transposing extended chords (maj7, sus4, etc.)
   - Slash chords
   - Invalid chord symbols (should pass through unchanged)

6. **UI Interaction**
   - Edit capo value and verify save
   - Switch between chord display modes
   - Verify "capo" button disabled when capo not set
   - Verify UI updates reflect mode changes

---

## Summary of Files Modified

### Stage 1 (Data Model & Persistence)
- `src/useTuneBook.js` - Add capo to tune schema, persistence
- `src/useAbcTools.js` - Update json2abc and abc2json conversion
- `src/xml2abc.js` - Verify/enhance MusicXML capo extraction

### Stage 2 (UI Form Editor)
- `src/components/AbcEditor.js` - Add capo input field

### Stage 3 (Chord Display Tab Controller)
- `src/components/MusicSingle.js` - Add tab controller UI
- `src/components/ChordsWizard.js` - Accept and apply chord display mode

### Stage 4 (Chord Transposition)
- `src/chords.js` - Add transposeChord and transposeChords functions
- `src/components/ChordsWizard.js` - Integrate transposition logic

---

## Implementation Order

**Recommended sequence:**
1. **Stage 1.1-1.4** - Complete all data model changes first (foundation)
2. **Stage 2** - Add UI form field (enables user input)
3. **Stage 4** - Implement chord transposition logic (prerequisite for Stage 3)
4. **Stage 3** - Add tab controller and integrate with Stage 4 logic

This order ensures data can be saved before UI is built, and transposition logic exists before integrating into UI.
