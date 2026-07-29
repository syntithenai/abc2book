"""Chromecast HLS playback sessions — ffmpeg transcode to signed playlist URLs."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from cast_transcode_session import (
    TranscodeSettings,
    build_ffmpeg_hls_command,
    build_ffmpeg_hls_concat_command,
    ffmpeg_available,
    parse_transcode_settings,
)


@dataclass
class CastQueueItem:
    source: str
    source_type: str = ""
    title: str | None = None
    artist: str | None = None
    duration: float = 0.0


@dataclass
class CastSession:
    session_id: str
    source: str
    settings: TranscodeSettings
    output_dir: str
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    duration: float = 0.0
    current_time: float = 0.0
    is_playing: bool = False
    title: str | None = None
    artist: str | None = None
    queue: list[CastQueueItem] = field(default_factory=list)
    queue_index: int = 0
    _input_path: str | None = field(default=None, repr=False)
    _input_paths: list[str] = field(default_factory=list, repr=False)
    _concat_list_path: str | None = field(default=None, repr=False)
    _input_is_temp: bool = False
    _proc: Any = field(default=None, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _stop_event: threading.Event = field(default_factory=threading.Event, repr=False)
    _monitor_thread: threading.Thread | None = field(default=None, repr=False)

    def playlist_path(self) -> str:
        return os.path.join(self.output_dir, "playlist.m3u8")

    def to_status(self) -> dict[str, Any]:
        with self._lock:
            playlist_ready = os.path.isfile(self.playlist_path())
            return {
                "sessionId": self.session_id,
                "source": self.source,
                "currentTime": round(self.current_time, 3),
                "duration": round(self.duration, 3),
                "isPlaying": self.is_playing,
                "title": self.title,
                "artist": self.artist,
                "queueIndex": self.queue_index,
                "queueLength": len(self.queue),
                "canGoNext": self.queue_index + 1 < len(self.queue),
                "playlistReady": playlist_ready,
            }

    def touch_activity(self, playhead_seconds: float | None = None) -> None:
        with self._lock:
            self.last_activity = time.time()
            if playhead_seconds is not None and playhead_seconds >= 0:
                self.current_time = float(playhead_seconds)

    def to_plugin_state(self) -> dict[str, Any]:
        with self._lock:
            return {
                "canPlay": True,
                "canPause": True,
                "canSeek": True,
                "canGoNext": self.queue_index + 1 < len(self.queue),
                "canGoPrevious": self.queue_index > 0,
                "isPlaying": self.is_playing,
                "currentTime": round(self.current_time, 3),
                "duration": round(self.duration, 3),
                "title": self.title or "",
                "artist": self.artist or "",
            }


class CastPlaybackManager:
    def __init__(self) -> None:
        self._sessions: dict[str, CastSession] = {}
        self._lock = threading.Lock()
        self._base_dir = os.getenv("CAST_SESSION_DIR", "/tmp/abc2book-cast-sessions")
        self._max_sessions = int(os.getenv("CAST_MAX_SESSIONS", "4") or "4")
        self._session_ttl_seconds = int(os.getenv("CAST_SESSION_TTL_SECONDS", "1800") or "1800")
        self._max_session_age_seconds = int(os.getenv("CAST_MAX_SESSION_AGE_SECONDS", "7200") or "7200")
        os.makedirs(self._base_dir, exist_ok=True)
        self._start_sweeper()

    def _start_sweeper(self) -> None:
        def loop() -> None:
            while True:
                try:
                    self._sweep_stale_sessions()
                except Exception:
                    pass
                time.sleep(300)

        thread = threading.Thread(target=loop, name="cast-session-sweeper", daemon=True)
        thread.start()

    def _sweep_stale_sessions(self) -> None:
        now = time.time()
        stale_ids: list[str] = []
        with self._lock:
            for session_id, session in self._sessions.items():
                inactive = now - session.last_activity
                age = now - session.created_at
                proc_dead = session._proc is not None and session._proc.poll() is not None
                if inactive > self._session_ttl_seconds or age > self._max_session_age_seconds:
                    stale_ids.append(session_id)
                elif proc_dead and inactive > 300:
                    stale_ids.append(session_id)
        for session_id in stale_ids:
            with self._lock:
                self._stop_session_locked(session_id)

    def _session_dir(self, session_id: str) -> str:
        return os.path.join(self._base_dir, session_id)

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._lock:
            return [session.to_status() for session in self._sessions.values()]

    def get_session(self, session_id: str) -> CastSession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def create_session(
        self,
        *,
        source: str,
        input_path: str,
        duration: float,
        settings: TranscodeSettings,
        title: str | None = None,
        artist: str | None = None,
        input_is_temp: bool = False,
        queue: list[CastQueueItem] | None = None,
        input_paths: list[str] | None = None,
    ) -> CastSession:
        if not ffmpeg_available():
            raise RuntimeError("ffmpeg is not available")
        with self._lock:
            if len(self._sessions) >= self._max_sessions:
                raise RuntimeError("Maximum concurrent Cast sessions reached")
            for existing_id in list(self._sessions.keys()):
                self._stop_session_locked(existing_id)
            session_id = uuid.uuid4().hex
            output_dir = self._session_dir(session_id)
            os.makedirs(output_dir, exist_ok=True)
            concat_paths = [path for path in (input_paths or []) if path]
            session = CastSession(
                session_id=session_id,
                source=source,
                settings=settings,
                output_dir=output_dir,
                duration=max(0.0, float(duration or 0)),
                current_time=settings.start_seconds,
                title=title,
                artist=artist,
                queue=queue or [],
                _input_path=input_path,
                _input_paths=concat_paths,
                _input_is_temp=input_is_temp,
            )
            self._sessions[session_id] = session
        self._start_ffmpeg(session)
        return session

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            return self._stop_session_locked(session_id)

    def _stop_session_locked(self, session_id: str) -> bool:
        session = self._sessions.pop(session_id, None)
        if not session:
            return False
        session._stop_event.set()
        proc = session._proc
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        if session._monitor_thread and session._monitor_thread.is_alive():
            session._monitor_thread.join(timeout=2)
        if session._input_is_temp and session._input_path:
            try:
                os.unlink(session._input_path)
            except OSError:
                pass
        for path in session._input_paths:
            if path and path != session._input_path:
                try:
                    os.unlink(path)
                except OSError:
                    pass
        if session._concat_list_path:
            try:
                os.unlink(session._concat_list_path)
            except OSError:
                pass
        try:
            shutil.rmtree(session.output_dir, ignore_errors=True)
        except Exception:
            pass
        return True

    def seek_session(self, session_id: str, seconds: float) -> CastSession | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or not session._input_path:
                return None
            settings = TranscodeSettings(
                pitch_semitones=session.settings.pitch_semitones,
                fine_tune_cents=session.settings.fine_tune_cents,
                tempo=session.settings.tempo,
                start_seconds=max(0.0, float(seconds or 0)),
            )
            input_path = session._input_path
            input_is_temp = session._input_is_temp
            session._input_is_temp = False
            title = session.title
            artist = session.artist
            source = session.source
            duration = session.duration
            queue = session.queue
            queue_index = session.queue_index
            self._stop_session_locked(session_id)
            output_dir = self._session_dir(session_id)
            os.makedirs(output_dir, exist_ok=True)
            new_session = CastSession(
                session_id=session_id,
                source=source,
                settings=settings,
                output_dir=output_dir,
                duration=duration,
                current_time=settings.start_seconds,
                title=title,
                artist=artist,
                queue=queue,
                queue_index=queue_index,
                is_playing=True,
                _input_path=input_path,
                _input_is_temp=input_is_temp,
            )
            self._sessions[session_id] = new_session
        self._start_ffmpeg(new_session)
        return new_session

    def set_playing(self, session_id: str, playing: bool) -> bool:
        session = self.get_session(session_id)
        if not session:
            return False
        with session._lock:
            session.is_playing = playing
            session.last_activity = time.time()
        return True

    def go_next(self, session_id: str) -> CastSession | None:
        """Advance queue index without new audio — use advance_queue after resolving next source."""
        session = self.get_session(session_id)
        if not session or session.queue_index + 1 >= len(session.queue):
            return None
        return session

    def advance_queue(
        self,
        session_id: str,
        *,
        input_path: str,
        source: str,
        duration: float,
        title: str | None,
        artist: str | None,
        input_is_temp: bool = True,
    ) -> CastSession | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            next_index = session.queue_index + 1
            if next_index >= len(session.queue):
                return None
            settings = TranscodeSettings(
                pitch_semitones=session.settings.pitch_semitones,
                fine_tune_cents=session.settings.fine_tune_cents,
                tempo=session.settings.tempo,
                start_seconds=0.0,
            )
            queue = session.queue
            self._stop_session_locked(session_id)
            output_dir = self._session_dir(session_id)
            os.makedirs(output_dir, exist_ok=True)
            new_session = CastSession(
                session_id=session_id,
                source=source,
                settings=settings,
                output_dir=output_dir,
                duration=max(0.0, float(duration or 0)),
                current_time=0.0,
                title=title,
                artist=artist,
                queue=queue,
                queue_index=next_index,
                is_playing=True,
                _input_path=input_path,
                _input_is_temp=input_is_temp,
            )
            self._sessions[session_id] = new_session
        self._start_ffmpeg(new_session)
        return new_session

    def plugin_state(self) -> dict[str, Any]:
        with self._lock:
            if not self._sessions:
                return {
                    "canPlay": False,
                    "canPause": False,
                    "canSeek": False,
                    "isPlaying": False,
                    "currentTime": 0,
                    "duration": 0,
                    "title": "",
                    "artist": "",
                }
            session = next(iter(self._sessions.values()))
        return session.to_plugin_state()

    def _start_ffmpeg(self, session: CastSession) -> None:
        if session._input_paths and len(session._input_paths) > 1:
            cmd, concat_list = build_ffmpeg_hls_concat_command(
                session._input_paths,
                session.settings,
                output_dir=session.output_dir,
            )
            session._concat_list_path = concat_list
        else:
            if not session._input_path:
                raise RuntimeError("Session has no input path")
            cmd = build_ffmpeg_hls_command(
                session._input_path,
                session.settings,
                output_dir=session.output_dir,
            )
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        session._proc = proc
        session.is_playing = True
        session._stop_event.clear()

        def monitor() -> None:
            start = time.time()
            base_offset = session.settings.start_seconds
            try:
                while not session._stop_event.is_set():
                    if proc.poll() is not None:
                        break
                    with session._lock:
                        elapsed = time.time() - start
                        session.current_time = base_offset + elapsed * session.settings.tempo
                        session.last_activity = time.time()
                    time.sleep(0.5)
                with session._lock:
                    session.is_playing = False
            finally:
                if proc.poll() is None:
                    try:
                        proc.terminate()
                    except Exception:
                        pass

        thread = threading.Thread(target=monitor, name=f"cast-{session.session_id[:8]}", daemon=True)
        session._monitor_thread = thread
        thread.start()

    def health_fields(self) -> dict[str, Any]:
        total_bytes = 0
        try:
            for root, _dirs, files in os.walk(self._base_dir):
                for name in files:
                    try:
                        total_bytes += os.path.getsize(os.path.join(root, name))
                    except OSError:
                        pass
        except OSError:
            total_bytes = 0
        return {
            "enabled": True,
            "sessionCount": len(self._sessions),
            "sessionDir": self._base_dir,
            "storageBytesUsed": total_bytes,
        }


_manager: CastPlaybackManager | None = None


def get_cast_manager() -> CastPlaybackManager:
    global _manager
    if _manager is None:
        _manager = CastPlaybackManager()
    return _manager


def parse_queue_items(body: dict[str, Any]) -> list[CastQueueItem]:
    raw = body.get("queue")
    if not isinstance(raw, list):
        return []
    items: list[CastQueueItem] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        source = str(entry.get("source") or entry.get("sourceUrl") or "").strip()
        if not source:
            continue
        items.append(
            CastQueueItem(
                source=source,
                source_type=str(entry.get("sourceType") or "").strip().lower(),
                title=entry.get("title"),
                artist=entry.get("artist"),
                duration=float(entry.get("duration") or 0),
            )
        )
    return items


def write_temp_audio_file(data: bytes, suffix: str = ".audio") -> str:
    fd, path = tempfile.mkstemp(prefix="cast-", suffix=suffix)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
    return path
