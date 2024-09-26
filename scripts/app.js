let recordEnCours = false;
let mic_mediaRecorder;
let intern_mediaRecorder;
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

// listes qui contiennent l'ensemble des informations pour le téléchargement sous forme de fichiers
let liste_dl_trs = [];
let liste_dl_trd = [];

// indices du dernier élément à modifier pour les 2 sources si previous_eos_[mic/intern] == false
let last_ind_mic;
let last_ind_intern;

// indice global qui garde le numéro du dernier index ajouté
let last_index;

// deux booléens qui permettent d'indiquer si on a ajouté nos nouveaux blobs aux listes
let bool_add_mic_blob = false;
let bool_add_intern_blob = false;

// booleén qui indique si l'envoie d'informations est en cours
let envoie_en_cours = false;

let sending = false;

// On a une liste pour le microphone/l'audio interne
let mic_listeBlobs = [];
let intern_listeBlobs = []

let previousEos_mic = false;
let previousEos_intern = false;

// On crée un compteur
let id_ref = 0

// Indice des dernières paires transcription-traduction
let last_mic = 0;
let last_intern = 0;

// Nos deux variables dans lesquelles on stocke les devices
let myMicrophoneDeviceId = null;
let myInternDeviceId;

// On définit 2 variables qui vont contenir les blobs du dernier enregistrement
let mic_blob;
let intern_blob; 

// On récupère les 2 devices que nous allons utiliser pour enregistrer la voix/l'audio interne
navigator.mediaDevices
			.enumerateDevices()
			.then((devices) => {
				devices.forEach((device) => {
					if(device.kind == "audioinput" && myMicrophoneDeviceId == null){
						myMicrophoneDeviceId = device;
					}
					else if(device.kind == "audioinput"){
						myInternDeviceId = device;
					}
				})
			})

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

  // On définit les options de nos enregistrements
  let options_mic = {
    audio: {
      deviceId: {
        exact: myMicrophoneDeviceId.deviceId,
      }
    }
  }

  let options_intern = {
    audio: {
      deviceId: {
        exact: myInternDeviceId.deviceId,
      }
    }
  }

  // on définit nos deux flux
  const stream_mic = await navigator.mediaDevices.getUserMedia(options_mic);
  const stream_intern = await navigator.mediaDevices.getUserMedia(options_intern);

  chunkId = 0;

  // on définit nos deux recorders
  mic_mediaRecorder = new MediaRecorder(stream_mic);
  intern_mediaRecorder = new MediaRecorder(stream_intern);
  
  // on définit leur comportement lorsqu'ils ont terminé un enregistrement de X secondes
  mic_mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0){
      mic_blob = new Blob([event.data], {type: 'audio/wav'});
      mic_listeBlobs.push(mic_blob);
      bool_add_mic_blob = true;
      console.log('Ajout des données microphones');

      if(bool_add_intern_blob){
        sendInformations();
      }
    }
  }

  intern_mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0){
      intern_blob = new Blob([event.data], {type: 'audio/wav'});
      intern_listeBlobs.push(intern_blob);
      bool_add_intern_blob = true;
      console.log('Ajout des données internes');
      if(bool_add_mic_blob){
        sendInformations();
      }
    }
  }

  /*mediaRecorder.ondataavailable = (event) => {
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
  };*/

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
  mic_mediaRecorder.start();
  intern_mediaRecorder.start();

  // stop/restart mediaRecorder to force ondataavailable event (send request to server) every delay_ms milliseconds
  intervalId = setInterval(() => {
    if (mic_mediaRecorder.state === 'recording') { 
      // on arrête les mediaRecorders
      mic_mediaRecorder.stop();
      intern_mediaRecorder.stop();      
      
      // on reprend l'enregistrement
      mic_mediaRecorder.start();
      intern_mediaRecorder.start();

      // on traite les enregistrements (envyer au backend)
      console.log('fin d\'un enregistrement');
    }
  }, document.getElementById("delay_ms").value);
}


function stopRecording() {
  recordEnCours = false;

  clearInterval(intervalId);
  mic_mediaRecorder.stop();
  intern_mediaRecorder.stop();

  console.log('On arrête l\'enregistrement de manière finie');
}

function sendInformations(){
  if (envoie_en_cours == false){
    envoie_en_cours = true;

    bool_add_intern_blob = false;
    bool_add_mic_blob = false;

    console.log('On envoie un message');
    // On définit deux variables dans lesquelles on stocke le résultat de l'enregistrement
    let mic_audioData;
    let intern_audioData;

    // On définit deux file readers
    const mic_audioReader = new FileReader();
    const intern_audioReader = new FileReader();

    // booléens qui indiquent si la lecture est finie
    let bool_read_mic_finished = false;
    let bool_read_intern_finished = false;

    // on traite les blobs
    mic_audioReader.onloadend = () => {
      mic_audioData = mic_audioReader.result.split(',')[1];
      bool_read_mic_finished = true;
      if (bool_read_intern_finished){
        sendData(mic_audioData, intern_audioData);
      }
    }
    intern_audioReader.onloadend = () => {
      intern_audioData = intern_audioReader.result.split(',')[1];
      bool_read_intern_finished = true;
      if (bool_read_mic_finished){
        sendData(mic_audioData, intern_audioData);
      }
    }

    // On lit les deux blobs
    console.log(mic_blob);
    console.log(intern_blob);

    console.log(mic_listeBlobs);
    console.log(intern_listeBlobs);

    mic_audioReader.readAsDataURL(mic_blob);
    intern_audioReader.readAsDataURL(intern_blob);

  }
  else{
    console.log('Envoie déjà en cours !');
  }

}

function sendData(mic_audioData, intern_audioData){
  if(sending == false){
    sending = true;

    const timestamp = Date.now();

    dataToSend = {mic_audioData, intern_audioData, chunkId, lang_src, lang_tgt, timestamp};
    console.log(JSON.stringify(dataToSend));
    websocket.send(JSON.stringify(dataToSend));
    chunkId++;

    envoie_en_cours = false;
    sending = false;
    console.log('envoie réussi:', chunkId - 1);
  }
  else{
    console.log('sending en cours');
  }
}

function updateResults(responseData){
  let conteneur = document.getElementById('tableResults');

  let rows = conteneur.getElementsByClassName("row");

  let child_mic = document.createElement("div");
  let child_intern = document.createElement("div");

  child_mic.className = "row";
  child_intern.className = "row";

  child_intern.style.backgroundColor = "rgb(0, 160, 219)";

  let cell_un_mic = document.createElement("div");
  let cell_deux_mic = document.createElement("div");
  let cell_un_intern = document.createElement("div");
  let cell_deux_intern = document.createElement("div");

  cell_un_mic.className = "cell";
  cell_deux_mic.className = "cell";
  cell_un_intern.className = "cell";
  cell_deux_intern.className = "cell";

  child_mic.appendChild(cell_un_mic);
  child_mic.appendChild(cell_deux_mic);
  child_intern.appendChild(cell_un_intern);
  child_intern.appendChild(cell_deux_intern);

  let id_ref_bouton_mic = "bouton_mic_" + id_ref;
  let id_ref_audio_mic = "audio_mic_" + id_ref;
  let id_svg_trad_mic = "svg_trad_mic_" + id_ref;

  let id_ref_bouton_intern = "bouton_intern_" + id_ref;
  let id_ref_audio_intern = "audio_intern_" + id_ref;
  let id_svg_trad_intern = "svg_trad_intern_" + id_ref;


  let svg_balise_un_mic = "<audio id=" + id_ref_audio_mic + " type=\"audio/wav\"></audio><svg id =\"" + id_ref_bouton_mic + "\" class =\"svg\" onclick=\"play_audio(" + id_ref + "," + responseData.debut_mic + "," + responseData.fin_mic + ", 'mic')\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 384 512\"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d=\"M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z\"/></svg>" + langTag(responseData.lang_src_mic);
  console.log(svg_balise_un_mic);

  let texte = document.createElement("div");
  texte.className = "texte";
  texte.innerHTML = responseData.transcription_mic;

  cell_un_mic.innerHTML = svg_balise_un_mic;
  cell_un_mic.appendChild(texte);

  let svg_balise_un_intern = "<audio id=" + id_ref_audio_intern + " type=\"audio/wav\"></audio><svg id =\"" + id_ref_bouton_intern + "\" class =\"svg\" onclick=\"play_audio(" + id_ref + "," + responseData.debut_intern + "," + responseData.fin_intern + ", 'intern')\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 384 512\"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d=\"M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z\"/></svg>" + langTag(responseData.lang_src_intern);
  console.log(svg_balise_un_intern);

  texte = document.createElement("div");
  texte.className = "texte";
  //texte.style.backgroundColor = "lightblue";
  texte.innerHTML = responseData.transcription_intern;

  cell_un_intern.innerHTML = svg_balise_un_intern;
  cell_un_intern.appendChild(texte);


  let balise_deux_mic = "<svg id =\"" + id_svg_trad_mic + "\" class =\"svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 384 512\"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d=\"M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z\"/></svg>" + langTag(lang_tgt);
  cell_deux_mic.innerHTML = balise_deux_mic;

  let texte_trad = document.createElement("div");
  texte_trad.className = "texte"
  texte_trad.innerHTML = responseData.translation_mic;
  cell_deux_mic.appendChild(texte_trad);

  let balise_deux_intern = "<svg id =\"" + id_svg_trad_intern + "\" class =\"svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 384 512\"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d=\"M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z\"/></svg>" + langTag(lang_tgt);
  cell_deux_intern.innerHTML = balise_deux_intern;

  texte_trad = document.createElement("div");
  texte_trad.className = "texte"
  texte_trad.innerHTML = responseData.translation_intern;
  cell_deux_intern.appendChild(texte_trad);


  // Vérifier s'il y a au moins une div existante
  if (rows.length > 1) {
    // Sélectionner les deux dernières div existantes
    let lastRow = rows[1];

    let lastRow_intern = rows[last_intern];
    let lastRow_mic = rows[last_mic];

    // on ajoute ou modifie la transcription du microphone
    if(previousEos_mic){
      conteneur.insertBefore(child_mic, lastRow);
      
      last_intern = last_intern + 1;
      last_mic =  1;

      last_index = last_index + 1;
      last_ind_mic = last_index;

      // push de la nouvelle donnée
      liste_dl_trs.push({"debut": responseData.debut_mic, "fin": responseData.fin_mic, "source": "me", "transcription": responseData.transcription_mic, "langue": responseData.lang_src_mic});
      liste_dl_trd.push({"debut": responseData.debut_mic, "fin": responseData.fin_mic, "source": "me", "traduction": responseData.translation_mic, "langue": lang_tgt});

    }
    else{
      lastRow_mic.innerHTML = child_mic.innerHTML;
      console.log('lastRow_mic:', lastRow_mic.innerHTML);
      console.log('child_mic:', child_mic.innerHTML);

      // on modifie une donnée précédent
      liste_dl_trs[last_ind_mic] = {"debut": responseData.debut_mic, "fin": responseData.fin_mic, "source": "me", "transcription": responseData.transcription_mic, "langue": responseData.lang_src_mic};
      liste_dl_trd[last_ind_mic] = {"debut": responseData.debut_mic, "fin": responseData.fin_mic, "source": "me", "traduction": responseData.translation_mic, "langue": lang_tgt};
    }

    // on ajoute ou modifie la transcription de l'audio interne
    // on ajoute ou modifie la transcription du microphone
    if(previousEos_intern){
      lastRow = rows[1];
      conteneur.insertBefore(child_intern, lastRow);

      last_mic = last_mic + 1;
      last_intern = 1;

      last_index = last_index + 1;
      last_ind_intern = last_index;

      // push de la nouvelle ligne
      liste_dl_trs.push({"debut": responseData.debut_intern, "fin": responseData.fin_intern, "source": "other", "transcription": responseData.transcription_intern, "langue": responseData.lang_src_intern});
      liste_dl_trd.push({"debut": responseData.debut_intern, "fin": responseData.fin_intern, "source": "other", "traduction": responseData.translation_intern, "langue": lang_tgt});

    }
    else{
      lastRow_intern.innerHTML = child_intern.innerHTML;
      console.log('lastRow_intern:', lastRow_intern.innerHTML);
      console.log('child_intern:', child_intern.innerHTML);

      // on modifie la donnée précédente
      liste_dl_trs[last_ind_intern] = {"debut": responseData.debut_intern, "fin": responseData.fin_intern, "source": "other", "transcription": responseData.transcription_intern, "langue": responseData.lang_src_intern};
      liste_dl_trd[last_ind_intern] = {"debut": responseData.debut_intern, "fin": responseData.fin_intern, "source": "other", "traduction": responseData.translation_intern, "langue": lang_tgt};
    }

  } else {
    // Si aucune div existante, ajouter la nouvelle div à la fin du conteneur
    conteneur.appendChild(child_intern);
    conteneur.appendChild(child_mic);

    last_intern = 1;
    last_mic = 2;

    // On ajoute nos données courrantes
    liste_dl_trs.push({"debut": responseData.debut_mic, "fin": responseData.fin_mic, "source": "me", "transcription": responseData.transcription_mic, "langue": responseData.lang_src_mic});
    liste_dl_trs.push({"debut": responseData.debut_intern, "fin": responseData.fin_intern, "source": "other", "transcription": responseData.transcription_intern, "langue": responseData.lang_src_intern});

    liste_dl_trd.push({"debut": responseData.debut_mic, "fin": responseData.fin_mic, "source": "me", "traduction": responseData.translation_mic, "langue": lang_tgt});
    liste_dl_trd.push({"debut": responseData.debut_intern, "fin": responseData.fin_intern, "source": "other", "traduction": responseData.translation_intern, "langue": lang_tgt});

    last_ind_mic = 0;
    last_ind_intern = 1;

    last_index = 1;
  }

  /*concatenateBlobs(listeBlobs).then(combinedBlob => {
    console.log('combinedBlob', combinedBlob);
    
    url = URL.createObjectURL(combinedBlob);

    let audio = document.getElementById(id_ref_audio);

    console.log('id_ref_audio', id_ref_audio);
    console.log('audio', audio);

    audio.src = url;
  });*/

  concatenateBlobs(mic_listeBlobs).then(combinedBlob => {
    console.log('mic_combinedBlob', combinedBlob);

    url = URL.createObjectURL(combinedBlob);

    let mic_audio = document.getElementById(id_ref_audio_mic);

    console.log('id_ref_audio_mic', id_ref_audio_mic);
    console.log('mic_audio', mic_audio);

    mic_audio.src = url;
  });

  concatenateBlobs(intern_listeBlobs).then(combinedBlob => {
    console.log('intern_combinedBlob', combinedBlob);

    url = URL.createObjectURL(combinedBlob);

    let intern_audio = document.getElementById(id_ref_audio_intern);

    console.log('id_ref_audio_intern', id_ref_audio_intern);
    console.log('intern_audio', intern_audio);

    intern_audio.src = url;
  });


  // mise à jour du previousEos de mic
  if(responseData.eos_mic){
    previousEos_mic = true;
    console.log('eo_mic true:', responseData);
  }
  else{
    previousEos_mic = false;
    console.log('eos_mic false:', responseData);
  }

  // mise à jour du previousEos de l'audio interne
  if(responseData.eos_intern){
    previousEos_intern = true;
    console.log('eos_inter true:', responseData);
  }
  else{
    previousEos_intern = false;
    console.log('eos_inter false:', responseData);
  }

  id_ref += 1;

  console.log('previousEos_mic', previousEos_mic);
  console.log('id_ref', id_ref);
}

function langTag(l){
  if (l == 'en'){return '<en></en>';}
  else if (l == 'fr'){return '<fr></fr>';}
  else if (l == 'ar'){return '<ar></ar>';}
  else {return '<xx></xx>';}
}

function typeTag(l){
  if (l == 'mic'){return '<mic></mic>';}
  else {return '<intern></intern>';}
}

/**
 * Fonction qui va jouer l'audio associé à un identifiant 
 * Il se place à un timestamp de début et s'arrête au timestamp de fin
 */

function play_audio(id_ref, tmp_deb, tmp_fin, type){
  
  console.log('type:', type);

  console.log('On rentre dans la fonction play');
  
  let id_ref_svg = "bouton_" + type + "_" + id_ref;

  let svgElement = document.getElementById(id_ref_svg);
  svgElement.classList.add('change-color');

  console.log('timestamp_deb:', tmp_deb);
  console.log('timestamp_fin:', tmp_fin);
  
  let id_ref_audio = "audio_" + type + "_" + id_ref;
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

function afficherTable(){
  console.log('liste_trs', liste_dl_trs);
  console.log('liste_trd', liste_dl_trd);


  let liste_trs = [];
  let liste_trd = [];

  for(let i=0; i < last_index+1; i=i+1){
    let elem_trs = liste_dl_trs[i];
    let elem_trd = liste_dl_trd[i];

    let txt_trs = "[" + elem_trd['debut'].toFixed(2) + ":" + elem_trs['fin'].toFixed(2) + "] " + elem_trs['langue'] + " " + elem_trs['source'] + ": " + elem_trs['transcription'] +"\n";
    let txt_trd = "[" + elem_trd['debut'].toFixed(2) + ":" + elem_trs['fin'].toFixed(2) + "] " + elem_trs['langue'] + " " + elem_trs['source'] + ": " + elem_trs['traduction'] +"\n";

    liste_trs.push(txt_trs);
    liste_trd.push(txt_trd);

  }

  console.log(liste_trs);
  console.log(liste_trd);


  /*let elem = rows[2];
  let texts = elem.getElementsByClassName('texte');
  console.log(rows);
  console.log(elem);
  console.log(texts);

  for(let i=0; i < texts.length; i = i + 1){
    console.log(texts[i].innerHTML);
  }*/

  const trs_file = new File(liste_trs, 'trs/trs.txt', {
    type: 'text/plain',
  });

  const trd_file = new File(liste_trd, 'trd/trd.txt', {
    type: 'text/plain',
  });

  // on gère le download ici

  const link_trs = document.createElement('a');
  const link_trd = document.createElement('a');

  const url_trs = URL.createObjectURL(trs_file);
  const url_trd = URL.createObjectURL(trd_file);

  link_trs.href = url_trs;
  link_trd.href = url_trd;

  link_trs.download = trs_file.name;
  link_trd.download = trd_file.name;

  document.body.appendChild(link_trs);
  document.body.appendChild(link_trd);

  link_trs.click();
  link_trd.click();

  document.body.removeChild(link_trs);
  document.body.removeChild(link_trd);
  
  
  window.URL.revokeObjectURL(url_trs);
  window.URL.revokeObjectURL(url_trd);
}