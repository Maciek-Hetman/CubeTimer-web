// Audio worklet that forwards input samples to the main thread in small batches, where the
// wired timer decoder runs. Plain JS with no imports so it can be loaded as-is.

const BATCH_SIZE = 1024

class WiredTimerCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.batch = new Float32Array(BATCH_SIZE)
    this.length = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.batch[this.length++] = channel[i]
        if (this.length === BATCH_SIZE) {
          this.port.postMessage(this.batch, [this.batch.buffer])
          this.batch = new Float32Array(BATCH_SIZE)
          this.length = 0
        }
      }
    }
    return true
  }
}

registerProcessor('wired-timer-capture', WiredTimerCapture)
