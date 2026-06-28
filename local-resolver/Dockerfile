FROM python:3.11-slim AS autochord-env

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-chords.txt /build/requirements-chords.txt
COPY prefetch_autochord.py /build/prefetch_autochord.py

ENV AUTOCHORD_VENV=/opt/autochord-venv
RUN python -m venv "${AUTOCHORD_VENV}" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --upgrade pip \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir "numpy>=1.19,<2" \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir --no-build-isolation vamp \
    && "${AUTOCHORD_VENV}/bin/pip" install --no-cache-dir -r /build/requirements-chords.txt \
    && "${AUTOCHORD_VENV}/bin/python" /build/prefetch_autochord.py


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

EXPOSE 8787

ENTRYPOINT []
CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8787"]
