FROM python:3.11-slim AS vision-env

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-vision.txt /build/requirements-vision.txt
COPY prefetch_vision.py /build/prefetch_vision.py
COPY sheet_image_ocr.py /build/sheet_image_ocr.py

ARG VISION_PREFETCH_DEVICE=cpu

ENV VISION_VENV=/opt/vision-venv
ENV VISION_CACHE_ROOT=/opt/vision-cache
ENV PADDLE_PDX_CACHE_HOME=/opt/vision-cache
ENV FLAGS_enable_pir_api=0
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
RUN python -m venv "${VISION_VENV}" \
    && "${VISION_VENV}/bin/pip" install --no-cache-dir --upgrade pip \
    && "${VISION_VENV}/bin/pip" install --no-cache-dir -r /build/requirements-vision.txt \
    && mkdir -p "${VISION_CACHE_ROOT}" \
    && VISION_PREFETCH_DEVICE=${VISION_PREFETCH_DEVICE:-cpu} \
        PADDLE_PDX_CACHE_HOME="${PADDLE_PDX_CACHE_HOME}" \
        PYTHONPATH=/build \
        "${VISION_VENV}/bin/python" /build/prefetch_vision.py


FROM python:3.11-slim AS autochord-env

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libsndfile1 \
    cython3 \
    git \
    && rm -rf /var/lib/apt/lists/*

ARG MELODY_TORCH_INDEX=https://download.pytorch.org/whl/cpu
ARG MELODY_PREFETCH_DEVICE=cpu

COPY constraints-build.txt /build/constraints-build.txt
COPY requirements-chords.txt /build/requirements-chords.txt
COPY requirements-melody.txt /build/requirements-melody.txt
COPY requirements-amt.txt /build/requirements-amt.txt
COPY prefetch_autochord.py /build/prefetch_autochord.py
COPY prefetch_madmom.py /build/prefetch_madmom.py
COPY prefetch_demucs.py /build/prefetch_demucs.py
COPY prefetch_basic_pitch.py /build/prefetch_basic_pitch.py
COPY prefetch_btc.py /build/prefetch_btc.py
COPY prefetch_kong.py /build/prefetch_kong.py
COPY install_crepe.py /build/install_crepe.py
COPY btc_chords /build/btc_chords

# Applied to isolated build environments too, so legacy setup.py builds (madmom)
# get a setuptools that still provides pkg_resources.
ENV PIP_CONSTRAINT=/build/constraints-build.txt

ENV AUTOCHORD_VENV=/opt/autochord-venv
ENV BTC_MODEL_DIR=/opt/btc-chords
ENV KONG_MODEL_DIR=/opt/kong-piano
ENV KONG_CHECKPOINT_PATH=/opt/kong-piano/note_F1=0.9677_pedal_F1=0.9186.pth
RUN python -m venv "${AUTOCHORD_VENV}" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --upgrade pip \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir "setuptools<82" wheel \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir "numpy>=1.19,<2" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --no-build-isolation vamp \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir -r /build/requirements-chords.txt \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir torch torchaudio --index-url ${MELODY_TORCH_INDEX} \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir -r /build/requirements-melody.txt \
    && "${AUTOCHORD_VENV}/bin/python" /build/install_crepe.py \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir -r /build/requirements-amt.txt \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir "Cython>=0.29" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --no-build-isolation \
        "madmom @ git+https://github.com/CPJKU/madmom.git@main" \
    && MELODY_PREFETCH_DEVICE=${MELODY_PREFETCH_DEVICE} "${AUTOCHORD_VENV}/bin/python" /build/prefetch_autochord.py \
    && "${AUTOCHORD_VENV}/bin/python" /build/prefetch_madmom.py \
    && MELODY_PREFETCH_DEVICE=${MELODY_PREFETCH_DEVICE} "${AUTOCHORD_VENV}/bin/python" /build/prefetch_demucs.py \
    && "${AUTOCHORD_VENV}/bin/python" /build/prefetch_basic_pitch.py \
    && "${AUTOCHORD_VENV}/bin/python" /build/prefetch_btc.py \
    && "${AUTOCHORD_VENV}/bin/python" /build/prefetch_kong.py


FROM ghcr.io/ggml-org/whisper.cpp:main-vulkan

WORKDIR /app

# MuseScore Studio Linux builds are AppImages only (no .deb on GitHub releases).
# Extract without FUSE so conversion works in Docker; expose as `mscore` for LibreScore fallback.
ARG MUSESCORE_APPIMAGE_URL=https://github.com/musescore/MuseScore/releases/download/v4.4.3/MuseScore-Studio-4.4.3.242971445-x86_64.AppImage

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-dev \
    python3-pip \
    build-essential \
    ffmpeg \
    libsndfile1 \
    fluidsynth \
    fluid-soundfont-gm \
    ca-certificates \
    curl \
    unzip \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    nodejs \
    npm \
    wget \
    xvfb \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && wget -qO /tmp/musescore.AppImage "${MUSESCORE_APPIMAGE_URL}" \
    && chmod +x /tmp/musescore.AppImage \
    && cd /tmp && ./musescore.AppImage --appimage-extract \
    && mv /tmp/squashfs-root /opt/musescore \
    && ln -sf /opt/musescore/AppRun /usr/local/bin/mscore \
    && ln -sf /opt/musescore/AppRun /usr/local/bin/musescore \
    && rm -f /tmp/musescore.AppImage \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

# vamp imports numpy in setup.py during installs in the chord build stage only.
RUN pip3 install --no-cache-dir --break-system-packages "numpy>=1.19"
RUN pip3 install --no-cache-dir --break-system-packages -r /app/requirements.txt \
    && apt-get update \
    && python3 -m playwright install-deps chromium \
    && python3 -m playwright install chromium \
    && rm -rf /var/lib/apt/lists/*

ENV AUTOCHORD_VENV=/opt/autochord-venv
COPY --from=autochord-env /opt/autochord-venv /opt/autochord-venv
COPY --from=autochord-env /root/.autochord /root/.autochord
COPY --from=autochord-env /opt/btc-chords /opt/btc-chords
COPY --from=autochord-env /opt/kong-piano /opt/kong-piano
COPY --from=autochord-env /root/piano_transcription_inference_data /root/piano_transcription_inference_data
# Demucs 4.1+ prefetches bag models (htdemucs, …) into the HuggingFace hub
# cache; legacy AWS fallbacks still use the torch hub cache. Copy both so
# stem separation works offline at runtime (otherwise it re-downloads).
COPY --from=autochord-env /root/.cache/huggingface /root/.cache/huggingface
COPY --from=autochord-env /root/.cache/torch /root/.cache/torch
ENV BTC_MODEL_DIR=/opt/btc-chords
ENV KONG_MODEL_DIR=/opt/kong-piano
ENV KONG_CHECKPOINT_PATH=/opt/kong-piano/note_F1=0.9677_pedal_F1=0.9186.pth
ENV CHORD_BACKEND=auto
ENV VISION_VENV=/opt/vision-venv
ENV VISION_CACHE_ROOT=/opt/vision-cache
ENV PADDLE_PDX_CACHE_HOME=/opt/vision-cache
ENV FLAGS_enable_pir_api=0
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
COPY --from=vision-env /opt/vision-venv /opt/vision-venv
COPY --from=vision-env /opt/vision-cache /opt/vision-cache

# The chord venv was built with Python 3.11; copy that interpreter into the runtime image.
COPY --from=autochord-env /usr/local/bin/python3.11 /usr/local/bin/python3.11
COPY --from=autochord-env /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=autochord-env /usr/local/lib/libpython3.11.so.1.0 /usr/local/lib/libpython3.11.so.1.0
COPY --from=autochord-env /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /opt/autochord-libs/libcrypto.so.3
COPY --from=autochord-env /usr/lib/x86_64-linux-gnu/libssl.so.3 /opt/autochord-libs/libssl.so.3
RUN mkdir -p /opt/autochord-libs \
    && ln -sf libpython3.11.so.1.0 /usr/local/lib/libpython3.11.so \
    && ln -sf libpython3.11.so.1.0 /usr/local/lib/libpython3.so \
    && ln -sf /usr/local/bin/python3.11 /opt/autochord-venv/bin/python \
    && ln -sf /usr/local/bin/python3.11 /opt/autochord-venv/bin/python3 \
    && ln -sf /usr/local/bin/python3.11 /opt/vision-venv/bin/python \
    && ln -sf /usr/local/bin/python3.11 /opt/vision-venv/bin/python3

# Single-layer app copy: per-file COPY instructions exceeded overlay2's 128-layer limit.
COPY *.py music_collection_registry.json /app/
COPY btc_chords /app/btc_chords
COPY music_generation /app/music_generation
COPY scripts/eval_chords.py scripts/eval_melody_backends.py \
    scripts/build_music_collection_index.py scripts/snapcast_tunebook_plugin.py \
    /app/scripts/

EXPOSE 8787

ENTRYPOINT []
CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8787"]
