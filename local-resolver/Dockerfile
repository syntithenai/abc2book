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
COPY prefetch_autochord.py /build/prefetch_autochord.py
COPY prefetch_madmom.py /build/prefetch_madmom.py
COPY prefetch_demucs.py /build/prefetch_demucs.py
COPY prefetch_basic_pitch.py /build/prefetch_basic_pitch.py

# Applied to isolated build environments too, so legacy setup.py builds (crepe,
# madmom) get a setuptools that still provides pkg_resources.
ENV PIP_CONSTRAINT=/build/constraints-build.txt

ENV AUTOCHORD_VENV=/opt/autochord-venv
RUN python -m venv "${AUTOCHORD_VENV}" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --upgrade pip \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir "setuptools<82" wheel \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir "numpy>=1.19,<2" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --no-build-isolation vamp \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir -r /build/requirements-chords.txt \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir torch torchaudio --index-url ${MELODY_TORCH_INDEX} \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir -r /build/requirements-melody.txt \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir "Cython>=0.29" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --no-build-isolation \
        "madmom @ git+https://github.com/CPJKU/madmom.git@main" \
    && MELODY_PREFETCH_DEVICE=${MELODY_PREFETCH_DEVICE} "${AUTOCHORD_VENV}/bin/python" /build/prefetch_autochord.py \
    && "${AUTOCHORD_VENV}/bin/python" /build/prefetch_madmom.py \
    && MELODY_PREFETCH_DEVICE=${MELODY_PREFETCH_DEVICE} "${AUTOCHORD_VENV}/bin/python" /build/prefetch_demucs.py \
    && "${AUTOCHORD_VENV}/bin/python" /build/prefetch_basic_pitch.py


FROM ghcr.io/ggml-org/whisper.cpp:main-vulkan

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-dev \
    python3-pip \
    build-essential \
    ffmpeg \
    libsndfile1 \
    ca-certificates \
    curl \
    unzip \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

# vamp imports numpy in setup.py during installs in the chord build stage only.
RUN pip3 install --no-cache-dir --break-system-packages "numpy>=1.19"
RUN pip3 install --no-cache-dir --break-system-packages -r /app/requirements.txt

ENV AUTOCHORD_VENV=/opt/autochord-venv
COPY --from=autochord-env /opt/autochord-venv /opt/autochord-venv
COPY --from=autochord-env /root/.autochord /root/.autochord
# Demucs htdemucs weights are prefetched into the torch hub cache; copy it so
# stem separation works offline at runtime (otherwise it re-downloads).
COPY --from=autochord-env /root/.cache/torch /root/.cache/torch

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
    && ln -sf /usr/local/bin/python3.11 /opt/autochord-venv/bin/python3

COPY server.py /app/server.py
COPY detect_chords.py /app/detect_chords.py
COPY detect_melody.py /app/detect_melody.py
COPY detect_timing.py /app/detect_timing.py
COPY chord_processing.py /app/chord_processing.py
COPY melody_pitch_processing.py /app/melody_pitch_processing.py
COPY audio_analysis_filters.py /app/audio_analysis_filters.py
COPY stem_separation.py /app/stem_separation.py
COPY separate_stems.py /app/separate_stems.py
COPY eval_transcription.py /app/eval_transcription.py

EXPOSE 8787

ENTRYPOINT []
CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8787"]
