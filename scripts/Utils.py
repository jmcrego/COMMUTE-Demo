from pydub import AudioSegment
import numpy as np
import itertools
import base64
import av
import gc
import io

def float32_to_mp3(numpy_array, output_file, sample_width=2, frame_rate=16000):
    # Scale float32 values to the range [-1, 1]
    numpy_array = numpy_array / np.max(np.abs(numpy_array))
    # Convert float32 array to int16 array
    int16_array = (numpy_array * 32767).astype(np.int16)
    # Ensure the length is a multiple of (sample_width * channels)
    aligned_length = len(int16_array) - (len(int16_array) % sample_width)
    # Trim or pad the array to the aligned length
    int16_array = int16_array[:aligned_length]
    # Create AudioSegment from int16 array
    audio_segment = AudioSegment(
        int16_array.tobytes(),
        sample_width=sample_width,
        frame_rate=frame_rate,
        channels=1  # Assuming mono audio
    )
    audio_segment.export(output_file, format="mp3")

def base64_to_float32(audio_chunk_base64, samples_per_second=16000):
    audio_chunk = base64.b64decode(audio_chunk_base64)
    audio_bytes = io.BytesIO(audio_chunk) 
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=samples_per_second)
    raw_buffer = io.BytesIO()
    dtype = None
    with av.open(audio_bytes, mode="r", metadata_errors="ignore") as container:
        frames = container.decode(audio=0)
        frames = _ignore_invalid_frames(frames)
        frames = _group_frames(frames, 500000)
        frames = _resample_frames(frames, resampler)
        for frame in frames:
            array = frame.to_ndarray()
            dtype = array.dtype
            raw_buffer.write(array)
    # It appears that some objects related to the resampler are not freed
    # unless the garbage collector is manually run.
    del resampler
    gc.collect()
    audio = np.frombuffer(raw_buffer.getbuffer(), dtype=dtype)
    # Convert s16 back to f32.
    audio = audio.astype(np.float32) / 32768.0
    return audio

def _ignore_invalid_frames(frames):
    iterator = iter(frames)
    while True:
        try:
            yield next(iterator)
        except StopIteration:
            break
        except av.error.InvalidDataError:
            continue

def _group_frames(frames, num_samples=None):
    fifo = av.audio.fifo.AudioFifo()
    for frame in frames:
        frame.pts = None  # Ignore timestamp check.
        fifo.write(frame)
        if num_samples is not None and fifo.samples >= num_samples:
            yield fifo.read()
    if fifo.samples > 0:
        yield fifo.read()

def _resample_frames(frames, resampler):
    # Add None to flush the resampler.
    for frame in itertools.chain(frames, [None]):
        yield from resampler.resample(frame)
