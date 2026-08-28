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
    const durationInTimescale = Math.max(1, Math.round((durationMicroseconds / 1_000_000) * this.timescale));
    this.videoChunks.push({
      data: data instanceof Uint8Array ? data : new Uint8Array(data),
      isKeyframe,
      duration: durationInTimescale,
      size: data.byteLength || data.length
    });
  }

  addAudioChunk(data, durationMicroseconds) {
    const durationInTimescale = Math.max(1, Math.round((durationMicroseconds / 1_000_000) * this.audioTimescale));
    this.audioChunks.push({
      data: data instanceof Uint8Array ? data : new Uint8Array(data),
      duration: durationInTimescale,
      size: data.byteLength || data.length
    });
    this.hasAudio = true;
  }

  finalize() {
    // 1. Calculate durations
    let totalVideoDuration = this.videoChunks.reduce((acc, c) => acc + c.duration, 0);
    if (totalVideoDuration === 0) {
      totalVideoDuration = Math.round((this.videoChunks.length / this.fps) * this.timescale);
    }

    let totalAudioDuration = this.audioChunks.reduce((acc, c) => acc + c.duration, 0);
    const movieTimescale = 1000;
    const movieDurationInMovieTimescale = Math.max(
      Math.round((totalVideoDuration / this.timescale) * movieTimescale),
      this.hasAudio && this.audioChunks.length > 0
        ? Math.round((totalAudioDuration / this.audioTimescale) * movieTimescale)
        : 0
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

    // 3. Build mdat payload and gather offsets
    const mdatPayloadBuf = new ByteBuffer(1024 * 1024 * 10);
    const videoChunkOffsets = [];
    const audioChunkOffsets = [];

    // Interleave video and audio chunks for fast streaming
    let vIdx = 0;
    let aIdx = 0;

    while (vIdx < this.videoChunks.length || (this.hasAudio && aIdx < this.audioChunks.length)) {
      if (vIdx < this.videoChunks.length) {
        const vChunk = this.videoChunks[vIdx];
        videoChunkOffsets.push(mdatPayloadBuf.offset);
        mdatPayloadBuf.writeBytes(vChunk.data);
        vIdx++;
      }

      if (this.hasAudio && aIdx < this.audioChunks.length) {
        const aChunk = this.audioChunks[aIdx];
        audioChunkOffsets.push(mdatPayloadBuf.offset);
        mdatPayloadBuf.writeBytes(aChunk.data);
        aIdx++;
      }
    }

    const mdatPayload = mdatPayloadBuf.getUint8Array();
    const isLargeMdat = mdatPayload.length + 8 > 0xffffffff;

    const mdatHeader = new ByteBuffer(16);
    if (isLargeMdat) {
      mdatHeader.writeUint32(1); // 1 = 64-bit size follows
      mdatHeader.writeFourCC('mdat');
      mdatHeader.writeUint64(mdatPayload.length + 16);
    } else {
      mdatHeader.writeUint32(mdatPayload.length + 8);
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

                        // stsc (Sample to Chunk) - 1 sample per chunk
                        stblBuf.writeBytes(
                          createFullBox('stsc', 0, 0, (buf) => {
                            buf.writeUint32(1);
                            buf.writeUint32(1); // first_chunk
                            buf.writeUint32(1); // samples_per_chunk
                            buf.writeUint32(1); // sample_description_index
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

                        // stco (Chunk Offsets)
                        stblBuf.writeBytes(
                          createFullBox('stco', 0, 0, (buf) => {
                            buf.writeUint32(videoChunkOffsets.length);
                            videoChunkOffsets.forEach((offset) => {
                              buf.writeUint32(baseOffset + offset);
                            });
                          })
                        );
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

                          // stsc (Audio)
                          stblBuf.writeBytes(
                            createFullBox('stsc', 0, 0, (buf) => {
                              buf.writeUint32(1);
                              buf.writeUint32(1);
                              buf.writeUint32(1);
                              buf.writeUint32(1);
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

                          // stco (Audio)
                          stblBuf.writeBytes(
                            createFullBox('stco', 0, 0, (buf) => {
                              buf.writeUint32(audioChunkOffsets.length);
                              audioChunkOffsets.forEach((offset) => {
                                buf.writeUint32(baseOffset + offset);
                              });
                            })
                          );
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

    // Combine all boxes into final binary Blob
    return new Blob([ftyp, finalMoov, mdatHeaderBytes, mdatPayload], {
      type: 'video/mp4'
    });
  }
}
