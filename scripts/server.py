import sys
import time
from datetime import datetime
import logging
import pyonmttok
import ctranslate2
from faster_whisper import WhisperModel
# (from more to less verbose) TRACE, DEBUG, INFO, WARN, ERROR, FATAL
logging.basicConfig(format='[%(asctime)s.%(msecs)03d] %(levelname)s %(message)s', datefmt='%Y-%m-%d_%H:%M:%S', level=getattr(logging, 'INFO', None), filename='log.demo')
curr_time = datetime.utcnow().isoformat(sep='_', timespec='milliseconds') #time.strftime("%Y-%m-%d_%H:%M:%S")

device = 'cpu' #cpu or cuda
model_size = 'base' #tiny, base, small, medium
Transcriber = WhisperModel(model_size_or_path=model_size, device=device, compute_type='int8')
ct2 = '/Users/crego/Desktop/COMMUTE-Demo/scripts/model/checkpoint-50000.pt.ct2'
Translator = ctranslate2.Translator(ct2, device=device)
bpe = '/Users/crego/Desktop/COMMUTE-Demo/scripts/model/bpe-ar-en-fr-50k'
Tokenizer = pyonmttok.Tokenizer("aggressive", joiner_annotate=True, preserve_placeholders=True, bpe_model_path=bpe)

ending_suffixes = ['.', '?', '!', '؟']
delay_sec = 0.05  # Adjust this value based on your requirements
distance_to_end = 1
samples_per_second = 16000 #sample rate in resampler (number of float32 elements per second)
silence_eos_sec = 0.5 #silence duration at the end of audio to consider end of sentence
save_file = True
import json
import asyncio
import pyaudio
import websockets
import numpy as np
from Utils import *

def parse_transcription(segments, duration_sec):
    ### flatten the words list
    words = [w for s in segments for w in s.words]
#    words = []
#    for segment in segments:
#        for word in segment.words:
#            words.append(word)
    ending_word_id = -1
    transcription = []
    for i,word in enumerate(words):
        transcription.append(word.word)
        logging.debug("word\t{}\t{}\t{}".format(word.start,word.end,word.word))
        if i < len(words)-distance_to_end and any(word.word.endswith(suffix) for suffix in ending_suffixes):
            ending_word_id = i
            logging.debug('eos found at {:.2f} => {}'.format(word.end, int(word.end*samples_per_second)))

    if len(words) and words[-1].end < duration_sec - silence_eos_sec:
        ending_word_id = len(words) - 1 ### last word

    if ending_word_id == -1: ### return all words
        ending = 0
        transcription = ''.join(transcription).strip()
    else: ### return words up to ending_word_id
        ending = int(words[ending_word_id].end*samples_per_second)
        transcription = ''.join(transcription[:ending_word_id+1]).strip()
    return transcription, ending

def transcribe(data_float32, lang_src, beam_size=5, history=None, task='transcribe'):
    language = None if lang_src == 'pr' else lang_src
    duration = len(data_float32)/samples_per_second
    segments, info = Transcriber.transcribe(data_float32, language=language, task=task, beam_size=beam_size, vad_filter=True, word_timestamps=True, initial_prompt=history)
    transcription, ending = parse_transcription(segments, duration)
    logging.info('SERVER: transcription lang_src = {}, ending = {}, transcription = {}'.format(info.language, ending, transcription))
    return duration, transcription, ending, info.language

def translate(transcription, lang_tgt):
    if lang_tgt == '' or transcription == '':
        return ''
    translation = ''
    input_stream = "｟" + lang_tgt + "｠" + " " + transcription
    results = Translator.translate_batch([Tokenizer(input_stream)])
    translation = Tokenizer.detokenize(results[0].hypotheses[0])
    logging.info('SERVER translation = {}'.format(translation))
    return translation

def request_data(request_json):
    request = json.loads(request_json)
    timestamp = request.get('timestamp', 0)
    chunk = request.get('audioData', '') #in base64 format as transformed by the client
    chunkId = request.get('chunkId', -1)
    lang_src = request.get('lang_src', 'pr')
    lang_tgt = request.get('lang_tgt', '')
    logging.info('SERVER: Received chunkId={} lang_src={} lang_tgt={}'.format(chunkId, lang_src, lang_tgt))
    return timestamp, chunk, chunkId, lang_src, lang_tgt

async def handle_connection(websocket, path):
    p = pyaudio.PyAudio()
    audio = np.empty([1], dtype=np.float32)

    try:
        while True:
            request_json = await websocket.recv()
            timestamp, chunk, chunkId, lang_src, lang_tgt = request_data(request_json)
            ### delay message ###
            time_request_delay = time.time() - timestamp/1000 #seconds
            ### format and compose audio ###
            tic = time.time()
            audio = np.concatenate((audio, base64_to_float32(chunk, samples_per_second=samples_per_second)))
            time_formatting = time.time() - tic
            ### transcribe ###
            tic = time.time()
            duration, transcription, ending, lang_src = transcribe(audio, lang_src)
            time_transcribe = time.time() - tic
            ### translate ###
            tic = time.time()
            translation = translate(transcription, lang_tgt)
            time_translate = time.time() - tic
            ### response ###
            response_dict = {'transcription': transcription, 'translation': translation, 'eos': ending>0, 'lang_src': lang_src}
            logging.info('SERVER: Send={}'.format(response_dict))
            ### update audio if found end of sentence
            time_save = 0
            if ending:
                if save_file:
                    ### save audio ###
                    tic = time.time()
                    float32_to_mp3(audio, '/Users/crego/Desktop/audio_{}_{}.mp3'.format(curr_time, chunkId))
                    time_save = time.time() - tic
                ### reduce audio ###
                audio = audio[ending:]
            logging.info('SERVER: messg delay={:.2f}, audio format={:.2f}, audio duration={:.2f}, transcription={:.2f}, tanslation={:.2f}, save={:.2f} (seconds)'.format(time_request_delay, time_formatting, duration, time_transcribe, time_translate, time_save))
            await websocket.send(json.dumps(response_dict))
            await asyncio.sleep(delay_sec)

    except websockets.ConnectionClosed:
        print("Connection closed.")
    finally:
        p.terminate()

start_server = websockets.serve(handle_connection, "localhost", 8765)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()



