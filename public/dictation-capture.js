class RedlinePcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const pcm = new Int16Array(channels[0].length);
    for (let frame = 0; frame < pcm.length; frame += 1) {
      let mono = 0;
      for (const channel of channels) mono += channel[frame] ?? 0;
      mono = Math.max(-1, Math.min(1, mono / channels.length));
      pcm[frame] = mono < 0 ? mono * 0x8000 : mono * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor("redline-pcm-capture", RedlinePcmCapture);
