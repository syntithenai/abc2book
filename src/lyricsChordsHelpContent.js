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
        <strong>To Lyrics</strong> in the Chords editor, or <strong>Chords from notation</strong> in
        the Lyrics editor Align tab, copies notation chords onto the lyric lines as ChordPro
        (<code>[Am]word</code>). You then have two copies of the chords — in the music structure
        and written into the lyrics — that are maintained independently. Beat-level timing is
        approximate (lossy). Existing lyric-embedded chords are replaced; ABC is unchanged.
        Use the Lyrics editor <strong>Align</strong> tab afterward to drag chords onto letters
        or spaces (including extra slots at the start and end of each line), click a lyric or
        section title to edit it in place, add or delete lyric lines and sections, click a chord
        to edit or remove it, or use <strong>+</strong> to add chords.
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
      <p>
        Optional <code>@N</code> on a header overrides that automatic assignment.
        <code>N</code> is the 1-based chords block (first ABC strain is <code>@1</code>).
        Several tokens join those blocks in listed order:
      </p>
      <ul>
        <li><code># chorus @1</code> — that stanza uses the first chords block</li>
        <li><code># instrumental @1 @2</code> — verse then chorus charts, in that order</li>
        <li><code># bridge @3</code> — the third block, even if auto left this stanza empty</li>
      </ul>
      <p>
        Headers without <code>@N</code> still allocate in order. Repeats without a token still
        reuse the type (and reuse a pin from the first occurrence of that type).
        If a pin points at a chords block that structure has already shown, that stanza
        is listed as a heading only. A later verse with its own token
        (for example <code># v2 @3</code> after <code># v1 @2</code>) still shows that
        block when it has not been displayed.
      </p>
    </>
  )
}
