"""Snapcast PCM playback sessions — ffmpeg feed to TCP clients (snapserver)."""

from __future__ import annotations

import asyncio
import json
import os
import socket
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from cast_transcode_session import (
    TranscodeSettings,
    build_ffmpeg_pcm_command,
    ffmpeg_available,
    parse_transcode_settings,
)
from snapcast_config import snapcast_max_sessions, snapcast_stream_name, snapcast_tcp_bind


@dataclass
class SnapcastSession:
    session_id: str
    source: str
    stream_name: str
    settings: TranscodeSettings
    group_id: str | None = None
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    duration: float = 0.0
    current_time: float = 0.0
    is_playing: bool = False
    bytes_written: int = 0
    title: str | None = None
    artist: str | None = None
    queue: list[Any] = field(default_factory=list)
    queue_index: int = 0
    _proc: Any = field(default=None, repr=False)
    _input_path: str | None = field(default=None, repr=False)
    _input_is_temp: bool = False
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _stop_event: threading.Event = field(default_factory=threading.Event, repr=False)
    _writer_thread: threading.Thread | None = field(default=None, repr=False)

    def to_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "sessionId": self.session_id,
                "streamId": self.stream_name,
                "source": self.source,
                "groupId": self.group_id,
                "currentTime": round(self.current_time, 3),
                "duration": round(self.duration, 3),
                "isPlaying": self.is_playing,
                "bytesWritten": self.bytes_written,
                "title": self.title,
                "artist": self.artist,
                "queueIndex": self.queue_index,
                "queueLength": len(self.queue),
                "canGoNext": self.queue_index + 1 < len(self.queue),
            }

    def to_plugin_state(self) -> dict[str, Any]:
        with self._lock:
            return {
                "canPlay": True,
                "canPause": True,
                "canSeek": True,
                "canGoNext": self.queue_index + 1 < len(self.queue),
                "canGoPrevious": False,
                "isPlaying": self.is_playing,
                "currentTime": round(self.current_time, 3),
                "duration": round(self.duration, 3),
                "title": self.title or "",
                "artist": self.artist or "",
            }


class SnapcastTcpHub:
    """Accepts snapserver TCP client connections and routes PCM from active sessions."""

    def __init__(self) -> None:
        self._clients: list[socket.socket] = []
        self._clients_lock = threading.Lock()
        self._server_socket: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._running = False

    def start(self) -> None:
        if self._running:
            return
        host, _, port_str = snapcast_tcp_bind().partition(":")
        port = int(port_str or "4954")
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((host or "0.0.0.0", port))
        server.listen(5)
        self._server_socket = server
        self._running = True
        self._thread = threading.Thread(target=self._accept_loop, name="snapcast-tcp", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._server_socket:
            try:
                self._server_socket.close()
            except OSError:
                pass
        with self._clients_lock:
            for client in self._clients:
                try:
                    client.close()
                except OSError:
                    pass
            self._clients.clear()

    def _accept_loop(self) -> None:
        while self._running and self._server_socket:
            try:
                client, _addr = self._server_socket.accept()
                client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                with self._clients_lock:
                    self._clients.append(client)
            except OSError:
                break

    def broadcast(self, data: bytes) -> None:
        dead: list[socket.socket] = []
        with self._clients_lock:
            for client in self._clients:
                try:
                    client.sendall(data)
                except OSError:
                    dead.append(client)
            for client in dead:
                try:
                    self._clients.remove(client)
                    client.close()
                except (OSError, ValueError):
                    pass

    def client_count(self) -> int:
        with self._clients_lock:
            return len(self._clients)


class SnapcastPlaybackManager:
    def __init__(self) -> None:
        self._sessions: dict[str, SnapcastSession] = {}
        self._lock = threading.Lock()
        self._tcp_hub = SnapcastTcpHub()
        self._active_session_id: str | None = None
        self._started = False

    def ensure_started(self) -> None:
        if not self._started:
            self._tcp_hub.start()
            self._started = True

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._lock:
            return [session.to_status() for session in self._sessions.values()]

    def get_session(self, session_id: str) -> SnapcastSession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def get_active_session(self) -> SnapcastSession | None:
        with self._lock:
            if not self._active_session_id:
                return None
            return self._sessions.get(self._active_session_id)

    def create_session(
        self,
        *,
        source: str,
        input_path: str,
        duration: float,
        settings: TranscodeSettings,
        group_id: str | None = None,
        title: str | None = None,
        artist: str | None = None,
        input_is_temp: bool = False,
        queue: list[Any] | None = None,
    ) -> SnapcastSession:
        self.ensure_started()
        with self._lock:
            if len(self._sessions) >= snapcast_max_sessions():
                raise RuntimeError("Maximum concurrent Snapcast sessions reached")
            for existing_id in list(self._sessions.keys()):
                self._stop_session_locked(existing_id)
            session_id = uuid.uuid4().hex
            session = SnapcastSession(
                session_id=session_id,
                source=source,
                stream_name=snapcast_stream_name(),
                settings=settings,
                group_id=group_id,
                duration=max(0.0, float(duration or 0)),
                current_time=settings.start_seconds,
                title=title,
                artist=artist,
                queue=queue or [],
                queue_index=0,
                _input_path=input_path,
                _input_is_temp=input_is_temp,
            )
            self._sessions[session_id] = session
            self._active_session_id = session_id
        self._start_ffmpeg(session)
        return session

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            return self._stop_session_locked(session_id)

    def _stop_session_locked(self, session_id: str) -> bool:
        session = self._sessions.pop(session_id, None)
        if not session:
            return False
        if self._active_session_id == session_id:
            self._active_session_id = None
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
        if session._writer_thread and session._writer_thread.is_alive():
            session._writer_thread.join(timeout=2)
        if session._input_is_temp and session._input_path:
            try:
                os.unlink(session._input_path)
            except OSError:
                pass
        return True

    def seek_session(self, session_id: str, seconds: float) -> SnapcastSession | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            input_path = session._input_path
            if not input_path:
                return None
            settings = TranscodeSettings(
                pitch_semitones=session.settings.pitch_semitones,
                fine_tune_cents=session.settings.fine_tune_cents,
                tempo=session.settings.tempo,
                start_seconds=max(0.0, float(seconds or 0)),
            )
            self._stop_session_locked(session_id)
            new_session = SnapcastSession(
                session_id=session_id,
                source=session.source,
                stream_name=session.stream_name,
                settings=settings,
                group_id=session.group_id,
                duration=session.duration,
                current_time=settings.start_seconds,
                title=session.title,
                artist=session.artist,
                queue=session.queue,
                queue_index=session.queue_index,
                is_playing=True,
                _input_path=input_path,
                _input_is_temp=session._input_is_temp,
            )
            new_session._input_is_temp = False  # temp file ownership retained
            self._sessions[session_id] = new_session
            self._active_session_id = session_id
        self._start_ffmpeg(new_session)
        return new_session

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
    ) -> SnapcastSession | None:
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
            group_id = session.group_id
            stream_name = session.stream_name
            self._stop_session_locked(session_id)
            new_session = SnapcastSession(
                session_id=session_id,
                source=source,
                stream_name=stream_name,
                settings=settings,
                group_id=group_id,
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
            self._active_session_id = session_id
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

    def plugin_state(self) -> dict[str, Any]:
        session = self.get_active_session()
        if not session:
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
        return session.to_plugin_state()

    def _start_ffmpeg(self, session: SnapcastSession) -> None:
        if not ffmpeg_available():
            raise RuntimeError("ffmpeg is not available")
        if not session._input_path:
            raise RuntimeError("Session has no input path")
        import subprocess

        cmd = build_ffmpeg_pcm_command(
            session._input_path,
            session.settings,
            output_target="pipe:1",
        )
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        session._proc = proc
        session.is_playing = True
        session._stop_event.clear()

        def writer() -> None:
            start = time.time()
            base_offset = session.settings.start_seconds
            assert proc.stdout is not None
            try:
                while not session._stop_event.is_set():
                    chunk = proc.stdout.read(8192)
                    if not chunk:
                        break
                    self._tcp_hub.broadcast(chunk)
                    with session._lock:
                        session.bytes_written += len(chunk)
                        elapsed = time.time() - start
                        session.current_time = base_offset + elapsed * session.settings.tempo
                        session.last_activity = time.time()
                with session._lock:
                    session.is_playing = False
            finally:
                if proc.poll() is None:
                    try:
                        proc.terminate()
                    except Exception:
                        pass

        thread = threading.Thread(target=writer, name=f"snapcast-{session.session_id[:8]}", daemon=True)
        session._writer_thread = thread
        thread.start()

    def tcp_client_count(self) -> int:
        return self._tcp_hub.client_count()

    def health_fields(self) -> dict[str, Any]:
        return {
            "enabled": True,
            "streamName": snapcast_stream_name(),
            "tcpBind": snapcast_tcp_bind(),
            "tcpClients": self.tcp_client_count(),
            "activeSession": self._active_session_id,
            "sessionCount": len(self._sessions),
        }


_manager: SnapcastPlaybackManager | None = None


def get_snapcast_manager() -> SnapcastPlaybackManager:
    global _manager
    if _manager is None:
        _manager = SnapcastPlaybackManager()
    return _manager


async def probe_snapserver_http(host: str, port: int = 1780, timeout: float = 2.0) -> bool:
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=timeout,
        )
        writer.write(b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n")
        await writer.drain()
        data = await asyncio.wait_for(reader.read(64), timeout=timeout)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return b"HTTP" in data or len(data) > 0
    except Exception:
        return False


def write_temp_audio_file(data: bytes, suffix: str = ".audio") -> str:
    fd, path = tempfile.mkstemp(prefix="snapcast-", suffix=suffix)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
    return path
