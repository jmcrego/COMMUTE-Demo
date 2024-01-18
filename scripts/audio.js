/*** object encapsulating the functionality for recording audio using the Web Audio API and the MediaRecorder API in a web browser ***/

class AudioRecorder{

    constructor(){
        this.audioChunks = [];
        this.mediaRecorder = null;
        this.stream = null;
        this.skipFirst = false;
    }

    start(chunk_ms) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
                this.stream = stream;
                this.mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm', channels: 1, audioBitsPerSecond: 16000, audio: true, video: false });
                this.mediaRecorder.ondataavailable = (event) => { 
                    if (event.data.size > 0) { 
                        if (!this.skipFirst) {
                            this.audioChunks.push(event.data); 
                            console.log(`Length audioChunks = ${this.audioChunks.length} `,this.audioChunks[this.audioChunks.length-1]);
                        }
                        this.skipFirst = false;
                    } 
                };
                this.mediaRecorder.start(chunk_ms); // Collect audio every chunk_ms ms
            })
            .catch((error) => console.error('Error accessing microphone:', error));
    }

    stop() {
        if (this.mediaRecorder && this.stream) {
            this.mediaRecorder.stop();
            this.stream.getTracks().forEach(track => track.stop());
            console.log('Stopped AudioRecorder');
        }
    }

    get(firstChunk) {
        if (firstChunk < 0 || firstChunk >= this.audioChunks.length) { 
            console.error('Invalid firstChunk position = ',firstChunk); 
            return null; 
        }
        return this.audioChunks.slice(firstChunk);
    }

}

/*
var audioRecorder = {
    // Properties
    audioChunks: [],
    mediaRecorder: null,
    streamBeingCaptured: null,
    intervalId: 0,
    // Methods
    start: function(chunk_ms) { // start recording
        return new Promise((resolve, reject) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { 
                reject(new Error('mediaDevices API or getUserMedia method is not supported in this browser.'));
            } 
            else { 
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => { 
                        this.streamBeingCaptured = stream; 
                        const mediaRecorderOptions = { mimeType: mimetype, audioBitsPerSecond: 16000, audio: true, video: false };
                        this.mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions); 
                        this.audioChunks = []; 
                        this.mediaRecorder.addEventListener("dataavailable", event => {                             
                            this.audioChunks.push(event.data); 
                            console.log('push audioChunks.length = ',this.audioChunks.length)
                        }); 
                        this.mediaRecorder.start(); 
                        this.intervalId = setInterval(() => this.mediaRecorder.requestData(), chunk_ms); 
                        resolve();
                    })
                    .catch(error => reject(error));
            }
        });
    },
    stop: function() { // stop recording - cleans audio chunks
        if (this.mediaRecorder) {
            this.mediaRecorder.stop(); 
            this.mediaRecorder = null;
        }
        if (this.streamBeingCaptured) {
            this.streamBeingCaptured.getTracks().forEach(track => track.stop()); //stop all the tracks on the active stream in order to stop the stream
            this.streamBeingCaptured = null; //reset media recorder properties for next recording
        }
        if (this.intervalId > 0) {
            clearInterval(this.intervalId); 
        }
        this.audioChunks = []; 
    },
    get: function(firstChunk) { 
        let slice = this.audioChunks.slice(firstChunk);
        if (firstChunk > 0) {slice.unshift(this.audioChunks[0]);}
        return slice;
    },
    advance: function(n){ //advance firstChunk by n chunnks
        if (n > 0 && this.audioChunks.length >= n) {
            this.firstChunk += n; 
        }
    }
};
*/