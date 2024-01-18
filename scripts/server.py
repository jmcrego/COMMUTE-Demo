import sys
import ctranslate2
from faster_whisper import WhisperModel
import pyonmttok
import time
import logging
logging.basicConfig(format='[%(asctime)s.%(msecs)03d] %(levelname)s %(message)s', datefmt='%Y-%m-%d_%H:%M:%S', level=getattr(logging, 'INFO', None), filename=None)

device = 'cpu' #cpu or cuda
model_size = 'small'
Transcriber = WhisperModel(model_size_or_path=model_size, device=device, compute_type='int8')
ct2 = '/Users/crego/Desktop/COMMUTE-Demo/scripts/model/checkpoint-50000.pt.ct2'
Translator = ctranslate2.Translator(ct2, device=device)
bpe = '/Users/crego/Desktop/COMMUTE-Demo/scripts/model/bpe-ar-en-fr-50k'
Tokenizer = pyonmttok.Tokenizer("aggressive", joiner_annotate=True, preserve_placeholders=True, bpe_model_path=bpe)

import asyncio
import websockets
import base64
import pyaudio
from pydub import AudioSegment
import io
import json
import av
import itertools
import numpy as np
import gc

ending_suffixes = ['.', '?', '!']
delay_sec = 0.1  # Adjust this value based on your requirements
distance_to_end = 1
samples_per_second = 16000 #sample rate in resampler (number of float32 elements per second)

def transcribe(data_float32, lang_src, beam_size=5, history=None, task='transcribe'):
    #bytes_data = io.BytesIO(wav_data) #in-memory binary stream => block of bytes
    language = None if lang_src == 'pr' else lang_src
    segments, info = Transcriber.transcribe(data_float32, language=language, task=task, beam_size=beam_size, vad_filter=True, word_timestamps=True, initial_prompt=history)
    lang_src = info.language ### output by model
    ending_word_id = -1
    transcription = []
    ### flatten the words list
    words = []
    for segment in segments:
        for word in segment.words:
            words.append(word)
    ### build result
    for i,word in enumerate(words):
        transcription.append(word.word)
        logging.info("word\t{}\t{}\t{}".format(word.start,word.end,word.word))
        if i < len(words)-distance_to_end and any(word.word.endswith(suffix) for suffix in ending_suffixes):
            ending_word_id = i
            logging.info('eos found at {:.2f} => {}'.format(word.end, int(word.end*samples_per_second)))

    if ending_word == -1: ### return all words
        ending = 0
        transcription = ''.join(transcription).strip()
    else: ### return words up to ending_word
        ending = int(words[ending_word].end*samples_per_second)
        transcription = ''.join(transcription[:ending_word+1]).strip()

    logging.info('lang_src = {}, ending = {}, transcription = {}'.format(lang_src, ending, transcription))
    return transcription, ending, lang_src

def translate(transcription, lang_tgt):
    if lang_tgt == '' or transcription == '':
        return ''
    translation = ''
    input_stream = "｟" + lang_tgt + "｠" + " " + transcription
    results = Translator.translate_batch([Tokenizer(input_stream)])
    translation = Tokenizer.detokenize(results[0].hypotheses[0])
    logging.info('translation = {}'.format(translation))
    return translation

def base64_to_float32(audio_chunk_base64):
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

async def handle_connection(websocket, path):
    p = pyaudio.PyAudio()
    #prefix_wav = b""
    prefix = np.empty([1], dtype=np.float32)

    try:
        while True:
            request_json = await websocket.recv()
            curr_time = time.strftime("%Y-%m-%d_%H:%M:%S")
            request = json.loads(request_json)
            chunk = request.get('audioData', '') #in base64 format as transformed by the client
            chunkId = request.get('chunkId', '')
            lang_src = request.get('lang_src', '')
            lang_tgt = request.get('lang_tgt', '')
            logging.info('SERVER: Received chunkId={} lang_src={} lang_tgt={}'.format(chunkId, lang_src, lang_tgt))
            ### compose new audio with prefix
            prefix = np.concatenate((prefix, base64_to_float32(chunk)))
            ### transcript and translate
            transcription, ending, lang_src = transcribe(prefix, lang_src)
            translation = translate(transcription, lang_tgt)
            response_dict = {'transcription': transcription, 'translation': translation, 'eos': ending>0, 'lang_src': lang_src}
            logging.info('SERVER: Send={}'.format(response_dict))
            ### update prefix if found end of sentence
            if ending:
                prefix = prefix[ending:]

            await websocket.send(json.dumps(response_dict))
            await asyncio.sleep(delay_sec)

    except websockets.ConnectionClosed:
        print("Connection closed.")
    finally:
        p.terminate()

start_server = websockets.serve(handle_connection, "localhost", 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()



