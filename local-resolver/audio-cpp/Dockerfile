# Runtime image for audio.cpp Vulkan sidecar (Stable Audio practice-track backing).
# Mount a host-built tree at /audio-cpp (see docker-compose.yml AUDIO_CPP_HOST_DIR).
FROM ubuntu:24.04

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libgomp1 \
    libvulkan1 \
    mesa-vulkan-drivers \
    vulkan-tools \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /app/entrypoint.sh
COPY server.docker.json /app/server.docker.json
RUN chmod +x /app/entrypoint.sh

WORKDIR /audio-cpp
EXPOSE 8788

ENTRYPOINT ["/app/entrypoint.sh"]
