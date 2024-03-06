<p align="right"> <img src="pics/SYSTRAN.png" height="75"/> &nbsp; &nbsp; <img src="pics/LIUM.png" height="75"/> </p>

# COMMUTE-Demo

## Download and Install

* Clone this repository:
```
git clone https://github.com/jmcrego/COMMUTE-Demo.git
```
* Dependencies in requirements.txt are needed to run the server.
```
pip install -r requirements.txt
```
* Download NMT model and bpe codes (model.tgz)
* Uncompress the .tgz file:
```
tar xvzf tar xcvzf model.tgz
ls model/
599K bpe-ar-en-fr-50k
160B checkpoint-50000.pt.ct2
```

## Instructions

### Server

To run the model (linux or macos) use:

```bash
python scripts/server.py --ct2_dir model/checkpoint-50000.pt.ct2 --bpe_file model/bpe-ar-en-fr-50k
```
The corresponding Whisper model (by default tiny) will be automatically downloaded from huggingface repositories

### Client

Open index.html using any web browser (preferably Chrome):
* Use the start/stop button to start/stop to client that :
  - Listens to the microphone.
  - Sends audio buckets to the server and receives corresponding transcription/translations.
