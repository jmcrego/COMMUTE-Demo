let recordEnCours = false;
let mediaRecorder;
let websocket;
let tableResults = document.getElementById("tableResults");
let recordButton = document.getElementById("recordButton");
let lang_src = 'pr';
let lang_tgt = 'fr';
let intervalId = 0;
let chunkId;
document.getElementById("transcript_pr").style.backgroundColor = 'LightGrey';
document.getElementById("translate_fr").style.backgroundColor = 'LightBlue';
const audioConstraintEditor = document.getElementById("audioConstraintEditor");

let listeBlobs = [];

let previousEos = false;

// On crée un compteur
let id_ref = 0


function changeTranscription(cellId) {
  document.getElementById("transcript_pr").style.backgroundColor = 'transparent';
  document.getElementById("transcript_fr").style.backgroundColor = 'transparent';
  document.getElementById("transcript_en").style.backgroundColor = 'transparent';
  document.getElementById("transcript_ar").style.backgroundColor = 'transparent';
  if      (cellId == 'transcript_pr') {lang_src = 'pr'; document.getElementById(cellId).style.backgroundColor = 'LightGrey';}
  else if (cellId == 'transcript_fr') {lang_src = 'fr'; document.getElementById(cellId).style.backgroundColor = 'LightBlue';}
  else if (cellId == 'transcript_en') {lang_src = 'en'; document.getElementById(cellId).style.backgroundColor = 'LightCoral';}
  else if (cellId == 'transcript_ar') {lang_src = 'ar'; document.getElementById(cellId).style.backgroundColor = 'LightGreen';}
  console.log(`Transcription changed to ${lang_src}`);
}

function changeTranslation(cellId) {
  document.getElementById("translate_fr").style.backgroundColor = 'transparent';
  document.getElementById("translate_en").style.backgroundColor = 'transparent';
  document.getElementById("translate_ar").style.backgroundColor = 'transparent';
  if      (cellId == 'translate_fr') {lang_tgt = 'fr'; document.getElementById(cellId).style.backgroundColor = 'LightBlue';}
  else if (cellId == 'translate_en') {lang_tgt = 'en'; document.getElementById(cellId).style.backgroundColor = 'LightCoral';}
  else if (cellId == 'translate_ar') {lang_tgt = 'ar'; document.getElementById(cellId).style.backgroundColor = 'LightGreen';}
  console.log(`Translation changed to ${lang_tgt}`);
}

function clickRecordButton(){
  if (recordButton.innerHTML == "Start"){ //start recording
    recordButton.innerHTML = "Stop";
    recordButton.style.backgroundColor = "DarkRed";
    startRecording();
  }
  else { //stop recording
    recordButton.innerHTML = "Start";    
    recordButton.style.backgroundColor = "DarkBlue"; //"#0088cc";
    stopRecording();
  }
}

async function startRecording() {
  recordEnCours = true;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let tracks = stream.getAudioTracks();
  chunkId = 0;
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      
      let blobRecord = new Blob([event.data], {type: 'audio/wav'});
      listeBlobs.push(blobRecord);

      console.log('On ajoute le nouveau blob : ', blobRecord);
      console.log('On a maintenant : ', listeBlobs);

      const timestamp = Date.now();

      const audioReader = new FileReader();
      audioReader.onloadend = () => {
        const audioData = audioReader.result.split(',')[1];
        const dataToSend = { audioData, chunkId, lang_src, lang_tgt, timestamp };
        console.log(`CLIENT Send chunkId=${chunkId} size=${blobRecord.size}`);
        websocket.send(JSON.stringify(dataToSend));
        chunkId++;
      };
      audioReader.readAsDataURL(blobRecord);
    }
  };

  // Open WebSocket connection
  websocket = new WebSocket('ws://127.0.0.1:8765');
  websocket.onopen = (event) => { console.log('CLIENT connection opened.'); };
  websocket.onclose = (event) => { console.log('CLIENT connection closed.'); };
  websocket.onmessage = (event) => { 
    const responseData = JSON.parse(event.data);
    console.log('CLIENT Received=',responseData);
    updateResults(responseData);
  };

  // Start recording
  mediaRecorder.start();

  // stop/restart mediaRecorder to force ondataavailable event (send request to server) every delay_ms milliseconds
  intervalId = setInterval(() => {
    if (mediaRecorder.state === 'recording') { 
      mediaRecorder.stop(); 
      mediaRecorder.start();
    }
  }, document.getElementById("delay_ms").value);
}


function stopRecording() {
  recordEnCours = false;

  clearInterval(intervalId);
  mediaRecorder.stop();
}

function updateResults(responseData){
  let conteneur = document.getElementById('tableResults');

  let rows = conteneur.getElementsByClassName("row");

  let child = document.createElement("div");

  child.className = "row";

  let cell_un = document.createElement("div");
  let cell_deux = document.createElement("div");

  cell_un.className = "cell";
  cell_deux.className = "cell";

  child.appendChild(cell_un);
  child.appendChild(cell_deux);

  let id_ref_bouton = "bouton_" + id_ref;
  let id_ref_audio = "audio_" + id_ref;
  let id_svg_trad = "svg_trad_" + id_ref;

  let svg_balise_un = "<audio id=" + id_ref_audio + " type=\"audio/wav\"></audio><svg id =\"" + id_ref_bouton + "\" class =\"svg\" onclick=\"play_audio(" + id_ref + "," + responseData.debut + "," + responseData.fin + ")\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 384 512\"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d=\"M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z\"/></svg>" + langTag(lang_src);
  console.log(svg_balise_un);

  let texte = document.createElement("div");
  texte.className = "texte";
  texte.innerHTML = responseData.transcription;

  cell_un.innerHTML = svg_balise_un;
  cell_un.appendChild(texte);

  let balise_deux = "<svg id =\"" + id_svg_trad + "\" class =\"svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 384 512\"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d=\"M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z\"/></svg>" + langTag(lang_tgt);
  cell_deux.innerHTML = balise_deux;


  let texte_trad = document.createElement("div");
  texte_trad.className = "texte"
  texte_trad.innerHTML = responseData.translation;
  cell_deux.appendChild(texte_trad);

  // Vérifier s'il y a au moins une div existante
  if (rows.length > 1) {
    // Sélectionner la dernière div existante
    let lastRow = rows[1];

    if(previousEos){
      conteneur.insertBefore(child, lastRow);
    }
    else{
      lastRow.innerHTML = child.innerHTML;
      console.log('lastRow:', lastRow.innerHTML);
      console.log('child:', child.innerHTML);
    }
  } else {
    // Si aucune div existante, ajouter la nouvelle div à la fin du conteneur
    conteneur.appendChild(child);
  }

  concatenateBlobs(listeBlobs).then(combinedBlob => {
    console.log('combinedBlob', combinedBlob);
    
    url = URL.createObjectURL(combinedBlob);

    let audio = document.getElementById(id_ref_audio);

    console.log('id_ref_audio', id_ref_audio);
    console.log('audio', audio);

    audio.src = url;
  });
  
  if(responseData.eos){
    previousEos = true;
    console.log('eos true:', responseData);
  }
  else{
    previousEos = false;
    console.log('eose false:', responseData);
  }

  id_ref += 1;

  console.log('previousEos', previousEos);
  console.log('id_ref', id_ref);
}

function langTag(l){
  if (l == 'en'){return '<en></en>';}
  else if (l == 'fr'){return '<fr></fr>';}
  else if (l == 'ar'){return '<ar></ar>';}
  else {return '<xx></xx>';}
}

/**
 * Fonction qui va jouer l'audio associé à un identifiant 
 * Il se place à un timestamp de début et s'arrête au timestamp de fin
 */

function play_audio(id_ref, tmp_deb, tmp_fin){
  console.log('On rentre dans la fonction play');
  
  let id_ref_svg = "bouton_" + id_ref;

  let svgElement = document.getElementById(id_ref_svg);
  svgElement.classList.add('change-color');

  console.log('timestamp_deb:', tmp_deb);
  console.log('timestamp_fin:', tmp_fin);
  
  let id_ref_audio = "audio_" + id_ref;
  let audio = document.getElementById(id_ref_audio);

  console.log('audio:', audio);

  let deb = tmp_deb * 1000;
  let fin = tmp_fin * 1000;
  let delta = fin - deb;

  console.log('timestamp debut en ms:', deb);
  console.log('timestamp fin en ms:', fin);
  console.log('delta (fin - debut) en ms:', delta);
  
  console.log('currentTime de l\'audio avant modification', audio.currentTime);
  audio.currentTime = tmp_deb;
  console.log('currentTime de l\'audio après avoir set currenTime à timestamp début', audio.currentTime);

  if(!recordEnCours){
    console.log('enregistrement terminé ! on joue le segment audio !');
    
    let duration = audio.duration;
    console.log('durée de l\'audio:', duration);

    if(duration < tmp_deb){
      console.log('duration < deb; impossible de jouer l\'audio');
    }
    else{
      console.log('duration > deb; possibilité de jouer l\'audio');
      audio.currentTime = tmp_deb;
      
      if(duration < tmp_fin){
        console.log('duration < fin; impossible de jouer l\'audio');
      }
      else{
        console.log('duration > fin; possibilité de jouer l\'audio');
        audio.play();

        setTimeout(function() {

          audio.pause();
          svgElement.classList.remove('change-color');
          console.log('On a pausé l\'audio, le currentTime est : ', audio.currentTime);
          
        }, delta);
      }
    }
  }

  else{
    console.log('enregistrement en cours ! arrêtez l\'enregistrement pour jouer le segment audio');
  }

}

// Fonction qui convertit un blob en ArrayBuffer
function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

// Fonction qui convertit un ArrayBuffer en AudioBuffer
async function arrayBufferToAudioBuffer(arrayBuffer, audioContext) {
  return await audioContext.decodeAudioData(arrayBuffer);
}

// Fonction qui concatène une liste d'AudioBuffers
function concatenateAudioBuffers(audioBuffers, audioContext) {
  const numberOfChannels = Math.max(...audioBuffers.map(buffer => buffer.numberOfChannels));
  const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const sampleRate = audioBuffers[0].sampleRate;

  const outputBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

  let offset = 0;
  audioBuffers.forEach(buffer => {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      const inputData = buffer.getChannelData(channel);
      outputData.set(inputData, offset);
    }
    offset += buffer.length;
  });

  return outputBuffer;
}

// Function qui convertit un AudioBuffer en un Blob au format wav
async function audioBufferToBlob(audioBuffer, audioContext) {
  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineContext.destination);
  bufferSource.start();

  const renderedBuffer = await offlineContext.startRendering();
  return new Promise((resolve) => {
    offlineContext.oncomplete = (event) => {
      const outputBuffer = event.renderedBuffer;
      const numOfChan = outputBuffer.numberOfChannels;
      const length = outputBuffer.length * numOfChan * 2 + 44;
      const buffer = new ArrayBuffer(length);
      const view = new DataView(buffer);
      
      // Création d'un fichier Wav à partir d'un AudioBuffer
      let pos = 0;
      const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; }
      const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; }
      const writeString = (s) => { for (let i = 0; i < s.length; i++) { view.setUint8(pos++, s.charCodeAt(i)); } }
      
      writeString('RIFF');
      setUint32(length - 8);
      writeString('WAVE');
      writeString('fmt ');
      setUint32(16);
      setUint16(1);
      setUint16(numOfChan);
      setUint32(outputBuffer.sampleRate);
      setUint32(outputBuffer.sampleRate * 2 * numOfChan);
      setUint16(numOfChan * 2);
      setUint16(16);
      writeString('data');
      setUint32(length - 44);
      
      for (let i = 0; i < outputBuffer.length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
          const sample = Math.max(-1, Math.min(1, outputBuffer.getChannelData(channel)[i]));
          view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          pos += 2;
        }
      }
      
      resolve(new Blob([buffer], { type: 'audio/wav' }));
    };
  });
}

// Pipeline d'utilisation des fonctions précédentes
async function concatenateBlobs(blobs) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  const audioBuffers = await Promise.all(blobs.map(async (blob) => {
    const arrayBuffer = await blobToArrayBuffer(blob);
    return await arrayBufferToAudioBuffer(arrayBuffer, audioContext);
  }));

  const combinedBuffer = concatenateAudioBuffers(audioBuffers, audioContext);

  return await audioBufferToBlob(combinedBuffer, audioContext);
}