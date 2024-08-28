import sys
import json
import time
import asyncio
import pyaudio
import logging
import argparse
import pyonmttok
import websockets
import numpy as np
import ctranslate2
from datetime import datetime
from faster_whisper import WhisperModel
from Utils_bis import *

#info = TranscriptionInfo(
#            language=language,
#            language_probability=language_probability,
#            duration=duration,
#            duration_after_vad=duration_after_vad,
#            transcription_options=options,
#            vad_options=vad_parameters,
#            all_language_probs=all_language_probs,
#        )

#class Segment(NamedTuple):
#    id: int
#    seek: int
#    start: float
#    end: float
#    text: str
#    tokens: List[int]
#    temperature: float
#    avg_logprob: float
#    compression_ratio: float
#    no_speech_prob: float
#    words: Optional[List[Word]]

#class Word(NamedTuple):
#    start: float
#    end: float
#    word: str
#    probability: float

debut_transcription = 0
fin_transcription = 0

def parse_transcription(segments, info):
    audio_duration = info.duration #int(len(audio)*samples_per_second)
    ### flatten the words list
    words = [w for s in segments for w in s.words]
    ### current transcription is finished by:
    # the last word ended by any of the suffixes and at a minimum distance of the last word
    # the last word succeeded by a long silence
    # audio is larger than duration 
    ### if not, audio is consumed when:
    # there are no words and audio is larger than silence
    transcription =[]
    ending_id = -1 #transcription is composed of words up to ending_id
    ending = 0 #consume up to ending floats
    eos = False #found an EndOfSentence
    for i in range(len(words)):
        transcription.append(words[i].word)
        curr_end = words[i].end
        next_start = words[i+1].start if i+1 < len(words) else audio_duration
        if next_start-curr_end > silence:
            ending_id = i
            #ending = int((0.75*(next_start-curr_end)+curr_end) * samples_per_second)
            ending = int(0.9 * (next_start) * samples_per_second)
            eos = True
            logging.debug('eos found by silence at ending_id={} ending={:.2f} sec'.format(ending_id, ending))
        if i < len(words)-distance and any(words[i].word.endswith(suffix) for suffix in suffixes):
            ending_id = i
            #ending = int((0.75*(next_start-curr_end)+curr_end) * samples_per_second)
            ending = int(0.9 * (next_start) * samples_per_second)
            eos = True
            logging.debug('eos found by suffix at ending_id={} ending={:.2f} sec'.format(ending_id, ending))

    if ending_id == -1 and len(words) and audio_duration > duration: 
        logging.debug('eos forced by audio duration={} sec (transcription with words)'.format(audio_duration))
        curr_end = words[-1].end
        next_start = audio_duration
        ending_id = len(words) - 1
        #ending = int((0.75*(next_start-curr_end)+curr_end) * samples_per_second)
        ending = int(0.9 * (next_start) * samples_per_second)
        eos = True

    logging.debug('transcription (complete) of {:.2f} sec = {}'.format(audio_duration, ''.join(transcription).strip()))

    ### found an EndOfSentence
    if ending_id >= 0:
        return ''.join(transcription[:ending_id+1]).strip(), eos, ending


    ### no words transcribed... audio_duration sufficiently large (>= silence)
    if len(words) == 0 and audio_duration >= silence:
        logging.debug('silent audio (consumes audio)')
        ending = int(0.75*audio_duration*samples_per_second)
        return '', eos, ending

    ### return all words, end of sentence not found and do not consume current audio
    return ''.join(transcription).strip(), eos, ending 

def transcribe(data_float32, lang_src, beam_size=5, history=None, task='transcribe'):
    language = None if lang_src == 'pr' else lang_src
    segments, info = Transcriber.transcribe(data_float32, language=language, task=task, beam_size=beam_size, vad_filter=True, word_timestamps=True, initial_prompt=history)
    transcription, eos, ending = parse_transcription(segments, info)
    lang_src = info.language if len(transcription) else lang_src 
    logging.info('SERVER: transcription lang_src = {}, eos = {} ending = {}, transcription = {}'.format(info.language, eos, ending, transcription))
    return transcription, eos, ending, lang_src

def translate(transcription, lang_tgt):
    if lang_tgt == '' or transcription == '':
        return ''
    translation = ''
    input_stream = "｟" + lang_tgt + "｠" + " " + transcription
    results = Translator.translate_batch([Tokenizer(input_stream)])
    translation = Tokenizer.detokenize(results[0].hypotheses[0])
    logging.info('SERVER: translation = {}'.format(translation))
    return translation

def request_data(request_json):
    request = json.loads(request_json)
    timestamp = request.get('timestamp', 0)
    chunk = request.get('audioData', '') #in base64 format as transformed by the client
    chunkId = request.get('chunkId', -1)
    lang_src = request.get('lang_src', 'pr')
    lang_tgt = request.get('lang_tgt', '')
    logging.debug('SERVER: received chunkId={} lang_src={} lang_tgt={}'.format(chunkId, lang_src, lang_tgt))
    return timestamp, chunk, chunkId, lang_src, lang_tgt

async def handle_connection(websocket, path):
    global fin_transcription
    global debut_transcription
    p = pyaudio.PyAudio()
    audio = np.empty([1], dtype=np.float32)
    logging.info('on rentre dans handle connection')
    try:
        while True:
            request_json = await websocket.recv()
            timestamp, chunk, chunkId, lang_src, lang_tgt = request_data(request_json)
            ### delay message ###
            time_request_delay = time.time() - timestamp/1000 #seconds
            ### format and compose audio ###
            tic = time.time()
            audio = np.concatenate((audio, base64_to_float32(chunk, samples_per_second=samples_per_second)))
            audio_duration = len(audio)/samples_per_second
            time_formatting = time.time() - tic
            ### transcribe ###
            tic = time.time()
            transcription, eos, ending, lang_src = transcribe(audio, lang_src)
            time_transcribe = time.time() - tic
            ### translate ###
            tic = time.time()
            translation = translate(transcription, lang_tgt) if eos else ''
            time_translate = time.time() - tic
            
            #logging.debug('SERVER: send={}'.format(response_dict))
            ### update audio if found EndOfSentence
            time_save = 0
            if ending:
                if save is not None:
                    ### save audio ###
                    tic = time.time()
                    float32_to_mp3(audio, save, '{}_{}.mp3'.format(curr_time, chunkId))
                    time_save = time.time() - tic
                    
                ### On récupère l'audio à retourner ###
                audio_response = audio
                
                ### reduce audio ###
                audio = audio[ending:]
            logging.info('SERVER: messg delay={:.2f}, audio format={:.2f}, audio duration={:.2f}, transcription={:.2f}, tanslation={:.2f}, save={:.2f} (seconds)'.format(
                time_request_delay, 
                time_formatting, 
                audio_duration, 
                time_transcribe, 
                time_translate, 
                time_save))
                
            ### Création de la réponse au client JS ###
            ### On ajoute l'audio à retourner ###
        
            if ending:
                fin_transcription = fin_transcription + (ending/samples_per_second)
            
            response_dict = {'transcription': transcription, 'translation': translation, 'eos': eos, 'lang_src': lang_src, 'debut': debut_transcription, 'fin': fin_transcription}
            debut_transcription = fin_transcription
            
            await websocket.send(json.dumps(response_dict))
            await asyncio.sleep(args.delay)

    except websockets.ConnectionClosed:
        logging.info("connection terminated")
    finally:
        p.terminate()


if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='COMMUTE DEMO Server.', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    asr_model = parser.add_argument_group("ASR model")
    asr_model.add_argument('--model_size', type=str, help='Model size (tiny.en, tiny, base.en, base, small.en, small, medium.en, medium, large-v1, large-v2)', default='tiny')
    asr_model.add_argument('--compute_type', type=str, help='Compute type', default='int8')
    nmt_model = parser.add_argument_group("NMT model")
    nmt_model.add_argument('--ct2_dir', type=str, help='ct2 checkpoint dir', default='./model/checkpoint-50000.pt.ct2')
    nmt_model.add_argument('--bpe_file', type=str, help='BPE file', default='./model/bpe-ar-en-fr-50k')
    eos_opts = parser.add_argument_group("EndOfSentence prediction")
    eos_opts.add_argument('--suffixes', type=str, help='String with ending suffixes for a word to be considered as EndOfSentence.', default='.?!,۔؟!،')
    eos_opts.add_argument('--distance', type=int, help='Distance (number of words) to last word in audio to consider a word as EndOfSentence.', default=1)
    eos_opts.add_argument('--silence', type=float, help='Maximum duration of silence (seconds) to predict EndOfSentence.', default=2.0)
    eos_opts.add_argument('--duration', type=float, help='When this duration (seconds) is exceeded EndOfSentence is forced.', default=10.0)
    other = parser.add_argument_group("Other options")
    other.add_argument('--save', type=str, help='Directory where to save audio files with segmented sentences.', default=None)
    other.add_argument('--delay', type=float, help='Delay between requests.', default=0.05)
    other.add_argument('--port', type=int, help='Port used in local server', default=8765)
    other.add_argument('--device', type=str, help='Device: cpu, cuda, auto', default='auto')
    other.add_argument('--log', type=str, help='Logging level: TRACE, DEBUG, INFO, WARN, ERROR, FATAL', default='INFO')
    other.add_argument('--logf', type=str, help='Logging file', default=None)
    args = parser.parse_args()

    #curr_time = datetime.utcnow().isoformat(sep='_', timespec='milliseconds')
    curr_time = datetime.now().strftime("%Y-%m-%d_%H:%M:%S")
    logging.basicConfig(format='[%(asctime)s.%(msecs)03d] %(levelname)s %(message)s', 
        datefmt='%Y-%m-%d_%H:%M:%S', 
        level=getattr(logging, args.log, None), 
        filename=args.logf)

    ### Global vars
    Transcriber = WhisperModel(model_size_or_path=args.model_size, device=args.device, compute_type=args.compute_type)
    Translator = ctranslate2.Translator(args.ct2_dir, device=args.device)
    Tokenizer = pyonmttok.Tokenizer("aggressive", joiner_annotate=True, preserve_placeholders=True, bpe_model_path=args.bpe_file)
    samples_per_second = 16000 #sample rate to use when converting audio files to float32 list for Whisper processing
    suffixes = [letter for letter in args.suffixes]
    delay = args.delay
    distance = args.distance
    silence = args.silence
    duration = args.duration
    save = args.save

    ### run Server
    start_server = websockets.serve(handle_connection, "localhost", 8765)
    asyncio.get_event_loop().run_until_complete(start_server)
    asyncio.get_event_loop().run_forever()



