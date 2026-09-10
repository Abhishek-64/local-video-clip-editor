/**
 * Pure JavaScript ISOBMFF MP4 Muxer
 * Fast, self-contained, zero-dependency MP4 container generator for WebCodecs H.264 & AAC.
 */

class ByteBuffer {
  constructor(initialCapacity = 1024 * 1024 * 4) {
    this.buffer = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buffer.buffer);
    this.offset = 0;
  }

  ensureCapacity(additionalBytes) {
    if (this.offset + additionalBytes > this.buffer.byteLength) {
      let newCapacity = Math.max(this.buffer.byteLength * 2, this.offset + additionalBytes + 1024 * 1024);
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this.buffer.subarray(0, this.offset));
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  writeUint8(val) {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, val);
    this.offset += 1;
  }

  writeUint16(val) {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, val, false);
    this.offset += 2;
  }

  writeUint24(val) {
    this.ensureCapacity(3);
    this.view.setUint8(this.offset, (val >> 16) & 0xff);
    this.view.setUint8(this.offset + 1, (val >> 8) & 0xff);
    this.view.setUint8(this.offset + 2, val & 0xff);
    this.offset += 3;
  }

  writeUint32(val) {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, val, false);
    this.offset += 4;
  }

  writeUint64(val) {
    this.ensureCapacity(8);
    const bigVal = BigInt(val);
    this.view.setBigUint64(this.offset, bigVal, false);
    this.offset += 8;
  }

  writeInt16(val) {
    this.ensureCapacity(2);
    this.view.setInt16(this.offset, val, false);
    this.offset += 2;
  }

  writeFourCC(str) {
    this.ensureCapacity(4);
    for (let i = 0; i < 4; i++) {
      this.buffer[this.offset + i] = str.charCodeAt(i) || 0x20;
    }
    this.offset += 4;
  }

  writeBytes(bytes) {
    if (!bytes) return;
    const len = bytes.byteLength || bytes.length;
    this.ensureCapacity(len);
    if (bytes instanceof Uint8Array) {
      this.buffer.set(bytes, this.offset);
    } else {
      this.buffer.set(new Uint8Array(bytes.buffer || bytes), this.offset);
    }
    this.offset += len;
  }

  getUint8Array() {
    return this.buffer.subarray(0, this.offset);
  }
}

function createBox(type, contentsBuilder) {
  const innerBuf = new ByteBuffer(1024 * 64);
  contentsBuilder(innerBuf);
  const innerBytes = innerBuf.getUint8Array();

  const boxBuf = new ByteBuffer(innerBytes.length + 8);
  boxBuf.writeUint32(innerBytes.length + 8);
  boxBuf.writeFourCC(type);
  boxBuf.writeBytes(innerBytes);
  return boxBuf.getUint8Array();
}

function createFullBox(type, version = 0, flags = 0, contentsBuilder) {
  return createBox(type, (buf) => {
    buf.writeUint8(version);
    buf.writeUint24(flags);
    if (contentsBuilder) {
      contentsBuilder(buf);
    }
  });
}

export class MP4Muxer {
  constructor(options = {}) {
    this.width = options.width || 1080;
    this.height = options.height || 1920;
    this.fps = options.fps || 30;
    this.timescale = 90000;
    this.audioTimescale = options.audioSampleRate || 48000;
    this.hasAudio = Boolean(options.hasAudio);

    this.videoChunks = [];
    this.audioChunks = [];
    this.sps = options.sps || null;
    this.pps = options.pps || null;
    this.audioConfig = options.audioConfig || null;
  }

  setVideoDescription(sps, pps) {
    this.sps = sps;
    this.pps = pps;
  }

  setAudioDescription(audioConfig) {
    this.audioConfig = audioConfig;
    this.hasAudio = true;
  }

  addVideoChunk(data, isKeyframe, durationMicroseconds) {
    const rawData = data instanceof Uint8Array ? data : new Uint8Array(data);
    
    // In-band SPS/PPS fallback: extract SPS (type 7) and PPS (type 8) if not already set
    if (!this.sps || !this.pps) {
      try {
        let offset = 0;
        const len = rawData.length;
        while (offset + 4 < len) {
          const naluLen = (rawData[offset] << 24) | (rawData[offset + 1] << 16) | (rawData[offset + 2] << 8) | rawData[offset + 3];
          if (naluLen <= 0 || offset + 4 + naluLen > len) break;
          const naluType = rawData[offset + 4] & 0x1f;
          if (naluType === 7 && !this.sps) {
            this.sps = rawData.slice(offset + 4, offset + 4 + naluLen);
          } else if (naluType === 8 && !this.pps) {
            this.pps = rawData.slice(offset + 4, offset + 4 + naluLen);
          }
          offset += 4 + naluLen;
        }
      } catch (e) {}
    }

    // Default to nominal frame duration if durationMicroseconds is undefined, null, NaN, or 0
    const nominalDurationUs = Math.round((1 / (this.fps || 30)) * 1_000_000);
    const validDurationUs = (typeof durationMicroseconds === 'number' && !isNaN(durationMicroseconds) && durationMicroseconds > 0)
      ? durationMicroseconds
      : nominalDurationUs;
    const durationInTimescale = Math.max(1, Math.round((validDurationUs / 1_000_000) * this.timescale));

    this.videoChunks.push({
      data: rawData,
      isKeyframe,
      duration: durationInTimescale,
      size: rawData.byteLength || rawData.length
    });
  }

  addAudioChunk(data, durationMicroseconds) {
    const rawData = data instanceof Uint8Array ? data : new Uint8Array(data);

    // Standard AAC frame is 1024 PCM samples (ISO/IEC 14496-3)
    const nominalAudioDurationUs = Math.round((1024 / (this.audioTimescale || 48000)) * 1_000_000);
    const validDurationUs = (typeof durationMicroseconds === 'number' && !isNaN(durationMicroseconds) && durationMicroseconds > 0)
      ? durationMicroseconds
      : nominalAudioDurationUs;
    const durationInTimescale = Math.max(1, Math.round((validDurationUs / 1_000_000) * this.audioTimescale));

    this.audioChunks.push({
      data: rawData,
      duration: durationInTimescale,
      size: rawData.byteLength || rawData.length
    });
    this.hasAudio = true;
  }

  finalize() {
    // 1. Calculate durations safely without NaN or zero propagation
    const defaultFrameTicks = Math.max(1, Math.round((1 / (this.fps || 30)) * this.timescale));
    let totalVideoDuration = this.videoChunks.reduce((acc, c) => {
      const dur = (typeof c.duration === 'number' && !isNaN(c.duration) && c.duration > 0) ? c.duration : defaultFrameTicks;
      return acc + dur;
    }, 0);

    if (totalVideoDuration <= 0) {
      totalVideoDuration = Math.max(1, this.videoChunks.length * defaultFrameTicks);
    }

    const defaultAudioTicks = 1024;
    let totalAudioDuration = this.audioChunks.reduce((acc, c) => {
      const dur = (typeof c.duration === 'number' && !isNaN(c.duration) && c.duration > 0) ? c.duration : defaultAudioTicks;
      return acc + dur;
    }, 0);

    if (this.hasAudio && totalAudioDuration <= 0) {
      totalAudioDuration = Math.max(1, this.audioChunks.length * defaultAudioTicks);
    }

    const movieTimescale = 1000;
    const movieDurationInMovieTimescale = Math.max(
      1,
      Math.max(
        Math.round((totalVideoDuration / this.timescale) * movieTimescale),
        this.hasAudio && this.audioChunks.length > 0
          ? Math.round((totalAudioDuration / this.audioTimescale) * movieTimescale)
          : 0
      )
    );

    // 2. Build ftyp box
    const ftyp = createBox('ftyp', (buf) => {
      buf.writeFourCC('isom'); // major brand
      buf.writeUint32(0x00000200); // minor version
      buf.writeFourCC('isom');
      buf.writeFourCC('iso2');
      buf.writeFourCC('mp41');
      buf.writeFourCC('avc1');
    });

    // 3. Time-synchronized chunk interleaving & offset calculation (zero duplicate memory)
    // Group samples into ~1-second chunks (instead of 1 sample per chunk).
    // This reduces MP4 chunk offsets from 46,125 down to ~1,200, eliminates fragmented micro-seeks
    // during browser playback, and prevents playback stuttering/lagging every few seconds.
    const samplesPerVideoChunk = Math.max(1, Math.min(30, Math.round(this.fps || 30)));
    const samplesPerAudioChunk = Math.max(1, Math.round((this.audioTimescale || 48000) / 1024));

    const videoChunkOffsets = [];
    const audioChunkOffsets = [];
    const videoChunkSampleCounts = [];
    const audioChunkSampleCounts = [];
    const interleavedDataChunks = [];

    let vIdx = 0;
    let aIdx = 0;
    let currentVideoTimeSec = 0;
    let currentAudioTimeSec = 0;
    let mdatPayloadSize = 0;

    while (vIdx < this.videoChunks.length || (this.hasAudio && aIdx < this.audioChunks.length)) {
      const hasMoreVideo = vIdx < this.videoChunks.length;
      const hasMoreAudio = this.hasAudio && aIdx < this.audioChunks.length;

      if (hasMoreVideo && (!hasMoreAudio || currentVideoTimeSec <= currentAudioTimeSec)) {
        videoChunkOffsets.push(mdatPayloadSize);
        const count = Math.min(samplesPerVideoChunk, this.videoChunks.length - vIdx);
        videoChunkSampleCounts.push(count);

        for (let i = 0; i < count; i++) {
          const vChunk = this.videoChunks[vIdx];
          interleavedDataChunks.push(vChunk.data);
          mdatPayloadSize += vChunk.size;
          currentVideoTimeSec += vChunk.duration / this.timescale;
          vIdx++;
        }
      } else if (hasMoreAudio) {
        audioChunkOffsets.push(mdatPayloadSize);
        const count = Math.min(samplesPerAudioChunk, this.audioChunks.length - aIdx);
        audioChunkSampleCounts.push(count);

        for (let i = 0; i < count; i++) {
          const aChunk = this.audioChunks[aIdx];
          interleavedDataChunks.push(aChunk.data);
          mdatPayloadSize += aChunk.size;
          currentAudioTimeSec += aChunk.duration / this.audioTimescale;
          aIdx++;
        }
      }
    }

    const isLargeMdat = (mdatPayloadSize + 8) > 0xffffffff;

    const mdatHeader = new ByteBuffer(16);
    if (isLargeMdat) {
      mdatHeader.writeUint32(1); // 1 = 64-bit size follows
      mdatHeader.writeFourCC('mdat');
      mdatHeader.writeUint64(mdatPayloadSize + 16);
    } else {
      mdatHeader.writeUint32(mdatPayloadSize + 8);
      mdatHeader.writeFourCC('mdat');
    }

    const mdatHeaderBytes = mdatHeader.getUint8Array();

    // 4. Build moov box
    // To place moov before mdat (Fast Start), calculate moov size and adjust chunk offsets
    const buildMoovWithBaseOffset = (baseOffset) => {
      return createBox('moov', (moovBuf) => {
        // mvhd (Movie Header)
        moovBuf.writeBytes(
          createFullBox('mvhd', 0, 0, (buf) => {
            buf.writeUint32(0); // creation_time
            buf.writeUint32(0); // modification_time
            buf.writeUint32(movieTimescale); // timescale
            buf.writeUint32(movieDurationInMovieTimescale); // duration
            buf.writeUint32(0x00010000); // rate 1.0
            buf.writeUint16(0x0100); // volume 1.0
            buf.writeUint16(0); // reserved
            buf.writeUint32(0);
            buf.writeUint32(0);
            // Unity matrix
            buf.writeUint32(0x00010000); buf.writeUint32(0); buf.writeUint32(0);
            buf.writeUint32(0); buf.writeUint32(0x00010000); buf.writeUint32(0);
            buf.writeUint32(0); buf.writeUint32(0); buf.writeUint32(0x40000000);
            // Pre-defined
            for (let i = 0; i < 6; i++) buf.writeUint32(0);
            buf.writeUint32(this.hasAudio ? 3 : 2); // next_track_ID
          })
        );

        // Track 1: Video Track (trak)
        moovBuf.writeBytes(
          createBox('trak', (trakBuf) => {
            // tkhd
            trakBuf.writeBytes(
              createFullBox('tkhd', 0, 0x000007, (buf) => {
                buf.writeUint32(0); // creation_time
                buf.writeUint32(0); // modification_time
                buf.writeUint32(1); // track_ID = 1
                buf.writeUint32(0); // reserved
                buf.writeUint32(Math.round((totalVideoDuration / this.timescale) * movieTimescale)); // duration
                buf.writeUint32(0);
                buf.writeUint32(0);
                buf.writeUint16(0); // layer
                buf.writeUint16(0); // alternate_group
                buf.writeUint16(0); // volume = 0 for video
                buf.writeUint16(0); // reserved
                // Unity matrix
                buf.writeUint32(0x00010000); buf.writeUint32(0); buf.writeUint32(0);
                buf.writeUint32(0); buf.writeUint32(0x00010000); buf.writeUint32(0);
                buf.writeUint32(0); buf.writeUint32(0); buf.writeUint32(0x40000000);
                buf.writeUint32(this.width << 16); // width (fixed point 16.16)
                buf.writeUint32(this.height << 16); // height (fixed point 16.16)
              })
            );

            // mdia
            trakBuf.writeBytes(
              createBox('mdia', (mdiaBuf) => {
                // mdhd
                mdiaBuf.writeBytes(
                  createFullBox('mdhd', 0, 0, (buf) => {
                    buf.writeUint32(0);
                    buf.writeUint32(0);
                    buf.writeUint32(this.timescale);
                    buf.writeUint32(totalVideoDuration);
                    buf.writeUint16(0x55c4); // language = und
                    buf.writeUint16(0);
                  })
                );

                // hdlr
                mdiaBuf.writeBytes(
                  createFullBox('hdlr', 0, 0, (buf) => {
                    buf.writeUint32(0);
                    buf.writeFourCC('vide');
                    buf.writeUint32(0);
                    buf.writeUint32(0);
                    buf.writeUint32(0);
                    buf.writeBytes(new TextEncoder().encode('VideoHandler\0'));
                  })
                );

                // minf
                mdiaBuf.writeBytes(
                  createBox('minf', (minfBuf) => {
                    // vmhd
                    minfBuf.writeBytes(createFullBox('vmhd', 0, 1, (buf) => {
                      buf.writeUint16(0);
                      buf.writeUint16(0);
                      buf.writeUint16(0);
                      buf.writeUint16(0);
                    }));

                    // dinf
                    minfBuf.writeBytes(
                      createBox('dinf', (dinfBuf) => {
                        dinfBuf.writeBytes(
                          createFullBox('dref', 0, 0, (buf) => {
                            buf.writeUint32(1); // entry count
                            buf.writeBytes(createFullBox('url ', 0, 1, null));
                          })
                        );
                      })
                    );

                    // stbl (Sample Table)
                    minfBuf.writeBytes(
                      createBox('stbl', (stblBuf) => {
                        // stsd
                        stblBuf.writeBytes(
                          createFullBox('stsd', 0, 0, (buf) => {
                            buf.writeUint32(1); // entry_count = 1
                            buf.writeBytes(
                              createBox('avc1', (avc1Buf) => {
                                for (let i = 0; i < 6; i++) avc1Buf.writeUint8(0);
                                avc1Buf.writeUint16(1); // data_reference_index
                                avc1Buf.writeUint16(0); // pre_defined
                                avc1Buf.writeUint16(0); // reserved
                                for (let i = 0; i < 3; i++) avc1Buf.writeUint32(0);
                                avc1Buf.writeUint16(this.width);
                                avc1Buf.writeUint16(this.height);
                                avc1Buf.writeUint32(0x00480000); // 72 dpi
                                avc1Buf.writeUint32(0x00480000); // 72 dpi
                                avc1Buf.writeUint32(0);
                                avc1Buf.writeUint16(1); // frame_count
                                for (let i = 0; i < 32; i++) avc1Buf.writeUint8(0); // compressorname
                                avc1Buf.writeUint16(0x0018); // depth = 24
                                avc1Buf.writeInt16(-1); // pre_defined = -1

                                // avcC Box
                                const spsBytes = this.sps || new Uint8Array([0x67, 0x42, 0x00, 0x1f, 0xe9, 0x01, 0x40, 0x7b, 0x20]);
                                const ppsBytes = this.pps || new Uint8Array([0x68, 0xce, 0x06, 0xe2]);

                                avc1Buf.writeBytes(
                                  createBox('avcC', (avccBuf) => {
                                    avccBuf.writeUint8(1); // configurationVersion
                                    avccBuf.writeUint8(spsBytes[1] || 0x42); // profile
                                    avccBuf.writeUint8(spsBytes[2] || 0x00); // profile_compat
                                    avccBuf.writeUint8(spsBytes[3] || 0x1f); // level
                                    avccBuf.writeUint8(0xff); // 6 bits reserved + 2 bits NAL length size minus one (3 = 4 bytes)
                                    avccBuf.writeUint8(0xe1); // 3 bits reserved + 5 bits numOfSequenceParameterSets (1)
                                    avccBuf.writeUint16(spsBytes.length);
                                    avccBuf.writeBytes(spsBytes);
                                    avccBuf.writeUint8(1); // numOfPictureParameterSets
                                    avccBuf.writeUint16(ppsBytes.length);
                                    avccBuf.writeBytes(ppsBytes);
                                  })
                                );
                              })
                            );
                          })
                        );

                        // stts (Time to Sample)
                        stblBuf.writeBytes(
                          createFullBox('stts', 0, 0, (buf) => {
                            // Group consecutive identical durations
                            const runs = [];
                            this.videoChunks.forEach((c) => {
                              if (runs.length > 0 && runs[runs.length - 1].duration === c.duration) {
                                runs[runs.length - 1].count++;
                              } else {
                                runs.push({ count: 1, duration: c.duration });
                              }
                            });

                            buf.writeUint32(runs.length);
                            runs.forEach((r) => {
                              buf.writeUint32(r.count);
                              buf.writeUint32(r.duration);
                            });
                          })
                        );

                        // stss (Sync Samples / Keyframes)
                        stblBuf.writeBytes(
                          createFullBox('stss', 0, 0, (buf) => {
                            const keyframes = [];
                            this.videoChunks.forEach((c, idx) => {
                              if (c.isKeyframe || idx === 0) {
                                keyframes.push(idx + 1); // 1-indexed
                              }
                            });
                            buf.writeUint32(keyframes.length);
                            keyframes.forEach((kf) => buf.writeUint32(kf));
                          })
                        );

                        // stsc (Video Sample to Chunk)
                        stblBuf.writeBytes(
                          createFullBox('stsc', 0, 0, (buf) => {
                            const stscEntries = [];
                            let lastSamplesPerChunk = -1;
                            for (let c = 0; c < videoChunkSampleCounts.length; c++) {
                              const spc = videoChunkSampleCounts[c];
                              if (spc !== lastSamplesPerChunk) {
                                stscEntries.push({
                                  firstChunk: c + 1,
                                  samplesPerChunk: spc,
                                  sampleDescriptionIndex: 1
                                });
                                lastSamplesPerChunk = spc;
                              }
                            }

                            buf.writeUint32(stscEntries.length);
                            stscEntries.forEach((entry) => {
                              buf.writeUint32(entry.firstChunk);
                              buf.writeUint32(entry.samplesPerChunk);
                              buf.writeUint32(entry.sampleDescriptionIndex);
                            });
                          })
                        );

                        // stsz (Sample Sizes)
                        stblBuf.writeBytes(
                          createFullBox('stsz', 0, 0, (buf) => {
                            buf.writeUint32(0); // sample_size (0 = variable)
                            buf.writeUint32(this.videoChunks.length);
                            this.videoChunks.forEach((c) => buf.writeUint32(c.size));
                          })
                        );

                        // stco / co64 (Chunk Offsets)
                        const maxVideoOffset = videoChunkOffsets.length > 0
                          ? baseOffset + videoChunkOffsets[videoChunkOffsets.length - 1]
                          : baseOffset;
                        const useCo64Video = isLargeMdat || maxVideoOffset > 0xffffffff;

                        if (useCo64Video) {
                          stblBuf.writeBytes(
                            createFullBox('co64', 0, 0, (buf) => {
                              buf.writeUint32(videoChunkOffsets.length);
                              videoChunkOffsets.forEach((offset) => {
                                buf.writeUint64(baseOffset + offset);
                              });
                            })
                          );
                        } else {
                          stblBuf.writeBytes(
                            createFullBox('stco', 0, 0, (buf) => {
                              buf.writeUint32(videoChunkOffsets.length);
                              videoChunkOffsets.forEach((offset) => {
                                buf.writeUint32(baseOffset + offset);
                              });
                            })
                          );
                        }
                      })
                    );
                  })
                );
              })
            );
          })
        );

        // Track 2: Audio Track (trak) if audio present
        if (this.hasAudio && this.audioChunks.length > 0) {
          moovBuf.writeBytes(
            createBox('trak', (trakBuf) => {
              // tkhd (Audio)
              trakBuf.writeBytes(
                createFullBox('tkhd', 0, 0x000007, (buf) => {
                  buf.writeUint32(0);
                  buf.writeUint32(0);
                  buf.writeUint32(2); // track_ID = 2
                  buf.writeUint32(0);
                  buf.writeUint32(Math.round((totalAudioDuration / this.audioTimescale) * movieTimescale));
                  buf.writeUint32(0);
                  buf.writeUint32(0);
                  buf.writeUint16(0);
                  buf.writeUint16(0);
                  buf.writeUint16(0x0100); // volume 1.0
                  buf.writeUint16(0);
                  buf.writeUint32(0x00010000); buf.writeUint32(0); buf.writeUint32(0);
                  buf.writeUint32(0); buf.writeUint32(0x00010000); buf.writeUint32(0);
                  buf.writeUint32(0); buf.writeUint32(0); buf.writeUint32(0x40000000);
                  buf.writeUint32(0); // width = 0
                  buf.writeUint32(0); // height = 0
                })
              );

              // mdia (Audio)
              trakBuf.writeBytes(
                createBox('mdia', (mdiaBuf) => {
                  mdiaBuf.writeBytes(
                    createFullBox('mdhd', 0, 0, (buf) => {
                      buf.writeUint32(0);
                      buf.writeUint32(0);
                      buf.writeUint32(this.audioTimescale);
                      buf.writeUint32(totalAudioDuration);
                      buf.writeUint16(0x55c4);
                      buf.writeUint16(0);
                    })
                  );

                  mdiaBuf.writeBytes(
                    createFullBox('hdlr', 0, 0, (buf) => {
                      buf.writeUint32(0);
                      buf.writeFourCC('soun');
                      buf.writeUint32(0);
                      buf.writeUint32(0);
                      buf.writeUint32(0);
                      buf.writeBytes(new TextEncoder().encode('SoundHandler\0'));
                    })
                  );

                  mdiaBuf.writeBytes(
                    createBox('minf', (minfBuf) => {
                      // smhd
                      minfBuf.writeBytes(createFullBox('smhd', 0, 0, (buf) => {
                        buf.writeUint16(0); // balance
                        buf.writeUint16(0); // reserved
                      }));

                      // dinf
                      minfBuf.writeBytes(
                        createBox('dinf', (dinfBuf) => {
                          dinfBuf.writeBytes(
                            createFullBox('dref', 0, 0, (buf) => {
                              buf.writeUint32(1);
                              buf.writeBytes(createFullBox('url ', 0, 1, null));
                            })
                          );
                        })
                      );

                      // stbl (Audio)
                      minfBuf.writeBytes(
                        createBox('stbl', (stblBuf) => {
                          // stsd
                          stblBuf.writeBytes(
                            createFullBox('stsd', 0, 0, (buf) => {
                              buf.writeUint32(1);
                              buf.writeBytes(
                                createBox('mp4a', (mp4aBuf) => {
                                  for (let i = 0; i < 6; i++) mp4aBuf.writeUint8(0);
                                  mp4aBuf.writeUint16(1); // data_reference_index
                                  for (let i = 0; i < 2; i++) mp4aBuf.writeUint32(0);
                                  mp4aBuf.writeUint16(2); // channelCount = 2
                                  mp4aBuf.writeUint16(16); // sampleSize = 16
                                  mp4aBuf.writeUint16(0); // pre_defined
                                  mp4aBuf.writeUint16(0); // reserved
                                  mp4aBuf.writeUint32(this.audioTimescale << 16); // sampleRate (16.16)

                                  // esds Box for AAC Elementary Stream Descriptor
                                  const audioSpecConfig = this.audioConfig || new Uint8Array([0x11, 0x90]); // 48kHz Stereo AAC-LC

                                  mp4aBuf.writeBytes(
                                    createFullBox('esds', 0, 0, (esdsBuf) => {
                                      // ES_Descriptor tag 0x03
                                      esdsBuf.writeUint8(0x03);
                                      esdsBuf.writeUint8(23 + audioSpecConfig.length);
                                      esdsBuf.writeUint16(1); // ES_ID
                                      esdsBuf.writeUint8(0); // flags

                                      // DecoderConfigDescriptor tag 0x04
                                      esdsBuf.writeUint8(0x04);
                                      esdsBuf.writeUint8(15 + audioSpecConfig.length);
                                      esdsBuf.writeUint8(0x40); // objectTypeIndication: Audio ISO/IEC 14496-3 (AAC)
                                      esdsBuf.writeUint8(0x15); // streamType: AudioStream (5 << 2 | 1)
                                      esdsBuf.writeUint24(0); // bufferSizeDB
                                      esdsBuf.writeUint32(192000); // maxBitrate
                                      esdsBuf.writeUint32(192000); // avgBitrate

                                      // DecSpecificInfo tag 0x05
                                      esdsBuf.writeUint8(0x05);
                                      esdsBuf.writeUint8(audioSpecConfig.length);
                                      esdsBuf.writeBytes(audioSpecConfig);

                                      // SLConfigDescriptor tag 0x06
                                      esdsBuf.writeUint8(0x06);
                                      esdsBuf.writeUint8(1);
                                      esdsBuf.writeUint8(0x02); // predefined = 2
                                    })
                                  );
                                })
                              );
                            })
                          );

                          // stts (Audio)
                          stblBuf.writeBytes(
                            createFullBox('stts', 0, 0, (buf) => {
                              const runs = [];
                              this.audioChunks.forEach((c) => {
                                if (runs.length > 0 && runs[runs.length - 1].duration === c.duration) {
                                  runs[runs.length - 1].count++;
                                } else {
                                  runs.push({ count: 1, duration: c.duration });
                                }
                              });
                              buf.writeUint32(runs.length);
                              runs.forEach((r) => {
                                buf.writeUint32(r.count);
                                buf.writeUint32(r.duration);
                              });
                            })
                          );

                          // stsc (Audio Sample to Chunk)
                          stblBuf.writeBytes(
                            createFullBox('stsc', 0, 0, (buf) => {
                              const stscEntries = [];
                              let lastSamplesPerChunk = -1;
                              for (let c = 0; c < audioChunkSampleCounts.length; c++) {
                                const spc = audioChunkSampleCounts[c];
                                if (spc !== lastSamplesPerChunk) {
                                  stscEntries.push({
                                    firstChunk: c + 1,
                                    samplesPerChunk: spc,
                                    sampleDescriptionIndex: 1
                                  });
                                  lastSamplesPerChunk = spc;
                                }
                              }

                              buf.writeUint32(stscEntries.length);
                              stscEntries.forEach((entry) => {
                                buf.writeUint32(entry.firstChunk);
                                buf.writeUint32(entry.samplesPerChunk);
                                buf.writeUint32(entry.sampleDescriptionIndex);
                              });
                            })
                          );

                          // stsz (Audio)
                          stblBuf.writeBytes(
                            createFullBox('stsz', 0, 0, (buf) => {
                              buf.writeUint32(0);
                              buf.writeUint32(this.audioChunks.length);
                              this.audioChunks.forEach((c) => buf.writeUint32(c.size));
                            })
                          );

                          // stco / co64 (Audio Chunk Offsets)
                          const maxAudioOffset = audioChunkOffsets.length > 0
                            ? baseOffset + audioChunkOffsets[audioChunkOffsets.length - 1]
                            : baseOffset;
                          const useCo64Audio = isLargeMdat || maxAudioOffset > 0xffffffff;

                          if (useCo64Audio) {
                            stblBuf.writeBytes(
                              createFullBox('co64', 0, 0, (buf) => {
                                buf.writeUint32(audioChunkOffsets.length);
                                audioChunkOffsets.forEach((offset) => {
                                  buf.writeUint64(baseOffset + offset);
                                });
                              })
                            );
                          } else {
                            stblBuf.writeBytes(
                              createFullBox('stco', 0, 0, (buf) => {
                                buf.writeUint32(audioChunkOffsets.length);
                                audioChunkOffsets.forEach((offset) => {
                                  buf.writeUint32(baseOffset + offset);
                                });
                              })
                            );
                          }
                        })
                      );
                    })
                  );
                })
              );
            })
          );
        }
      });
    };

    // Calculate exact moov size by dry running at dummy offset
    const dummyMoov = buildMoovWithBaseOffset(0);
    const moovSize = dummyMoov.length;
    const finalMdatStartOffset = ftyp.length + moovSize + mdatHeaderBytes.length;

    // Generate final moov with accurate offsets
    const finalMoov = buildMoovWithBaseOffset(finalMdatStartOffset);

    // Build final Blob without spread operator to eliminate V8 call stack overhead
    const blobParts = [ftyp, finalMoov, mdatHeaderBytes];
    for (let i = 0; i < interleavedDataChunks.length; i++) {
      blobParts.push(interleavedDataChunks[i]);
    }
    const finalBlob = new Blob(blobParts, {
      type: 'video/mp4'
    });

    // Store counts for diagnostic telemetry before clearing buffers
    const totalVideoFrames = this.videoChunks.length;
    const totalAudioFrames = this.audioChunks.length;

    // Release internal chunk buffers immediately to free hundreds of MBs of memory
    this.videoChunks = [];
    this.audioChunks = [];

    // Development-only diagnostic log (isolated behind development flag, no production console spam)
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production' || (typeof window !== 'undefined' && (window.__ENABLE_MP4_DEBUG__ || window.location?.hostname === 'localhost'))) {
      const durationSec = totalVideoDuration / this.timescale;
      const actualBitrate = durationSec > 0 ? Math.round((finalBlob.size * 8) / durationSec) : 0;
      console.log('[MP4Muxer Container Diagnostic]', {
        duration: `${durationSec.toFixed(3)}s`,
        fps: this.fps,
        frameCount: totalVideoFrames,
        bitrate: `${(actualBitrate / 1_000_000).toFixed(2)} Mbps`,
        width: this.width,
        height: this.height,
        fileSize: `${(finalBlob.size / (1024 * 1024)).toFixed(2)} MB`,
        videoCodec: this.sps ? `H.264 (SPS ${this.sps.length}B, PPS ${this.pps?.length || 0}B)` : 'H.264 Baseline',
        audioCodec: this.hasAudio ? `AAC (${totalAudioFrames} frames)` : 'none'
      });
    }

    return finalBlob;
  }
}

