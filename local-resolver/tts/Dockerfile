# CPU Piper TTS for abc2book (OHF piper1-gpl HTTP server).
FROM ubuntu:24.04

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    espeak-ng \
    espeak-ng-data \
    libsndfile1 \
    python3 \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-piper.txt /app/requirements-piper.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages -r /app/requirements-piper.txt

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV TTS_PIPER_VOICE=en_US-lessac-medium \
    TTS_PIPER_DATA_DIR=/voices \
    TTS_LISTEN_HOST=0.0.0.0 \
    TTS_LISTEN_PORT=5000 \
    PYTHONUNBUFFERED=1

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD curl -fsS --max-time 5 http://127.0.0.1:5000/info || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
