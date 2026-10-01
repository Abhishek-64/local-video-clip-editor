/**
 * High-Performance Sequential WebCodecs Video Decoder
 * Encapsulates browser-native VideoDecoder with bounded memory queue, backpressure handling,
 * keyframe-aware seeking, and immediate VideoFrame lifecycle management.
 */

export class ExportVideoDecoder {
  /**
   * @param {Object} options
   * @param {import('./mp4Demuxer').MP4Demuxer} options.demuxer
   * @param {number} [options.maxDecodedFrames=4]
   * @param {AbortSignal} [options.signal]
   */
  constructor({ demuxer, maxDecodedFrames = 4, signal = null }) {
    this.demuxer = demuxer;
    this.maxDecodedFrames = Math.max(2, maxDecodedFrames);
    this.signal = signal;

    this.decoder = null;
    this.decodedQueue = [];
    this.pendingWaiters = [];
    this.decoderError = null;

    this.nextSampleIdx = 0;
    this.isFlushing = false;
    this.isClosed = false;
    this.trackInfo = null;
    this.lastDecodedPtsUs = -1;
  }

  /**
   * Initialize native VideoDecoder and configure it from demuxer track info
   */
  async initialize() {
    if (this.signal?.aborted) {
      throw new Error('Export cancelled by user');
    }

    if (typeof VideoDecoder === 'undefined') {
      throw new Error('WebCodecs VideoDecoder is not supported by this browser');
    }

    await this.demuxer.initialize();
    this.trackInfo = this.demuxer.getVideoTrackInfo();

    if (!this.trackInfo) {
      throw new Error('Failed to retrieve video track info from source');
    }

    const onOutput = (videoFrame) => {
      this.lastDecodedPtsUs = videoFrame.timestamp;
      this.decodedQueue.push(videoFrame);

      // Notify any callers waiting for a frame
      if (this.pendingWaiters.length > 0) {
        const waiter = this.pendingWaiters.shift();
        waiter.resolve();
      }
    };

    const onError = (err) => {
      this.decoderError = err;
      console.error('VideoDecoder runtime error:', err);
      while (this.pendingWaiters.length > 0) {
        const waiter = this.pendingWaiters.shift();
        waiter.reject(err);
      }
    };

    this.decoder = new VideoDecoder({
      output: onOutput,
      error: onError
    });

    const decoderConfig = {
      codec: this.trackInfo.codec,
      codedWidth: this.trackInfo.codedWidth,
      codedHeight: this.trackInfo.codedHeight
    };

    if (this.trackInfo.description) {
      decoderConfig.description = this.trackInfo.description;
    }

    this.decoder.configure(decoderConfig);
    this.nextSampleIdx = 0;
    return this;
  }

  /**
   * Wait until a frame is available in the queue or an error occurs
   */
  async waitForNextFrame() {
    if (this.decodedQueue.length > 0) return;
    if (this.decoderError) throw this.decoderError;
    if (this.signal?.aborted) throw new Error('Export cancelled by user');

    return new Promise((resolve, reject) => {
      this.pendingWaiters.push({ resolve, reject });
    });
  }

  /**
   * Event-driven decoder backpressure: uses native WebCodecs 'dequeue' event
   * with safety fallback timeout, eliminating wasteful timer polling across 18,000 frames.
   */
  async waitForDecodeCapacity(maxQueue = 4) {
    if (!this.decoder || this.decoder.decodeQueueSize <= maxQueue) {
      return;
    }
    return new Promise((resolve) => {
      let resolved = false;
      let timer = null;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        if (this.decoder && typeof this.decoder.removeEventListener === 'function') {
          this.decoder.removeEventListener('dequeue', onDequeue);
        }
        resolve();
      };

      const onDequeue = () => {
        if (!this.decoder || this.decoder.decodeQueueSize <= maxQueue) {
          cleanup();
        }
      };

      if (this.decoder && typeof this.decoder.addEventListener === 'function') {
        this.decoder.addEventListener('dequeue', onDequeue);
      }

      // Safety fallback timeout (40ms) to ensure pipeline progression on browsers without dequeue events
      timer = setTimeout(cleanup, 40);
    });
  }

  /**
   * Feed samples to the decoder until queue has at least 1 frame or EOS
   */
  async pumpDecoder(targetCount = 1) {
    while (
      this.decodedQueue.length < targetCount &&
      this.nextSampleIdx < this.demuxer.samples.length
    ) {
      if (this.signal?.aborted) throw new Error('Export cancelled by user');
      if (this.decoderError) throw this.decoderError;

      // Decoder backpressure check: wait for dequeue event when decoder queue is saturated
      if (this.decoder.decodeQueueSize >= 6) {
        await this.waitForDecodeCapacity(4);
        continue;
      }

      const sample = this.demuxer.samples[this.nextSampleIdx];
      const chunkData = await this.demuxer.readSampleChunk(this.nextSampleIdx);

      if (chunkData) {
        const chunk = new EncodedVideoChunk({
          type: sample.isKeyframe ? 'key' : 'delta',
          timestamp: sample.ptsUs,
          duration: sample.durationUs,
          data: chunkData
        });

        this.decoder.decode(chunk);
      }

      this.nextSampleIdx++;

      // If we have frames already, yield
      if (this.decodedQueue.length >= targetCount) {
        break;
      }
    }
  }

  /**
   * Sequentially decode and return the next decoded VideoFrame.
   * Caller MUST call frame.close() when done rendering.
   * @returns {Promise<VideoFrame|null>}
   */
  async decodeNextFrame() {
    if (this.isClosed) return null;
    if (this.signal?.aborted) throw new Error('Export cancelled by user');
    if (this.decoderError) throw this.decoderError;

    // Pump more samples if queue is low
    if (this.decodedQueue.length < 2) {
      await this.pumpDecoder(this.maxDecodedFrames);
    }

    // If still no frames and samples remaining, wait for decoder output
    while (this.decodedQueue.length === 0 && this.nextSampleIdx < this.demuxer.samples.length) {
      await this.pumpDecoder(1);
      if (this.decodedQueue.length === 0) {
        await this.waitForNextFrame();
      }
    }

    if (this.decodedQueue.length > 0) {
      return this.decodedQueue.shift();
    }

    // Flush any trailing frames at end of stream
    if (!this.isFlushing) {
      this.isFlushing = true;
      try {
        await this.decoder.flush();
      } catch (e) {}
    }

    if (this.decodedQueue.length > 0) {
      return this.decodedQueue.shift();
    }

    return null;
  }

  /**
   * Decode frames sequentially until a frame matching or closest to timestampUs is reached.
   * Discards and immediately closes any intermediate frames before target timestamp.
   *
   * @param {number} timestampUs - Target presentation timestamp in microseconds
   * @returns {Promise<VideoFrame|null>}
   */
  async decodeUntil(timestampUs) {
    if (this.isClosed) return null;
    if (this.signal?.aborted) throw new Error('Export cancelled by user');

    // 1. Check if the target is significantly behind current decoder state (loop/reverse)
    // or significantly ahead (jumping across cut segments in merged exports).
    const backwardSeekMarginUs = 100_000; // 100ms
    const forwardSeekMarginUs = 1_500_000; // 1.5s (avoid decoding >45 frames linearly across cut gaps)
    const needsSeek =
      (this.lastDecodedPtsUs > 0 &&
        (timestampUs < this.lastDecodedPtsUs - backwardSeekMarginUs ||
         timestampUs > this.lastDecodedPtsUs + forwardSeekMarginUs)) ||
      (this.lastDecodedPtsUs < 0 && timestampUs > forwardSeekMarginUs);

    if (needsSeek) {
      // Clear current queue and close all queued frames
      this.clearDecodedQueue();

      // Reset decoder state
      try {
        await this.decoder.reset();
        const decoderConfig = {
          codec: this.trackInfo.codec,
          codedWidth: this.trackInfo.codedWidth,
          codedHeight: this.trackInfo.codedHeight
        };
        if (this.trackInfo.description) {
          decoderConfig.description = this.trackInfo.description;
        }
        this.decoder.configure(decoderConfig);
      } catch (e) {}

      // Seek back to nearest preceding keyframe
      const keyframeIdx = this.demuxer.findKeyframeBefore(timestampUs);
      this.nextSampleIdx = keyframeIdx;
      this.lastDecodedPtsUs = -1;
      this.isFlushing = false;
    }

    // 2. Consume / discard frames until we reach target timestamp
    let candidateFrame = null;

    while (true) {
      if (this.decodedQueue.length > 0) {
        const nextFrame = this.decodedQueue[0];
        // If next frame timestamp is past target time (with small half-frame tolerance),
        // the current candidateFrame is the best match
        if (candidateFrame && nextFrame.timestamp > timestampUs) {
          this.lastDecodedPtsUs = candidateFrame.timestamp;
          return candidateFrame;
        }

        // Shift next frame
        if (candidateFrame) {
          candidateFrame.close(); // Clean previous candidate
        }
        candidateFrame = this.decodedQueue.shift();

        // If candidateFrame is already at or past target, return it
        if (candidateFrame.timestamp >= timestampUs) {
          this.lastDecodedPtsUs = candidateFrame.timestamp;
          return candidateFrame;
        }
      } else {
        // Queue is empty, pump more samples
        if (this.nextSampleIdx < this.demuxer.samples.length) {
          await this.pumpDecoder(this.maxDecodedFrames);
          if (this.decodedQueue.length === 0) {
            await this.waitForNextFrame();
          }
        } else {
          // Reached end of stream
          if (!this.isFlushing) {
            this.isFlushing = true;
            try {
              await this.decoder.flush();
            } catch (e) {}
          }
          if (this.decodedQueue.length === 0) {
            if (candidateFrame) {
              this.lastDecodedPtsUs = candidateFrame.timestamp;
            }
            return candidateFrame;
          }
        }
      }
    }
  }

  /**
   * Release all queued frames
   */
  clearDecodedQueue() {
    while (this.decodedQueue.length > 0) {
      const frame = this.decodedQueue.shift();
      try {
        frame.close();
      } catch (e) {}
    }
    for (const waiter of this.pendingWaiters) {
      try { waiter.resolve(); } catch (_) {}
    }
    this.pendingWaiters = [];
  }

  /**
   * Flush decoder
   */
  async flush() {
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        await this.decoder.flush();
      } catch (e) {}
    }
  }

  /**
   * Close decoder and release all allocated VideoFrames
   */
  close() {
    if (this.isClosed) return;
    this.isClosed = true;

    this.clearDecodedQueue();

    while (this.pendingWaiters.length > 0) {
      const waiter = this.pendingWaiters.shift();
      waiter.resolve();
    }

    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close();
      } catch (e) {}
    }

    this.decoder = null;
  }
}
