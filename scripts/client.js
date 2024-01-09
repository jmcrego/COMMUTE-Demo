
var client = {
    // Properties
    address: '',           
    // Methods
    connect: function(ip, port, dir) {
        return new Promise((resolve, reject) => {
            if (){
                reject(new Error('mediaDevices API or getUserMedia method is not supported in this browser.'));
            } else{
                resolve();
            }

        });
        this.address = ip + ':' + port + '/' + dir;
    }
    call: function(audioChunks, lang_tgt) { // Start recording audio chunks at specified delay_ms milliseconds (returns a promise that resolves if audio recording successfully started)
        return new Promise((resolve, reject) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { // Feature is not supported in the browser
                reject(new Error('mediaDevices API or getUserMedia method is not supported in this browser.'));
            } else { // Feature is supported in the browser
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => { // Returns a promise that resolves to the audio stream
                        this.streamBeingCaptured = stream; //save the reference of the stream to stop it when necessary
                        resolve();
                    })
                    .catch(error => reject(error));
            }
        });
    }
};

