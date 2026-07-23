import { useEffect, useState } from 'react'
import { FieldHelpModal } from './FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText'
import { subscribeOpenYoutubeHelperInstall } from '../youtubeHelperInstallOpen'

export default function YoutubeHelperInstallHost() {
  const [show, setShow] = useState(false)

  useEffect(function() {
    return subscribeOpenYoutubeHelperInstall(function() {
      setShow(true)
    })
  }, [])

  return (
    <FieldHelpModal
      show={show}
      title={SETTINGS_FIELD_HELP.youtubeHelperInstall.title}
      fields={SETTINGS_FIELD_HELP.youtubeHelperInstall.fields}
      onHide={function() { setShow(false) }}
    />
  )
}
