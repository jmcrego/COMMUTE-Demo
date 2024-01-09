/*** object encapsulating the functionality for recording audio using the Web Audio API and the MediaRecorder API in a web browser ***/

mimetype = 'audio/webm'

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
                        const mediaRecorderOptions = { mimeType: mimetype, audioBitsPerSecond: 32000, audio: true, video: false };
                        this.mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions); 
                        this.audioChunks = []; 
                        this.mediaRecorder.addEventListener("dataavailable", event => { this.audioChunks.push(event.data); }); 
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
    blob: function() { // blob with all chunks and number of chunks
        return new Promise((resolve, reject) => {
            try {
                let blob = new Blob(this.audioChunks, { mimeType: mimetype }); 
                resolve({'blob': blob, 'length': this.audioChunks.length});
            } 
            catch (error) {
                reject(error); 
            }
        });
    },    
    remove: function(n){ //remove initial n chunnks
        if (n > 0 && this.audioChunks.length >= n) { this.audioChunks = this.audioChunks.slice(n); }
    }
};

const blobToBase64 = blob => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    return new Promise(resolve => {
        reader.onloadend = () => {
            resolve(reader.result); 
        };
    }); 
}
