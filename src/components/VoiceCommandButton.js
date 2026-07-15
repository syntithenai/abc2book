import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import SearchResultPickerModal from './SearchResultPickerModal';
import VoiceHelpAnswerModal from './VoiceHelpAnswerModal';
import useMediaResolverHealth from '../useMediaResolverHealth';
import { submitVoiceCommand } from '../voiceCommandClient';
import { executeVoiceCommand } from '../voiceCommandExecutor';
import { buildVoiceCatalogs, formatVoiceCommandFeedback } from '../voiceCommandUtils';
import { primaryArtist } from '../tuneBibliographicUtils';

const MIN_HOLD_MS = 300;
const MAX_RECORD_MS = 12000;

function MicIcon() {
  return (
    <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="microphone" className="svg-inline--fa fa-microphone fa-w-11" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512" style={{ width: '55%', height: '55%' }}>
      <path fill="currentColor" d="M176 352c53.02 0 96-42.98 96-96V96c0-53.02-42.98-96-96-96S80 42.98 80 96v160c0 53.02 42.98 96 96 96zm160-160h-16c-8.84 0-16 7.16-16 16v48c0 74.8-64.49 134.82-140.79 127.38C96.71 376.89 48 317.11 48 250.3V208c0-8.84-7.16-16-16-16H16c-8.84 0-16 7.16-16 16v40.16c0 89.64 63.97 169.55 152 181.69V464H96c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16h-56v-33.77C285.71 418.47 352 344.9 352 256v-48c0-8.84-7.16-16-16-16z" />
    </svg>
  );
}

export default function VoiceCommandButton(props) {
  const { available: resolverAvailable, features } = useMediaResolverHealth();
  const [state, setState] = useState('idle');
  const [pickerItems, setPickerItems] = useState([]);
  const [pickerTitle, setPickerTitle] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [showHelpAnswer, setShowHelpAnswer] = useState(false);
  const [helpAnswer, setHelpAnswer] = useState(null);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const holdTimerRef = useRef(null);
  const maxRecordTimerRef = useRef(null);
  const abortRef = useRef(null);
  const disambiguateResolverRef = useRef(null);
  const pointerActiveRef = useRef(false);

  useEffect(function() {
    return function() {
      cleanupRecording();
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  function cleanupRecording() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (maxRecordTimerRef.current) {
      clearTimeout(maxRecordTimerRef.current);
      maxRecordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(function(track) {
        track.stop();
      });
      mediaStreamRef.current = null;
    }
    pointerActiveRef.current = false;
  }

  function setKeyboardBlocked(blocked) {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(blocked);
  }

  function pausePlaybackForVoice() {
    const mediaController = props.mediaController;
    if (!mediaController || !mediaController.pause) return;
    if (mediaController.isPlaying || mediaController.isLoading) {
      mediaController.pause();
    }
  }

  async function startRecording() {
    if (!pointerActiveRef.current || state !== 'idle' || !resolverAvailable || !features.whisper) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Microphone not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = function(event) {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = function() {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(function(track) {
            track.stop();
          });
          mediaStreamRef.current = null;
        }
        if (blob.size > 0) {
          submitCapturedAudio(blob);
        } else {
          setState('idle');
          setKeyboardBlocked(false);
        }
      };

      recorder.start();
      setState('recording');
      setKeyboardBlocked(true);
      maxRecordTimerRef.current = setTimeout(function() {
        stopRecording();
      }, MAX_RECORD_MS);
    } catch (error) {
      setState('idle');
      setKeyboardBlocked(false);
      toast.error(error && error.message ? error.message : 'Microphone access denied');
    }
  }

  function stopRecording() {
    if (maxRecordTimerRef.current) {
      clearTimeout(maxRecordTimerRef.current);
      maxRecordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      setState('processing');
      mediaRecorderRef.current.stop();
    } else {
      setState('idle');
      setKeyboardBlocked(false);
    }
  }

  async function submitCapturedAudio(blob) {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState('processing');
    setKeyboardBlocked(true);

    try {
      const catalogs = buildVoiceCatalogs(props.tunebook);
      const result = await submitVoiceCommand({
        blob: blob,
        fileName: 'voice-command.webm',
        books: catalogs.books,
        tags: catalogs.tags,
        mode: props.voiceMode || 'playback',
        accessToken: props.token && props.token.access_token,
        signal: controller.signal,
      });

      const speakFeedback = typeof window !== 'undefined'
        && localStorage.getItem('bookstorage_announcesong') === 'true';

      const transcript = result && result.transcript ? result.transcript : '';

      await executeVoiceCommand(result, {
        tunes: props.tunes,
        tunebook: props.tunebook,
        setFilter: props.setFilter,
        setCurrentTuneBook: props.setCurrentTuneBook,
        setTagFilter: props.setTagFilter,
        setGroupBy: props.setGroupBy,
        setCurrentTune: props.setCurrentTune,
        mediaController: props.mediaController,
        voiceMode: props.voiceMode || 'playback',
        speakFeedback: speakFeedback,
        onFeedback: function(message) {
          toast.info(formatVoiceCommandFeedback(transcript, message));
        },
        onHelpAnswer: function(payload) {
          setHelpAnswer(payload || null);
          setShowHelpAnswer(true);
        },
        onDisambiguate: function(candidates, query) {
          return new Promise(function(resolve) {
            disambiguateResolverRef.current = resolve;
            setPickerItems(candidates.map(function(tune) {
              return {
                id: tune.id,
                title: tune.name,
                artist: primaryArtist(tune),
              };
            }));
            setPickerTitle('Choose a tune for "' + query + '"');
            setShowPicker(true);
          });
        },
      });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      toast.error(error && error.message ? error.message : 'Voice command failed');
    } finally {
      setState('idle');
      setKeyboardBlocked(false);
      abortRef.current = null;
    }
  }

  function handlePointerDown(event) {
    event.preventDefault();
    if (state !== 'idle') return;
    pausePlaybackForVoice();
    pointerActiveRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    holdTimerRef.current = setTimeout(function() {
      holdTimerRef.current = null;
      if (pointerActiveRef.current) startRecording();
    }, MIN_HOLD_MS);
  }

  function handlePointerUp(event) {
    event.preventDefault();
    pointerActiveRef.current = false;
    const wasShortTap = !!holdTimerRef.current;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'idle') {
      setKeyboardBlocked(false);
      if (wasShortTap) {
        toast.warning('Hold the mic button down while speaking');
      }
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (e) {
      // ignore
    }
  }

  function handlePointerCancel(event) {
    handlePointerUp(event);
    cleanupRecording();
    setState('idle');
    setKeyboardBlocked(false);
  }

  function handlePickerSelect(item) {
    setShowPicker(false);
    const resolver = disambiguateResolverRef.current;
    disambiguateResolverRef.current = null;
    if (!resolver) return;
    const tune = item && item.id ? props.tunes[item.id] : null;
    resolver(tune || null);
    setPickerItems([]);
  }

  function handlePickerHide() {
    setShowPicker(false);
    const resolver = disambiguateResolverRef.current;
    disambiguateResolverRef.current = null;
    if (resolver) resolver(null);
    setPickerItems([]);
  }

  if (!resolverAvailable || !features.whisper) return null;

  const micTitle = props.voiceMode === 'help'
    ? 'Hold to ask a help question'
    : 'Hold to speak: show, search, play, or stop';

  const className = 'header-voice-btn'
    + (state === 'recording' ? ' recording' : '')
    + (state === 'processing' ? ' processing' : '');

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="Hold to speak a command"
        title={micTitle}
        aria-pressed={state === 'recording'}
        disabled={state === 'processing'}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {state === 'processing'
          ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
          : <MicIcon />}
      </button>
      <SearchResultPickerModal
        show={showPicker}
        title={pickerTitle}
        items={pickerItems}
        emptyMessage="No matching tunes."
        onSelect={handlePickerSelect}
        onHide={handlePickerHide}
      />
      <VoiceHelpAnswerModal
        show={showHelpAnswer}
        question={helpAnswer && helpAnswer.question ? helpAnswer.question : ''}
        answer={helpAnswer && helpAnswer.answer ? helpAnswer.answer : ''}
        links={helpAnswer && helpAnswer.links ? helpAnswer.links : []}
        accessToken={props.token && props.token.access_token}
        onHide={function() { setShowHelpAnswer(false) }}
      />
    </>
  );
}
