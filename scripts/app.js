
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
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let tracks = stream.getAudioTracks();
  console.log('track[0] is ', tracks[0].getCapabilities());
  chunkId = 0;
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      const audioBlob = new Blob([event.data], { type: 'audio/wav' });
      const audioReader = new FileReader();
      audioReader.onloadend = () => {
        const audioData = audioReader.result.split(',')[1];
        const dataToSend = { audioData, chunkId, lang_src, lang_tgt };
        console.log(`CLIENT Send chunkId=${chunkId} size=${audioBlob.size}`);
        websocket.send(JSON.stringify(dataToSend));
        chunkId++;
      };
      audioReader.readAsDataURL(audioBlob);
    }
  };

  // Open WebSocket connection
  websocket = new WebSocket('ws://localhost:8765');
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
  clearInterval(intervalId);
  mediaRecorder.stop();
}

function updateResults(responseData){
  const { transcription, translation, eos, lang_src } = responseData;
  console.log('updateResults Data:', responseData);
  if (tableResults.rows.length == 1) { insertNewSecondRow(); }
  var firstCell = tableResults.rows[1].cells[0];
  var secondCell = tableResults.rows[1].cells[1];    
  firstCell.innerHTML = langTag(lang_src) + ' ' + transcription;
  secondCell.innerHTML = langTag(lang_tgt) + ' ' + translation;
  if (eos) { //end of sentence (add new row for the remaining requests) 
    insertNewSecondRow()
  }
}

function insertNewSecondRow(){
  console.log('insertSecondRow')
  secondRow = tableResults.insertRow(1); 
  secondRow.insertCell(0);
  secondRow.insertCell(1);
  secondRow.cells[0].classList.add('cellcontent');
  secondRow.cells[1].classList.add('cellcontent');
  secondRow.cells[0].innerHTML = '<span style="color: white">x</span>';
  secondRow.cells[1].innerHTML = '<span style="color: white">x</span>';
}

function langTag(l){
  if (l == 'en'){return '<en></en>';}
  else if (l == 'fr'){return '<fr></fr>';}
  else if (l == 'ar'){return '<ar></ar>';}
  else {return '<xx></xx>';}
}
