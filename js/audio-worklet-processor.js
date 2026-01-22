/**
 * Audio Worklet Processor for PCM16 conversion
 * Used by the Real-time Voice API to stream audio in the correct format
 */

class PCM16Processor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2400; // 100ms at 24kHz
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];

            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];

                // When buffer is full, convert and send
                if (this.bufferIndex >= this.bufferSize) {
                    this.sendBuffer();
                }
            }
        }
        return true;
    }

    sendBuffer() {
        // Convert float32 to int16 PCM
        const int16Data = new Int16Array(this.bufferIndex);
        for (let i = 0; i < this.bufferIndex; i++) {
            const s = Math.max(-1, Math.min(1, this.buffer[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send to main thread
        this.port.postMessage({
            type: 'audio',
            data: int16Data.buffer
        }, [int16Data.buffer]);

        // Reset buffer
        this.bufferIndex = 0;
    }
}

registerProcessor('pcm16-processor', PCM16Processor);
