# OpenAI-compatible LLM for abc2book (llama.cpp Vulkan, or external proxy).
#
# Build args:
#   LLM_LLAMA_RELEASE  llama.cpp release tag (default: b9978)
#   LLM_LLAMA_ASSET    release asset name (default: ubuntu vulkan x64)

ARG LLM_LLAMA_RELEASE=b9978
ARG LLM_LLAMA_ASSET=llama-b9978-bin-ubuntu-vulkan-x64.tar.gz

FROM ubuntu:24.04 AS llama_bins
ARG LLM_LLAMA_RELEASE
ARG LLM_LLAMA_ASSET
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp
RUN curl -fsSL -o /tmp/llama.tar.gz \
    "https://github.com/ggml-org/llama.cpp/releases/download/${LLM_LLAMA_RELEASE}/${LLM_LLAMA_ASSET}" \
  && mkdir -p /opt/llama.cpp \
  && tar -xzf /tmp/llama.tar.gz -C /opt/llama.cpp --strip-components=1 \
  && rm /tmp/llama.tar.gz \
  && test -x /opt/llama.cpp/llama-server

FROM ubuntu:24.04
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libgomp1 \
    libvulkan1 \
    mesa-vulkan-drivers \
    python3 \
    python3-pip \
    python3-venv \
    vulkan-tools \
  && rm -rf /var/lib/apt/lists/*

COPY --from=llama_bins /opt/llama.cpp /opt/llama.cpp
ENV LD_LIBRARY_PATH=/opt/llama.cpp${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
RUN /opt/llama.cpp/llama-server --version

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages -r /app/requirements.txt
COPY openai_proxy.py external_proxy.py gateway.py local_front_proxy.py entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

ENV LLAMA_SERVER_BIN=/opt/llama.cpp/llama-server \
    LLM_LISTEN_HOST=0.0.0.0 \
    LLM_LISTEN_PORT=8080 \
    LLM_MODEL_FILE=/models/model.gguf \
    LLM_MODEL_ALIAS=google/gemma-4-31b-qat \
    LLM_CTX_SIZE=8192 \
    LLM_N_GPU_LAYERS=99 \
    LLM_WAIT_FOR_MODEL_SECONDS=0 \
    PYTHONUNBUFFERED=1

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=5 \
  CMD curl -fsS --max-time 5 http://127.0.0.1:8080/health \
    || curl -fsS --max-time 5 http://127.0.0.1:8080/v1/models \
    || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
