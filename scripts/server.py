import sys
import logging
import pyonmttok
import ctranslate2
from faster_whisper import WhisperModel
import wave
from io import BytesIO
from werkzeug.datastructures import FileStorage
import numpy as np
#import soundfile as sf
import magic
from pydub import AudioSegment
from flask import Flask, request, jsonify
from flask_cors import CORS  # Import the CORS module

logging.basicConfig(format='[%(asctime)s.%(msecs)03d] %(levelname)s %(message)s', datefmt='%Y-%m-%d_%H:%M:%S', level=getattr(logging, 'INFO', None), filename=None)
mime = magic.Magic()
ct2 = '/nfs/RESEARCH/crego/projects/COMMUTE-Demo/checkpoints/checkpoint-50000.pt.ct2'
bpe = '/nfs/RESEARCH/crego/projects/COMMUTE-Demo/config/bpe-ar-en-fr-50k'
model_size = 'tiny'
device = 'cpu' #cpu or cuda
Transcriber = WhisperModel(model_size_or_path=model_size, device=device, compute_type='int8')
Translator = ctranslate2.Translator(ct2, device=device)
Tokenizer = pyonmttok.Tokenizer("aggressive", joiner_annotate=True, preserve_placeholders=True, bpe_model_path=bpe)
HOST = '0.0.0.0'
PORT = 12345

'''
def blob2io(audio_blob):
    # Assuming file_storage is a FileStorage object representing the uploaded audio file # Replace this with your actual FileStorage object
    file_storage = FileStorage()
    # Read the bytes from the FileStorage object
    audio_blob = file_storage.read()
    # Convert audio blob to BinaryIO
    audio_binary_io = BytesIO(audio_blob)
    # Use the wave module to get audio properties
    with wave.open(audio_binary_io, 'rb') as wave_file:
        channels = wave_file.getnchannels()
        frame_rate = wave_file.getframerate()
        sample_width = wave_file.getsampwidth()
        frames = wave_file.getnframes()
        duration = frames / float(frame_rate)
    logging.info('Channels: {}'.format(channels));
    logging.info('Frame rate: {} Hz'.format(frame_rate));
    logging.info('Sample width: {} bytes'.format(sample_width));
    logging.info('Frames: {}'.format(frames));
    logging.info('Duration: {}'.format(duration));
    return audio_binary_io
'''

def describe(audio_blob):
    # Process the audio Blob with pydub
    audio_segment = AudioSegment.from_file(audio_blob)        
    # Extract information about the audio file
    channels = audio_segment.channels
    frame_rate = audio_segment.frame_rate
    sample_width = audio_segment.sample_width
    duration_in_seconds = len(audio_segment) / 1000.0
    # Print or use the extracted information
    logging.info('Channels: {}'.format(channels))
    logging.info('Frame Rate: {}'.format(frame_rate))
    logging.info('Sample Width {}'.format(sample_width))
    logging.info('Duration (seconds): {}'.format(duration_in_seconds))

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





