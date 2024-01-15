import sys
import logging
import pyonmttok
import ctranslate2
from faster_whisper import WhisperModel
#import magic
import numpy as np
from pydub import AudioSegment
from flask import Flask, request, jsonify
from flask_cors import CORS  # Import the CORS module

#mime = magic.Magic()
logging.basicConfig(format='[%(asctime)s.%(msecs)03d] %(levelname)s %(message)s', datefmt='%Y-%m-%d_%H:%M:%S', level=getattr(logging, 'INFO', None), filename=None)
device = 'cuda' #cpu or cuda
HOST = '0.0.0.0'
PORT = 12345

model_size = 'tiny'
Transcriber = WhisperModel(model_size_or_path=model_size, device=device, compute_type='int8')

ct2 = '/nfs/RESEARCH/crego/projects/COMMUTE-Demo/checkpoints/checkpoint-50000.pt.ct2'
Translator = ctranslate2.Translator(ct2, device=device)

bpe = '/nfs/RESEARCH/crego/projects/COMMUTE-Demo/config/bpe-ar-en-fr-50k'
Tokenizer = pyonmttok.Tokenizer("aggressive", joiner_annotate=True, preserve_placeholders=True, bpe_model_path=bpe)

def describe(audio_blob):
    # Process the audio Blob with pydub
    audio_segment = AudioSegment.from_file(audio_blob)        
    logging.info('Channels: {}'.format(audio_segment.channels))
    logging.info('Frame Rate: {} Hz'.format(audio_segment.frame_rate))
    logging.info('Sample Width: {} bits/sample'.format(audio_segment.sample_width))
    logging.info('Duration: {} sec'.format(len(audio_segment) / 1000.0))

def transcribe(audio_blob, lang_src, beam_size=5, history=None, task='transcribe'):
    describe(audio_blob)
    language = None if lang_src == 'pr' else lang_src
    segments, info = Transcriber.transcribe(audio_blob, language=language, task=task, beam_size=beam_size, vad_filter=True, word_timestamps=True, initial_prompt=history)
    transcription = []
    for segment in segments:
        for word in segment.words:
            transcription.append(word.word)
            logging.info("word\t{}\t{}\t{}".format(word.start,word.end,word.word))
    return ''.join(transcription).strip(), info.language

def translate(transcription, lang_tgt):
    if lang_tgt == '':
        return ''
    translation = ''
    input_stream = "｟" + lang_tgt + "｠" + " " + transcription
    results = Translator.translate_batch([Tokenizer(input_stream)])
    translation = Tokenizer.detokenize(results[0].hypotheses[0])
    return translation

def endingSentence(transcription, length):
    advance_n_chunks = length ### todo
    return advance_n_chunks

def processRequest(input_data):
    audio_blob = request.files['audio']
    lang_src = request.form.get('lang_src')
    lang_tgt = request.form.get('lang_tgt')
    length = request.form.get('length')
    logging.info('lang_src: {}, lang_tgt: {}, length: {}'.format(lang_src, lang_tgt, length))
    transcription, lang_src = transcribe(audio_blob, lang_src)
    logging.info('transcription = {}'.format([lang_src, transcription]))
    translation = translate(transcription, lang_tgt)
    logging.info('translation = {}'.format(translation))
    advance_n_chunks = endingSentence(transcription, length)
    output_data = {
        "lang_src": lang_src,
        "lang_tgt": lang_tgt,
        "transcription": transcription,
        "translation": translation,
        "advance": advance_n_chunks,
        "status": "success",
        "message": "Request processed successfully"
    }
    return output_data

app = Flask(__name__)
CORS(app, supports_credentials=True)  # Enable CORS for all routes
@app.route('/pipeline_asr_mt', methods=['POST'])
def pipeline_asr_mt():
    #input_data = request.get_json()
    #logging.info('Server: request')
    output_data = processRequest(request) #input_data)
    logging.info('Server: response output_data={}'.format(output_data))
    return jsonify(output_data)

if __name__ == '__main__':
    app.run(host=HOST, port=PORT, debug=True)





