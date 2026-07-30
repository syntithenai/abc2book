import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import SearchResultPickerModal from './SearchResultPickerModal';
import VoiceHelpAnswerModal from './VoiceHelpAnswerModal';
import VoiceInputWaveform from './VoiceInputWaveform';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useVoiceMicRecorder from '../useVoiceMicRecorder';
import { kickoffMicrophoneAccess } from '../microphoneAccess';
import { submitVoiceCommand } from '../voiceCommandClient';
import { executeVoiceCommand } from '../voiceCommandExecutor';
import { buildVoiceCatalogs, formatVoiceCommandFeedback } from '../voiceCommandUtils';
import { primaryArtist } from '../tuneBibliographicUtils';

function MicIcon() {
  return (
    <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="microphone" className="svg-inline--fa fa-microphone fa-w-11" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512" style={{ width: '55%', height: '55%' }}>
      <path fill="currentColor" d="M176 352c53.02 0 96-42.98 96-96V96c0-53.02-42.98-96-96-96S80 42.98 80 96v160c0 53.02 42.98 96 96 96zm160-160h-16c-8.84 0-16 7.16-16 16v48c0 74.8-64.49 134.82-140.79 127.38C96.71 376.89 48 317.11 48 250.3V208c0-8.84-7.16-16-16-16H16c-8.84 0-16 7.16-16 16v40.16c0 89.64 63.97 169.55 152 181.69V464H96c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16h-56v-33.77C285.71 418.47 352 344.9 352 256v-48c0-8.84-7.16-16-16-16z" />
    </svg>
  );
}

const VOICE_COMMAND_TIMEOUT_MS = 120000

export default function VoiceCommandButton(props) {
  const { available: resolverAvailable, features } = useMediaResolverHealth();
  const [processing, setProcessing] = useState(false);
  const [pickerItems, setPickerItems] = useState([]);
  const [pickerTitle, setPickerTitle] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [showHelpAnswer, setShowHelpAnswer] = useState(false);
  const [helpAnswer, setHelpAnswer] = useState(null);

  const abortRef = useRef(null);
  const disambiguateResolverRef = useRef(null);

  useEffect(function() {
    return function() {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

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

  async function submitCapturedAudio(blob) {
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'VoiceCommandButton.js:submitCapturedAudio:entry',message:'submitCapturedAudio called',data:{blobSize:blob&&blob.size},timestamp:Date.now(),hypothesisId:'H10,H11'})}).catch(()=>{});
    // #endregion
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = setTimeout(function() {
      timedOut = true;
      controller.abort();
    }, VOICE_COMMAND_TIMEOUT_MS);

    setProcessing(true);
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
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'VoiceCommandButton.js:submitCapturedAudio:afterSubmit',message:'submitVoiceCommand returned',data:{tool:result&&result.tool,transcript:result&&result.transcript?result.transcript.slice(0,80):''},timestamp:Date.now(),hypothesisId:'H11,H12'})}).catch(()=>{});
      // #endregion

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
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'VoiceCommandButton.js:submitCapturedAudio:afterExecute',message:'executeVoiceCommand finished',data:{},timestamp:Date.now(),hypothesisId:'H12'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (timedOut) {
          toast.error('Voice command timed out — check that the media resolver is running');
        }
        return;
      }
      toast.error(error && error.message ? error.message : 'Voice command failed');
    } finally {
      clearTimeout(timeoutId);
      setProcessing(false);
      setKeyboardBlocked(false);
      abortRef.current = null;
    }
  }

  const {
    recordingState,
    analyserNode,
    isTapMode,
    handleTapPointerDown,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    microphoneErrorMessage,
  } = useVoiceMicRecorder({
    enabled: resolverAvailable && features.whisper,
    onBeforeStart: pausePlaybackForVoice,
    onRecordingStopping: function() {
      setProcessing(true);
    },
    onEmptyRecording: function() {
      setProcessing(false);
    },
    onAudioReady: submitCapturedAudio,
    onError: function(error) {
      toast.error(microphoneErrorMessage(error));
    },
    onHoldModeShortTap: function() {
      toast.warning('Hold the mic button down while speaking');
    },
    setKeyboardBlocked: setKeyboardBlocked,
  });

  function onMicPointerDown(event) {
    if (isTapMode) {
      const streamPromise = kickoffMicrophoneAccess();
      handleTapPointerDown(event, streamPromise);
    } else {
      handlePointerDown(event);
    }
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

  const state = processing ? 'processing' : recordingState;
  const isRecording = state === 'recording';

  const micTitle = props.voiceMode === 'help'
    ? (isTapMode ? 'Tap to ask a help question' : 'Hold to ask a help question')
    : (isTapMode
      ? 'Tap to speak: show, search, play, or stop'
      : 'Hold to speak: show, search, play, or stop');

  const className = 'header-voice-btn'
    + (isRecording ? ' recording' : '')
    + (state === 'processing' ? ' processing' : '')
    + (isTapMode ? ' tap-mode' : '');

  const buttonProps = isTapMode
    ? { onPointerDown: onMicPointerDown }
    : {
      onPointerDown: onMicPointerDown,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    };

  return (
    <>
      <span className="header-voice-wrap">
        {isTapMode && isRecording ? (
          <VoiceInputWaveform analyserNode={analyserNode} variant="header" />
        ) : null}
        <button
          type="button"
          className={className}
          aria-label={micTitle}
          title={micTitle}
          aria-pressed={isRecording}
          disabled={state === 'processing'}
          {...buttonProps}
        >
          {state === 'processing'
            ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            : <MicIcon />}
        </button>
      </span>
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
