import sys
import ctranslate2
from faster_whisper import WhisperModel
import pyonmttok
import time
import logging
logging.basicConfig(format='[%(asctime)s.%(msecs)03d] %(levelname)s %(message)s', datefmt='%Y-%m-%d_%H:%M:%S', level=getattr(logging, 'INFO', None), filename=None)

device = 'cpu' #cpu or cuda
model_size = 'tiny'
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

ending_suffixes = ['.', '?', '!']
delay_sec = 0.1  # Adjust this value based on your requirements
sample_rate = 44100
bytes_per_sample = 2  # Assuming 16-bit PCM, adjust if different
distance_to_end = 1
save_audio_sentences = False

def transcribe(wav_data, lang_src, beam_size=5, history=None, task='transcribe'):
    #blob_data = blob.Blob(wav_data)#, type='audio/wav')
    language = None if lang_src == 'pr' else lang_src
    segments, info = Transcriber.transcribe(io.BytesIO(wav_data), language=language, task=task, beam_size=beam_size, vad_filter=True, word_timestamps=True, initial_prompt=history)
    ending_time = 0
    eos = False
    transcription = []
    for segment in segments:
        for i,word in enumerate(segment.words):
            transcription.append(word.word)
            logging.info("word\t{}\t{}\t{}".format(word.start,word.end,word.word))
            if i < len(segment.words)-distance_to_end and any(word.word.endswith(suffix) for suffix in ending_suffixes):
                eos = True
                ending_time = word.end
    lang_src = info.language
    transcription = ''.join(transcription).strip()
    logging.info('lang_src = {}, eos = {}, transcription = {} ending_time = {}'.format(lang_src, eos, transcription, ending_time))
    return transcription, eos, lang_src, ending_time*1000

def translate(transcription, lang_tgt):
    if lang_tgt == '' or transcription == '':
        return ''
    translation = ''
    input_stream = "｟" + lang_tgt + "｠" + " " + transcription
    results = Translator.translate_batch([Tokenizer(input_stream)])
    translation = Tokenizer.detokenize(results[0].hypotheses[0])
    logging.info('translation = {}'.format(translation))
    return translation

async def handle_connection(websocket, path):
    p = pyaudio.PyAudio()
    prefix_wav = b""

    try:
        while True:

            request_json = await websocket.recv()
            curr_time = time.strftime("%Y-%m-%d_%H:%M:%S")
            request = json.loads(request_json)
            audio_data_base64 = request.get('audioData', '')
            nChunk = request.get('nChunk', '')
            lang_src = request.get('lang_src', '')
            lang_tgt = request.get('lang_tgt', '')
            logging.info('SERVER: Received nChunk={} lang_src={} lang_tgt={}'.format(nChunk, lang_src, lang_tgt))
            ### compose new audio with prefix
            audio_chunk = base64.b64decode(audio_data_base64)
            prefix_wav += audio_chunk
            ### transcript and translate
            transcription, eos, lang_src, ending_time_ms = transcribe(prefix_wav, lang_src)
            translation = translate(transcription, lang_tgt)
            response_dict = {'transcription': transcription, 'translation': translation, 'eos': eos, 'lang_src': lang_src}
            logging.info('SERVER: Send={}'.format(response_dict))
            ### update prefix save sentence
            if eos:
                desired_bytes = int((ending_time_ms / 1000) * sample_rate * bytes_per_sample)
                if save_audio_sentences:
                    file_path = 'audio_{}_{}.wav'.format(nChunk,curr_time)
                    with open(file_path, 'wb') as file:
                        file.write(prefix_wav[:desired_bytes])
                if desired_bytes >= len(prefix_wav):
                    prefix_wav = b""  # empty prefix audio
                else:
                    prefix_wav = prefix_wav[desired_bytes:]

            await websocket.send(json.dumps(response_dict))
            await asyncio.sleep(delay_sec)

    except websockets.ConnectionClosed:
        print("Connection closed.")
    finally:
        p.terminate()

start_server = websockets.serve(handle_connection, "localhost", 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()



