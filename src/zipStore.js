const CRC_TABLE = (function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}());

export function crc32(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);
  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function encodeFilename(name) {
  return new TextEncoder().encode(String(name || 'file').replace(/\\/g, '/'));
}

/**
 * Create a ZIP archive using STORE (no compression). Each entry is
 * { name: 'path.wav', data: Uint8Array }.
 */
export function createZipArchive(entries) {
  const items = Array.isArray(entries) ? entries : [];
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = dosDateTime();

  items.forEach(function(entry) {
    const nameBytes = encodeFilename(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const checksum = crc32(data);

    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const localView = new DataView(localHeader);
    let p = 0;
    localView.setUint32(p, 0x04034b50, true); p += 4;
    localView.setUint16(p, 20, true); p += 2;
    localView.setUint16(p, 0, true); p += 2;
    localView.setUint16(p, 0, true); p += 2;
    localView.setUint16(p, now.dosTime, true); p += 2;
    localView.setUint16(p, now.dosDate, true); p += 2;
    localView.setUint32(p, checksum, true); p += 4;
    localView.setUint32(p, data.length, true); p += 4;
    localView.setUint32(p, data.length, true); p += 4;
    localView.setUint16(p, nameBytes.length, true); p += 2;
    localView.setUint16(p, 0, true); p += 2;
    new Uint8Array(localHeader, 30).set(nameBytes);
    localParts.push(new Uint8Array(localHeader), data);

    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const centralView = new DataView(centralHeader);
    p = 0;
    centralView.setUint32(p, 0x02014b50, true); p += 4;
    centralView.setUint16(p, 20, true); p += 2;
    centralView.setUint16(p, 20, true); p += 2;
    centralView.setUint16(p, 0, true); p += 2;
    centralView.setUint16(p, 0, true); p += 2;
    centralView.setUint16(p, now.dosTime, true); p += 2;
    centralView.setUint16(p, now.dosDate, true); p += 2;
    centralView.setUint32(p, checksum, true); p += 4;
    centralView.setUint32(p, data.length, true); p += 4;
    centralView.setUint32(p, data.length, true); p += 4;
    centralView.setUint16(p, nameBytes.length, true); p += 2;
    centralView.setUint16(p, 0, true); p += 2;
    centralView.setUint16(p, 0, true); p += 2;
    centralView.setUint16(p, 0, true); p += 2;
    centralView.setUint16(p, 0, true); p += 2;
    centralView.setUint32(p, 0, true); p += 4;
    centralView.setUint32(p, offset, true); p += 4;
    new Uint8Array(centralHeader, 46).set(nameBytes);
    centralParts.push(new Uint8Array(centralHeader));

    offset += localHeader.byteLength + data.length;
  });

  const centralSize = centralParts.reduce(function(sum, part) {
    return sum + part.length;
  }, 0);
  const centralStart = offset;
  const endRecord = new ArrayBuffer(22);
  const endView = new DataView(endRecord);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, items.length, true);
  endView.setUint16(10, items.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralStart, true);
  endView.setUint16(20, 0, true);

  const totalLength = localParts.reduce(function(sum, part) {
    return sum + part.length;
  }, 0) + centralSize + 22;
  const output = new Uint8Array(totalLength);
  let pos = 0;
  localParts.forEach(function(part) {
    output.set(part, pos);
    pos += part.length;
  });
  centralParts.forEach(function(part) {
    output.set(part, pos);
    pos += part.length;
  });
  output.set(new Uint8Array(endRecord), pos);

  return new Blob([output], { type: 'application/zip' });
}
