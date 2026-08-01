import { useCallback, useEffect, useState } from 'react'
import {
  loadUserDrumPresets,
  saveUserDrumPreset,
  deleteUserDrumPreset,
  updateUserDrumPreset,
  getCachedUserDrumPresets,
} from './userDrumPresets'

export default function useUserDrumPresets() {
  const [presets, setPresets] = useState(function() { return getCachedUserDrumPresets() })
  const [loading, setLoading] = useState(!getCachedUserDrumPresets().length)

  const reload = useCallback(function() {
    setLoading(true)
    return loadUserDrumPresets().then(function(list) {
      setPresets(list)
      setLoading(false)
      return list
    }).catch(function() {
      setLoading(false)
      return []
    })
  }, [])

  useEffect(function() {
    reload()
  }, [reload])

  const save = useCallback(function(options) {
    return saveUserDrumPreset(options).then(function(preset) {
      setPresets(getCachedUserDrumPresets())
      return preset
    })
  }, [])

  const remove = useCallback(function(id) {
    return deleteUserDrumPreset(id).then(function() {
      setPresets(getCachedUserDrumPresets())
    })
  }, [])

  const rename = useCallback(function(id, label) {
    return updateUserDrumPreset(id, { label: label }).then(function(preset) {
      setPresets(getCachedUserDrumPresets())
      return preset
    })
  }, [])

  return {
    presets: presets,
    loading: loading,
    reload: reload,
    save: save,
    remove: remove,
    rename: rename,
  }
}
