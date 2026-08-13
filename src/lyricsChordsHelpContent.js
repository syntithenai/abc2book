import React from 'react'

/**
 * Shared help body for Lyrics and Chords editors (and the Help page section).
 */
export function LyricsChordsHelpBody() {
  return (
    <>
      <h3 className="h5">Lyrics formats</h3>
      <p>
        Paste plain lyric lines, or lines with ChordPro inline chords such as{' '}
        <code>[C]Health and time</code>. Section labels organize the song:
      </p>
      <ul>
        <li><code># Verse</code>, <code># Chorus</code>, <code>[Verse 2]</code>, <code>(chorus)</code></li>
        <li>
          Blank lines inside a <strong>labeled</strong> section are paragraph breaks — they do not
          start a new verse. The next section starts at the next header.
        </li>
        <li>
          Inline chords in the lyrics field drive the singing view. You can paste chord sheets
          (with or without chords) into the Lyrics editor.
        </li>
        <li>
          A <code>/</code> in a word marks a beat (usually the first beat of a bar), before
          or mid-word — e.g. <code>a/mazing /grace how /sweet the /sound</code>. Markers stay
          while editing; they are hidden in display views and used to place chords from
          notation over the lyrics.
        </li>
      </ul>

      <h3 className="h5">Conversion to structured ABC</h3>
      <p>
        Structured ABC (rest scaffold + chord symbols, strains split by <code>||</code>) is{' '}
        <strong>not required</strong> for lyric display or formatting. It is useful when you want
        staff chords, structure blocks, or music generation from a scaffold.
      </p>
      <p>
        In the Chords editor, <strong>From Lyrics</strong> extracts chord grids from the lyrics
        field into ABC strains. Staff and structure then follow that scaffold.
      </p>
      <p>
        <strong>To Lyrics</strong> does the reverse: it merges notation chords onto the lyric
        lines and saves them as ChordPro (<code>[Am]word</code>). Beat-level timing is
        approximate (lossy). Existing lyric-embedded chords are replaced; ABC is unchanged.
        Use the Lyrics editor <strong>Align</strong> tab afterward to drag chords onto words.
      </p>

      <h3 className="h5">Section mapping (lyrics ↔ notation)</h3>
      <p>The basic idea:</p>
      <ol>
        <li>Label your lyric sections (<code># Verse</code>, <code># Chorus</code>, …).</li>
        <li>
          Add notation sections (ABC strains separated by <code>||</code>). They are allocated to
          lyric sections <strong>in order</strong>.
        </li>
        <li>
          When a section title <strong>or variant</strong> repeats (another <code># Chorus</code>,
          or <code># Verse 4</code> after an earlier verse of the same type), the matching ABC
          notation / chord block is <strong>reused</strong>. Edit the first occurrence only;
          later visits show as a reuse label.
        </li>
      </ol>
      <div className="help-callout">
        <p className="mb-0">
          Example: <code># Verse</code> then <code># Chorus</code> get their own ABC blocks.
          A later bare <code># Chorus</code> reuses the first chorus chart. Blank lines inside
          <code># Verse I</code> do not create a second verse.
        </p>
      </div>
    </>
  )
}
