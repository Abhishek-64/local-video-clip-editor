/**
 * Pure JavaScript Streaming ISOBMFF MP4 Demuxer
 * Lightweight, zero-dependency MP4/MOV box parser and sample extractor.
 * Reads moov/trak/stbl sample tables and streams NAL units on demand without
 * loading the entire video payload into RAM.
 */

export class MP4Demuxer {
  /**
   * @param {File|Blob|ArrayBuffer|string} source
   */
  constructor(source) {
    this.source = source;
    this.fileBlob = null;
    this.fileSize = 0;

    this.videoTrack = null;
    this.samples = [];
    this.keyframeSampleIndices = [];
    this.timescale = 1000;
    this.durationUs = 0;
    this.isInitialized = false;
  }

  /**
   * Initialize demuxer: locate moov box and parse video sample tables
   */
  async initialize() {
    if (this.isInitialized) return this;

    // Normalize source to Blob
    if (this.source instanceof Blob || (typeof File !== 'undefined' && this.source instanceof File)) {
      this.fileBlob = this.source;
      this.fileSize = this.source.size;
    } else if (this.source instanceof ArrayBuffer) {
      this.fileBlob = new Blob([this.source]);
      this.fileSize = this.source.byteLength;
    } else if (typeof this.source === 'string') {
      const resp = await fetch(this.source);
      this.fileBlob = await resp.blob();
      this.fileSize = this.fileBlob.size;
    } else if (this.source?.file instanceof Blob) {
      this.fileBlob = this.source.file;
      this.fileSize = this.fileBlob.size;
    } else {
      throw new Error('Unsupported video source format for MP4 demuxer');
    }

    if (this.fileSize < 16) {
      throw new Error('Source file is too small to be a valid MP4');
    }

    // 1. Locate moov box (either at start or end of file)
    const moovBox = await this.findAndReadMoovBox();
    if (!moovBox) {
      throw new Error('Could not find moov box in MP4 container');
    }

    // 2. Parse moov box contents
    this.parseMoov(moovBox.dataView, moovBox.startOffset);

    if (!this.videoTrack) {
      throw new Error('No valid video track found in MP4 file');
    }

    // 3. Build fast sample lookup index
    this.buildSampleTable();

    this.isInitialized = true;
    return this;
  }

  /**
   * Reads a slice of the source file as an ArrayBuffer
   */
  async readSlice(offset, length) {
    const end = Math.min(this.fileSize, offset + length);
    const slice = this.fileBlob.slice(offset, end);
    return await slice.arrayBuffer();
  }

  /**
   * Scans top-level boxes to locate and read the moov box
   */
  async findAndReadMoovBox() {
    let offset = 0;
    const maxScanSize = Math.min(this.fileSize, 1024 * 1024 * 32); // Scan first 32MB

    // Read initial header chunk
    const headerBuf = await this.readSlice(0, Math.min(maxScanSize, 1024 * 64));
    let view = new DataView(headerBuf);

    while (offset < this.fileSize - 8) {
      // Need fresh view if offset exceeds current buffer
      if (offset + 16 > view.byteLength) {
        const nextChunk = await this.readSlice(offset, 1024 * 64);
        if (nextChunk.byteLength < 8) break;
        view = new DataView(nextChunk);
        // Reset relative offset within this slice
        return await this.scanBoxesGlobally();
      }

      const boxSize32 = view.getUint32(offset);
      const boxType = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
      );

      let boxSize = boxSize32;
      let headerLen = 8;

      if (boxSize32 === 1) {
        // 64-bit size
        const high = view.getUint32(offset + 8);
        const low = view.getUint32(offset + 12);
        boxSize = high * 0x100000000 + low;
        headerLen = 16;
      } else if (boxSize32 === 0) {
        // Box extends to end of file
        boxSize = this.fileSize - offset;
      }

      if (boxType === 'moov') {
        const moovBuf = await this.readSlice(offset + headerLen, boxSize - headerLen);
        return {
          dataView: new DataView(moovBuf),
          startOffset: offset + headerLen,
          size: boxSize
        };
      }

      if (boxSize <= 0) break;
      offset += boxSize;
    }

    return await this.scanBoxesGlobally();
  }

  /**
   * Global box scanner for moov at end of file (common in camera MP4s)
   */
  async scanBoxesGlobally() {
    let offset = 0;
    while (offset < this.fileSize - 8) {
      const headerBuf = await this.readSlice(offset, 16);
      if (headerBuf.byteLength < 8) break;
      const view = new DataView(headerBuf);

      const boxSize32 = view.getUint32(0);
      const boxType = String.fromCharCode(
        view.getUint8(4),
        view.getUint8(5),
        view.getUint8(6),
        view.getUint8(7)
      );

      let boxSize = boxSize32;
      let headerLen = 8;

      if (boxSize32 === 1) {
        const high = view.getUint32(8);
        const low = view.getUint32(12);
        boxSize = high * 0x100000000 + low;
        headerLen = 16;
      } else if (boxSize32 === 0) {
        boxSize = this.fileSize - offset;
      }

      if (boxType === 'moov') {
        const moovBuf = await this.readSlice(offset + headerLen, boxSize - headerLen);
        return {
          dataView: new DataView(moovBuf),
          startOffset: offset + headerLen,
          size: boxSize
        };
      }

      if (boxSize <= 0) break;
      offset += boxSize;
    }

    return null;
  }

  /**
   * Parse moov box hierarchy to extract video trak details
   */
  parseMoov(view, baseFileOffset) {
    const boxes = this.parseBoxList(view, 0, view.byteLength);

    for (const box of boxes) {
      if (box.type === 'trak') {
        const trakTrack = this.parseTrak(view, box.start, box.end);
        if (trakTrack && trakTrack.isVideo) {
          this.videoTrack = trakTrack;
          break;
        }
      }
    }
  }

  /**
   * Helper to parse sequential boxes within a byte range
   */
  parseBoxList(view, start, end) {
    const boxes = [];
    let pos = start;

    while (pos + 8 <= end) {
      const size32 = view.getUint32(pos);
      const type = String.fromCharCode(
        view.getUint8(pos + 4),
        view.getUint8(pos + 5),
        view.getUint8(pos + 6),
        view.getUint8(pos + 7)
      );

      let size = size32;
      let headerLen = 8;

      if (size32 === 1 && pos + 16 <= end) {
        const high = view.getUint32(pos + 8);
        const low = view.getUint32(pos + 12);
        size = high * 0x100000000 + low;
        headerLen = 16;
      } else if (size32 === 0) {
        size = end - pos;
      }

      if (size < headerLen) break;

      boxes.push({
        type,
        start: pos + headerLen,
        end: pos + size,
        totalSize: size
      });

      pos += size;
    }

    return boxes;
  }

  /**
   * Parse a single trak box
   */
  parseTrak(view, start, end) {
    const trakBoxes = this.parseBoxList(view, start, end);
    const mdiaBox = trakBoxes.find((b) => b.type === 'mdia');
    if (!mdiaBox) return null;

    const mdiaBoxes = this.parseBoxList(view, mdiaBox.start, mdiaBox.end);
    const hdlrBox = mdiaBoxes.find((b) => b.type === 'hdlr');
    if (!hdlrBox) return null;

    // Check handler type at offset 8 (hdlr version/flags 4 bytes, pre-defined 4 bytes, handler 4 bytes)
    const handlerType = String.fromCharCode(
      view.getUint8(hdlrBox.start + 8),
      view.getUint8(hdlrBox.start + 9),
      view.getUint8(hdlrBox.start + 10),
      view.getUint8(hdlrBox.start + 11)
    );

    if (handlerType !== 'vide') {
      return { isVideo: false };
    }

    // Parse mdhd (Media Header) for timescale & duration
    let trackTimescale = 1000;
    let trackDuration = 0;
    const mdhdBox = mdiaBoxes.find((b) => b.type === 'mdhd');
    if (mdhdBox) {
      const version = view.getUint8(mdhdBox.start);
      if (version === 1) {
        trackTimescale = view.getUint32(mdhdBox.start + 20);
        const high = view.getUint32(mdhdBox.start + 24);
        const low = view.getUint32(mdhdBox.start + 28);
        trackDuration = high * 0x100000000 + low;
      } else {
        trackTimescale = view.getUint32(mdhdBox.start + 12);
        trackDuration = view.getUint32(mdhdBox.start + 16);
      }
    }

    // Parse minf -> stbl
    const minfBox = mdiaBoxes.find((b) => b.type === 'minf');
    if (!minfBox) return null;

    const minfBoxes = this.parseBoxList(view, minfBox.start, minfBox.end);
    const stblBox = minfBoxes.find((b) => b.type === 'stbl');
    if (!stblBox) return null;

    const stblBoxes = this.parseBoxList(view, stblBox.start, stblBox.end);

    // 1. stsd (Sample Description)
    const stsdBox = stblBoxes.find((b) => b.type === 'stsd');
    let codec = 'avc1.42E01E';
    let description = null;
    let codedWidth = 1920;
    let codedHeight = 1080;

    if (stsdBox) {
      const sampleDesc = this.parseStsd(view, stsdBox.start, stsdBox.end);
      if (sampleDesc) {
        codec = sampleDesc.codec;
        description = sampleDesc.description;
        codedWidth = sampleDesc.width || 1920;
        codedHeight = sampleDesc.height || 1080;
      }
    }

    // 2. stts (Time-to-Sample)
    const sttsBox = stblBoxes.find((b) => b.type === 'stts');
    const timeToSample = sttsBox ? this.parseStts(view, sttsBox.start) : [];

    // 3. ctts (Composition Time Offset)
    const cttsBox = stblBoxes.find((b) => b.type === 'ctts');
    const compTimeToSample = cttsBox ? this.parseCtts(view, cttsBox.start) : [];

    // 4. stss (Sync Sample / Keyframes)
    const stssBox = stblBoxes.find((b) => b.type === 'stss');
    const syncSamples = stssBox ? this.parseStss(view, stssBox.start) : null;

    // 5. stsc (Sample to Chunk)
    const stscBox = stblBoxes.find((b) => b.type === 'stsc');
    const sampleToChunk = stscBox ? this.parseStsc(view, stscBox.start) : [];

    // 6. stsz (Sample Sizes)
    const stszBox = stblBoxes.find((b) => b.type === 'stsz');
    const sampleSizes = stszBox ? this.parseStsz(view, stszBox.start) : [];

    // 7. stco / co64 (Chunk Offsets)
    const stcoBox = stblBoxes.find((b) => b.type === 'stco');
    const co64Box = stblBoxes.find((b) => b.type === 'co64');
    let chunkOffsets = [];
    if (stcoBox) {
      chunkOffsets = this.parseStco(view, stcoBox.start);
    } else if (co64Box) {
      chunkOffsets = this.parseCo64(view, co64Box.start);
    }

    return {
      isVideo: true,
      timescale: trackTimescale,
      duration: trackDuration,
      codec,
      description,
      codedWidth,
      codedHeight,
      timeToSample,
      compTimeToSample,
      syncSamples,
      sampleToChunk,
      sampleSizes,
      chunkOffsets
    };
  }

  /**
   * Parse stsd box (H.264 / AVC details)
   */
  parseStsd(view, start, end) {
    // skip version (1) + flags (3) + count (4) = 8 bytes
    const entriesStart = start + 8;
    const entries = this.parseBoxList(view, entriesStart, end);

    for (const entry of entries) {
      if (entry.type === 'avc1' || entry.type === 'avc3') {
        // avc1 visual sample entry:
        // skip 6 reserved, 2 data_ref_index, 16 pre-defined, width (2), height (2) = offset 24
        const width = view.getUint16(entry.start + 24);
        const height = view.getUint16(entry.start + 26);

        // Child boxes of avc1 start at offset 78
        const childBoxes = this.parseBoxList(view, entry.start + 78, entry.end);
        const avccBox = childBoxes.find((b) => b.type === 'avcC');

        let codec = 'avc1.42E01E';
        let description = null;

        if (avccBox) {
          // Parse avcC configuration record
          const configVer = view.getUint8(avccBox.start);
          const profile = view.getUint8(avccBox.start + 1);
          const compat = view.getUint8(avccBox.start + 2);
          const level = view.getUint8(avccBox.start + 3);

          const hexProfile = profile.toString(16).padStart(2, '0').toUpperCase();
          const hexCompat = compat.toString(16).padStart(2, '0').toUpperCase();
          const hexLevel = level.toString(16).padStart(2, '0').toUpperCase();
          codec = `avc1.${hexProfile}${hexCompat}${hexLevel}`;

          // Extract full avcC payload as ArrayBuffer for VideoDecoder description
          const descLen = avccBox.end - avccBox.start;
          const descBuf = new Uint8Array(descLen);
          for (let i = 0; i < descLen; i++) {
            descBuf[i] = view.getUint8(avccBox.start + i);
          }
          description = descBuf;
        }

        return { codec, description, width, height };
      }
    }

    return null;
  }

  parseStts(view, start) {
    const entryCount = view.getUint32(start + 4);
    const entries = [];
    let pos = start + 8;
    for (let i = 0; i < entryCount; i++) {
      const count = view.getUint32(pos);
      const delta = view.getUint32(pos + 4);
      entries.push({ count, delta });
      pos += 8;
    }
    return entries;
  }

  parseCtts(view, start) {
    const entryCount = view.getUint32(start + 4);
    const entries = [];
    let pos = start + 8;
    for (let i = 0; i < entryCount; i++) {
      const count = view.getUint32(pos);
      const offset = view.getInt32(pos + 4);
      entries.push({ count, offset });
      pos += 8;
    }
    return entries;
  }

  parseStss(view, start) {
    const entryCount = view.getUint32(start + 4);
    const syncSamples = new Set();
    let pos = start + 8;
    for (let i = 0; i < entryCount; i++) {
      syncSamples.add(view.getUint32(pos)); // 1-indexed
      pos += 4;
    }
    return syncSamples;
  }

  parseStsc(view, start) {
    const entryCount = view.getUint32(start + 4);
    const entries = [];
    let pos = start + 8;
    for (let i = 0; i < entryCount; i++) {
      const firstChunk = view.getUint32(pos);
      const samplesPerChunk = view.getUint32(pos + 4);
      const sampleDescIndex = view.getUint32(pos + 8);
      entries.push({ firstChunk, samplesPerChunk, sampleDescIndex });
      pos += 12;
    }
    return entries;
  }

  parseStsz(view, start) {
    const uniformSize = view.getUint32(start + 4);
    const sampleCount = view.getUint32(start + 8);

    if (uniformSize > 0) {
      return { uniformSize, sampleCount, sizes: null };
    }

    const sizes = new Uint32Array(sampleCount);
    let pos = start + 12;
    for (let i = 0; i < sampleCount; i++) {
      sizes[i] = view.getUint32(pos);
      pos += 4;
    }

    return { uniformSize: 0, sampleCount, sizes };
  }

  parseStco(view, start) {
    const entryCount = view.getUint32(start + 4);
    const offsets = new Float64Array(entryCount);
    let pos = start + 8;
    for (let i = 0; i < entryCount; i++) {
      offsets[i] = view.getUint32(pos);
      pos += 4;
    }
    return offsets;
  }

  parseCo64(view, start) {
    const entryCount = view.getUint32(start + 4);
    const offsets = new Float64Array(entryCount);
    let pos = start + 8;
    for (let i = 0; i < entryCount; i++) {
      const high = view.getUint32(pos);
      const low = view.getUint32(pos + 4);
      offsets[i] = high * 0x100000000 + low;
      pos += 8;
    }
    return offsets;
  }

  /**
   * Build indexed lookup table of every sample in the video track
   */
  buildSampleTable() {
    const track = this.videoTrack;
    this.timescale = track.timescale || 1000;
    const totalSampleCount = track.sampleSizes.sampleCount;

    // 1. Expand sample-to-chunk map to determine chunk offset for each sample
    const sampleChunkIndex = new Uint32Array(totalSampleCount);
    let currentSampleIdx = 0;
    const stsc = track.sampleToChunk;
    const chunkOffsets = track.chunkOffsets;

    for (let i = 0; i < stsc.length; i++) {
      const chunkStart = stsc[i].firstChunk - 1; // 0-indexed
      const chunkEnd = i + 1 < stsc.length ? stsc[i + 1].firstChunk - 1 : chunkOffsets.length;
      const samplesInChunk = stsc[i].samplesPerChunk;

      for (let c = chunkStart; c < chunkEnd; c++) {
        for (let s = 0; s < samplesInChunk; s++) {
          if (currentSampleIdx < totalSampleCount) {
            sampleChunkIndex[currentSampleIdx] = c;
            currentSampleIdx++;
          }
        }
      }
    }

    // 2. Expand stts (decode timestamps)
    const sampleDts = new Float64Array(totalSampleCount);
    const sampleDur = new Uint32Array(totalSampleCount);
    let dtsAcc = 0;
    let sIdx = 0;

    for (const entry of track.timeToSample) {
      for (let j = 0; j < entry.count; j++) {
        if (sIdx < totalSampleCount) {
          sampleDts[sIdx] = dtsAcc;
          sampleDur[sIdx] = entry.delta;
          dtsAcc += entry.delta;
          sIdx++;
        }
      }
    }

    // 3. Expand ctts (composition time offsets for B-frames)
    const samplePts = new Float64Array(totalSampleCount);
    sIdx = 0;
    if (track.compTimeToSample && track.compTimeToSample.length > 0) {
      for (const entry of track.compTimeToSample) {
        for (let j = 0; j < entry.count; j++) {
          if (sIdx < totalSampleCount) {
            samplePts[sIdx] = sampleDts[sIdx] + entry.offset;
            sIdx++;
          }
        }
      }
    } else {
      samplePts.set(sampleDts);
    }

    // 4. Calculate exact file offset of each sample
    this.samples = new Array(totalSampleCount);
    this.keyframeSampleIndices = [];
    let currentChunk = -1;
    let currentChunkByteOffset = 0;

    for (let i = 0; i < totalSampleCount; i++) {
      const chunkIdx = sampleChunkIndex[i];
      if (chunkIdx !== currentChunk) {
        currentChunk = chunkIdx;
        currentChunkByteOffset = chunkOffsets[chunkIdx] || 0;
      }

      const size = track.sampleSizes.uniformSize || track.sampleSizes.sizes[i];
      const offset = currentChunkByteOffset;
      currentChunkByteOffset += size;

      // Check keyframe status (stss is 1-indexed; if stss is null, all frames are keyframes)
      const isKeyframe = track.syncSamples ? track.syncSamples.has(i + 1) : true;
      if (isKeyframe) {
        this.keyframeSampleIndices.push(i);
      }

      const dtsUs = Math.round((sampleDts[i] / this.timescale) * 1_000_000);
      const ptsUs = Math.round((samplePts[i] / this.timescale) * 1_000_000);
      const durationUs = Math.round((sampleDur[i] / this.timescale) * 1_000_000);

      this.samples[i] = {
        index: i,
        offset,
        size,
        dtsUs,
        ptsUs,
        durationUs,
        isKeyframe
      };
    }

    this.durationUs = Math.round((track.duration / this.timescale) * 1_000_000);
  }

  /**
   * Get parsed track description suitable for WebCodecs VideoDecoder
   */
  getVideoTrackInfo() {
    if (!this.videoTrack) return null;
    return {
      codec: this.videoTrack.codec,
      description: this.videoTrack.description,
      codedWidth: this.videoTrack.codedWidth,
      codedHeight: this.videoTrack.codedHeight,
      timescale: this.timescale,
      durationUs: this.durationUs,
      sampleCount: this.samples.length
    };
  }

  /**
   * Read raw byte chunk of a specific sample on-demand from disk/blob
   */
  async readSampleChunk(sampleIndex) {
    if (sampleIndex < 0 || sampleIndex >= this.samples.length) {
      return null;
    }
    const s = this.samples[sampleIndex];
    const buf = await this.readSlice(s.offset, s.size);
    return new Uint8Array(buf);
  }

  /**
   * Find nearest preceding keyframe sample index at or before target timestamp (microseconds)
   */
  findKeyframeBefore(targetTimeUs) {
    if (this.keyframeSampleIndices.length === 0) return 0;

    let low = 0;
    let high = this.keyframeSampleIndices.length - 1;
    let bestKeyIdx = this.keyframeSampleIndices[0];

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const sampleIdx = this.keyframeSampleIndices[mid];
      const sample = this.samples[sampleIdx];

      if (sample.ptsUs <= targetTimeUs) {
        bestKeyIdx = sampleIdx;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return bestKeyIdx;
  }

  /**
   * Find sample index matching or immediately preceding target timestamp
   */
  findSampleAtTime(targetTimeUs) {
    if (this.samples.length === 0) return 0;
    let low = 0;
    let high = this.samples.length - 1;
    let bestIdx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const sample = this.samples[mid];

      if (sample.ptsUs <= targetTimeUs) {
        bestIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return bestIdx;
  }
}
