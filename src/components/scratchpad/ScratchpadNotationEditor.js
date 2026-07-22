import ScratchpadMusicEditor from './ScratchpadMusicEditor'

export default function ScratchpadNotationEditor(props) {
  return (
    <ScratchpadMusicEditor
      item={props.item}
      payloadKey="notation"
      initialView="music"
      tunebook={props.tunebook}
      tunes={props.tunes}
      token={props.token}
      mediaController={props.mediaController}
      forceRefresh={props.forceRefresh}
      blockKeyboardShortcuts={props.blockKeyboardShortcuts}
      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      editHistory={props.editHistory}
      onChange={props.onChange}
    />
  )
}
