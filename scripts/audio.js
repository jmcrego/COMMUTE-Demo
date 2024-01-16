/*** object encapsulating the functionality for recording audio using the Web Audio API and the MediaRecorder API in a web browser ***/

mimetype = 'audio/webm'

var audioRecorder = {
    // Properties
    audioChunks: [],
    firstChunk: 0,
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
                        this.mediaRecorder = new MediaRecorder(stream/*, mediaRecorderOptions*/); 
                        this.audioChunks = []; 
                        this.mediaRecorder.addEventListener("dataavailable", event => { 
                            this.audioChunks.push(event.data); 
                            console.log('audioChunks.length = ',this.audioChunks.length)
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
    get: function() { // blob with list of chunks and number of chunks
        let lastChunk = this.audioChunks.length;
        let blob = new Blob(this.audioChunks.slice(this.firstChunk), { type: 'audio/webm' })
        return {
            'blob': blob,
            'length': lastChunk - this.firstChunk
        };
    },    
    advance: function(n){ //advance firstChunk by n chunnks
        if (n > 0 && this.audioChunks.length >= n) { 
            this.firstChunk += n; 
            /*this.audioChunks.splice(n);*/ 
        }
    }
};
