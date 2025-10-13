const fs = require('fs-extra');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHUNK_TYPE_GAMA = 'gAMA';
const CHUNK_TYPE_IHDR = 'IHDR';

let crcTable;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = table[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function isPng(buffer) {
  return buffer.length >= PNG_SIGNATURE.length && buffer.slice(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

function extractGamma(buffer) {
  if (!isPng(buffer)) return null;
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    if (type === CHUNK_TYPE_GAMA && length === 4) {
      const value = buffer.readUInt32BE(offset);
      return value;
    }
    offset += length + 4; // skip data + CRC
  }
  return null;
}

function buildChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function insertOrReplaceGamma(buffer, gammaValue) {
  if (!isPng(buffer) || typeof gammaValue !== 'number') return null;

  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  let existingGamma = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const chunkStart = offset;
    offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    const dataStart = offset;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    const raw = buffer.slice(chunkStart, crcEnd);
    chunks.push({ type, data: buffer.slice(dataStart, dataEnd), raw });
    if (type === CHUNK_TYPE_GAMA && length === 4) {
      existingGamma = buffer.readUInt32BE(dataStart);
    }
    offset = crcEnd;
  }

  if (existingGamma === gammaValue) {
    return null; // No change required
  }

  const gammaData = Buffer.alloc(4);
  gammaData.writeUInt32BE(gammaValue, 0);
  const gammaChunk = buildChunk(CHUNK_TYPE_GAMA, gammaData);
  const outputChunks = [PNG_SIGNATURE];
  let gammaInserted = false;

  for (const chunk of chunks) {
    if (chunk.type === CHUNK_TYPE_IHDR) {
      outputChunks.push(chunk.raw);
      if (!gammaInserted) {
        outputChunks.push(gammaChunk);
        gammaInserted = true;
      }
      continue;
    }

    if (chunk.type === CHUNK_TYPE_GAMA) {
      if (!gammaInserted) {
        outputChunks.push(gammaChunk);
        gammaInserted = true;
      }
      // Skip original gAMA chunk
      continue;
    }

    outputChunks.push(chunk.raw);
  }

  if (!gammaInserted) {
    outputChunks.push(gammaChunk);
  }

  return Buffer.concat(outputChunks);
}

async function readGamma(path) {
  try {
    const buffer = await fs.readFile(path);
    return extractGamma(buffer);
  } catch (err) {
    return null;
  }
}

async function ensureGamma(path, gammaValue) {
  if (gammaValue === null || gammaValue === undefined) return;
  const buffer = await fs.readFile(path);
  const updated = insertOrReplaceGamma(buffer, gammaValue);
  if (updated) {
    await fs.writeFile(path, updated);
  }
}

module.exports = {
  readGamma,
  ensureGamma,
  extractGamma,
  insertOrReplaceGamma
};
