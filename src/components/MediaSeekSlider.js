import {useState, useEffect, useRef, useCallback} from 'react'
import './MediaSeekSlider.css'

function safeSeconds(value) {
    const n = parseFloat(value)
    return isNaN(n) || !isFinite(n) ? 0 : Math.max(0, n)
}

export default function MediaSeekSlider({mediaController, className}) {
    const [scrubbing, setScrubbing] = useState(false)
    const [scrubValue, setScrubValue] = useState(0)
    const scrubbingRef = useRef(false)
    const scrubValueRef = useRef(0)
    const [liveProgress, setLiveProgress] = useState({ currentTime: 0, duration: 0, ratio: 0 })

    useEffect(function() {
        function refresh() {
            if (scrubbing || !mediaController.getPlaybackProgress) return
            const next = mediaController.getPlaybackProgress()
            if (!next) return
            setLiveProgress({
                currentTime: safeSeconds(next.currentTime),
                duration: safeSeconds(next.duration),
                ratio: safeSeconds(next.ratio),
            })
        }
        refresh()
        const id = setInterval(refresh, 100)
        return function() { clearInterval(id) }
    }, [scrubbing, mediaController])

    const duration = liveProgress.duration > 0
        ? liveProgress.duration
        : safeSeconds(mediaController.duration)
    const currentTime = liveProgress.duration > 0 || liveProgress.currentTime > 0
        ? liveProgress.currentTime
        : safeSeconds(mediaController.currentTime)
    const progress = duration > 0
        ? (scrubbing ? scrubValue : (liveProgress.duration > 0 ? liveProgress.ratio : currentTime / duration))
        : 0
    const displayValue = scrubbing ? scrubValue : Math.max(0, Math.min(1, progress))

    useEffect(function() {
        if (!scrubbing) {
            setScrubValue(progress)
        }
    }, [progress, scrubbing])

    function commitSeek(ratio) {
        const next = Math.max(0, Math.min(1, parseFloat(ratio)))
        if (isNaN(next)) return
        scrubValueRef.current = next
        setScrubValue(next)
        if (mediaController.seek) {
            mediaController.seek(next)
        }
    }

    const endScrub = useCallback(function(ratio) {
        if (!scrubbingRef.current) return
        scrubbingRef.current = false
        setScrubbing(false)
        const finalRatio = ratio !== undefined && ratio !== null ? ratio : scrubValueRef.current
        commitSeek(finalRatio)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commitSeek uses stable mediaController.seek
    }, [mediaController])

    useEffect(function() {
        if (!scrubbing) return undefined
        function endScrubFromWindow() {
            endScrub(scrubValueRef.current)
        }
        window.addEventListener('pointerup', endScrubFromWindow)
        window.addEventListener('mouseup', endScrubFromWindow)
        window.addEventListener('touchend', endScrubFromWindow)
        return function() {
            window.removeEventListener('pointerup', endScrubFromWindow)
            window.removeEventListener('mouseup', endScrubFromWindow)
            window.removeEventListener('touchend', endScrubFromWindow)
        }
    }, [scrubbing, endScrub])

    function handleScrubInput(ratio) {
        const next = Math.max(0, Math.min(1, parseFloat(ratio)))
        if (isNaN(next)) return
        scrubValueRef.current = next
        setScrubValue(next)
    }

    if (!(duration > 0)) return null

    return (
        <div className={'media-seek-slider' + (className ? ' ' + className : '')}>
            <div className="media-seek-time" data-testid="media-seek-time">
                <b>
                    {currentTime.toFixed(2)}/{duration.toFixed(2)}
                </b>
            </div>
            <input
                className="mediaprogressslider"
                data-testid="media-seek-slider"
                type="range"
                min="0"
                max="1"
                step="0.0001"
                value={displayValue}
                onChange={function(e) { handleScrubInput(e.target.value) }}
                onInput={function(e) { handleScrubInput(e.target.value) }}
                onPointerDown={function() {
                    scrubbingRef.current = true
                    setScrubbing(true)
                }}
                onPointerUp={function(e) { endScrub(e.target.value) }}
                onPointerCancel={function(e) { endScrub(e.target.value) }}
                onMouseUp={function(e) { endScrub(e.target.value) }}
                onTouchEnd={function(e) { endScrub(e.target.value) }}
                onBlur={function(e) {
                    if (scrubbingRef.current) endScrub(e.target.value)
                }}
            />
        </div>
    )
}
