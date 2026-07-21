import decode from 'audio-decode'
import MP3Converter from './MP3Converter'

export async function convertVideoBlobToMp3Blob(blob) {
  if (!blob) {
    throw new Error('No video data to convert')
  }
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await decode(arrayBuffer)
  const converter = new MP3Converter()
  const mp3Blob = await converter.convertAudioBuffer(audioBuffer, { bitRate: 96 })
  return {
    blob: mp3Blob,
    duration: audioBuffer.duration,
  }
}

export async function convertVideoFileToAudioFile(file) {
  if (!file) {
    throw new Error('No video file to convert')
  }
  const converted = await convertVideoBlobToMp3Blob(file)
  const baseName = String(file.name || 'video')
    .replace(/\.[^.]+$/, '')
    .trim() || 'video'
  return new File([converted.blob], baseName + '.mp3', { type: 'audio/mpeg' })
}
