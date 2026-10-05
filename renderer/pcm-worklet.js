// Streams raw mono PCM blocks from the audio graph to the page (used by local Whisper transcription).
class PCM extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('pcm', PCM);
