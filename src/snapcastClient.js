/** Minimal Snapcast JSON-RPC client (MIT-compatible reimplementation). */

let requestId = 1;

function nextId() {
  requestId += 1;
  return requestId;
}

export class SnapcastClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.server = null;
    this.connected = false;
    this._pending = new Map();
    this.onServerChange = null;
    this.onConnectionChange = null;
  }

  connect() {
    const self = this;
    if (self.ws && (self.ws.readyState === WebSocket.OPEN || self.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve(self.connected);
    }
    return new Promise(function(resolve, reject) {
      try {
        self.ws = new WebSocket(self.wsUrl);
      } catch (err) {
        reject(err);
        return;
      }
      self.ws.onopen = function() {
        self.connected = true;
        if (typeof self.onConnectionChange === 'function') {
          self.onConnectionChange(true, null);
        }
        self.request('Server.GetStatus').then(function(result) {
          self.server = result && result.server ? result.server : result;
          if (typeof self.onServerChange === 'function') {
            self.onServerChange(self.server);
          }
          resolve(true);
        }).catch(reject);
      };
      self.ws.onmessage = function(event) {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (message.method === 'Server.OnUpdate') {
          self.server = message.params && message.params.server ? message.params.server : self.server;
          if (typeof self.onServerChange === 'function') {
            self.onServerChange(self.server);
          }
          return;
        }
        if (message.id !== undefined && self._pending.has(message.id)) {
          const entry = self._pending.get(message.id);
          self._pending.delete(message.id);
          if (message.error) {
            entry.reject(message.error);
          } else {
            entry.resolve(message.result);
          }
        }
      };
      self.ws.onerror = function() {
        if (typeof self.onConnectionChange === 'function') {
          self.onConnectionChange(false, new Error('WebSocket error'));
        }
      };
      self.ws.onclose = function() {
        self.connected = false;
        if (typeof self.onConnectionChange === 'function') {
          self.onConnectionChange(false, null);
        }
      };
    });
  }

  disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
    }
    this.ws = null;
    this.connected = false;
    this.server = null;
  }

  request(method, params) {
    const self = this;
    if (!self.ws || self.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Snapcast not connected'));
    }
    const id = nextId();
    const payload = { jsonrpc: '2.0', id: id, method: method };
    if (params !== undefined) {
      payload.params = params;
    }
    return new Promise(function(resolve, reject) {
      self._pending.set(id, { resolve: resolve, reject: reject });
      self.ws.send(JSON.stringify(payload));
      setTimeout(function() {
        if (self._pending.has(id)) {
          self._pending.delete(id);
          reject(new Error('Snapcast request timeout'));
        }
      }, 8000);
    });
  }

  setVolume(clientId, percent, mute) {
    return this.request('Client.SetVolume', {
      id: clientId,
      volume: {
        muted: !!mute,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
      },
    });
  }

  setGroupStream(groupId, streamId) {
    return this.request('Group.SetStream', {
      id: groupId,
      stream_id: streamId,
    });
  }

  setGroupName(groupId, name) {
    return this.request('Group.SetName', { id: groupId, name: name });
  }

  setGroupMute(groupId, mute) {
    return this.request('Group.SetMute', { id: groupId, mute: !!mute });
  }

  setClientName(clientId, name) {
    return this.request('Client.SetName', { id: clientId, name: name });
  }

  setClientLatency(clientId, latency) {
    return this.request('Client.SetLatency', { id: clientId, latency: latency });
  }

  setGroupVolume(groupId, percent, mute) {
    return this.request('Group.SetVolume', {
      id: groupId,
      volume: {
        muted: !!mute,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
      },
    });
  }

  listGroups() {
    const server = this.server || {};
    return Array.isArray(server.groups) ? server.groups : [];
  }

  listStreams() {
    const server = this.server || {};
    return Array.isArray(server.streams) ? server.streams : [];
  }

  findStreamByName(name) {
    const streams = this.listStreams();
    const target = String(name || '').toLowerCase();
    return streams.find(function(stream) {
      const id = String(stream.id || stream.name || '').toLowerCase();
      return id === target;
    }) || null;
  }
}
