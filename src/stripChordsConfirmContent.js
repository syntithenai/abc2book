import React from 'react'

/**
 * Compact warning body for the Strip chords confirm dialog.
 * @param {{ hasNotation: boolean }} props
 */
export function StripChordsWarningBody(props) {
  if (props.hasNotation) {
    return (
      <>
        Removes lyric chord markers. <strong>Notation is kept</strong>, but singing view
        will use structural chords instead — <strong>timing may be less accurate</strong>{' '}
        than ChordPro/word placement.
      </>
    )
  }
  return (
    <>
      Removes lyric chord markers. <strong>Important information could be lost</strong> if
      chords are not stored in notation or a backup. Singing view will use structural chords
      when available — timing may be less accurate.
    </>
  )
}
