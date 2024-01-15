
let tableResults = document.getElementById("tableResults");
let recordButton = document.getElementById("recordButton");
let delay_ms = document.getElementById("delay_ms");
let startPromise = null;
let audioRec = audioRecorder;
let lang_src = 'pr';
let lang_tgt = 'fr';
let intervalId = 0;
document.getElementById("transcript_pr").style.backgroundColor = 'LightGrey';
document.getElementById("translate_fr").style.backgroundColor = 'LightBlue';

function changeTranscription(cellId) {
  document.getElementById("transcript_pr").style.backgroundColor = 'transparent';
  document.getElementById("transcript_fr").style.backgroundColor = 'transparent';
  document.getElementById("transcript_en").style.backgroundColor = 'transparent';
  document.getElementById("transcript_ar").style.backgroundColor = 'transparent';
  if      (cellId == 'transcript_pr') {lang_src = 'pr'; document.getElementById(cellId).style.backgroundColor = 'LightGrey';}
  else if (cellId == 'transcript_fr') {lang_src = 'fr'; document.getElementById(cellId).style.backgroundColor = 'LightBlue';}
  else if (cellId == 'transcript_en') {lang_src = 'en'; document.getElementById(cellId).style.backgroundColor = 'LightCoral';}
  else if (cellId == 'transcript_ar') {lang_src = 'en'; document.getElementById(cellId).style.backgroundColor = 'LightGreen';}
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
    startPromise = audioRec.start(chunk_ms.value) // Start recording with a delay of delay_ms milliseconds
    startPromise
      .then(() => { console.log("Recording started successfully."); })
      .catch(error => { console.error("Error starting recording: ", error); });
    intervalId = setInterval(() => serverRequest(), delay_ms.value); //call serverRequest every delay_ms milliseconds
  }
  else { //stop recording
    recordButton.innerHTML = "Start";    
    recordButton.style.backgroundColor = "DarkBlue"; //"#0088cc";
    startPromise //close need to wait for the completion of startPromise
      .then(() => { audioRec.stop(); console.log('Recording stopped successfully.'); })
      .catch(error => { console.error('Error stopping recording:', error); });
    if (intervalId > 0) { clearInterval(intervalId); }//clear intervalId (stop serverRequests)
  }
}

const serverRequest = async () => {
  if (audioRec.audioChunks.length == 0){
    return;
  }
  console.log('serverRequest');
  let address = 'http://' + document.getElementById('IP').value + ':' + document.getElementById('PORT').value + document.getElementById('ROUTE').value;
  let daudio = audioRec.get();
  const audio = daudio['audio'];
  const blob = new Blob(audio, { type: 'audio/webm' });
  const formData = new FormData();
  //console.log(`audio.length = ${length}`);
  console.log(`audio = ${audio}`);
  formData.append('lang_src', lang_src);
  formData.append('lang_tgt', lang_tgt);
  formData.append('audio', blob);
  formData.append('length', audio.length);
  try {
    const response = await fetch(address, { method: 'POST', body: formData });    
    if (!response.ok) { console.error('Server returned an error:', response.statusText); return; }
    const data = await response.json();
    updateResults(data);
  } 
  catch (error) { console.error('Fetch error:', error); }
}

function updateResults(data){
  console.log('updateResults Data:', data);
  if (tableResults.rows.length == 1) { insertSecondRow(); }
  var firstCell = tableResults.rows[1].cells[0];
  var secondCell = tableResults.rows[1].cells[1];    
  firstCell.innerHTML = langTag(data.lang_src) + ' ' + data.transcription;
  secondCell.innerHTML = langTag(data.lang_tgt) + ' ' + data.translation;
  advance = parseInt(data.advance);
  if (advance>0) { //end of sentence (add new row for the remaining requests) 
    audioRec.advance(advance);
    console.log(`firstChunk advanced to ${audioRec.firstChunk}`)
    insertSecondRow()
  }
}

function insertSecondRow(){
  console.log('insertSecondRow')
  secondRow = tableResults.insertRow(1); 
  secondRow.insertCell(0);
  secondRow.insertCell(1);
  secondRow.cells[0].classList.add('cellcontent');
  secondRow.cells[1].classList.add('cellcontent');
  secondRow.cells[0].innerHTML = '';
  secondRow.cells[1].innerHTML = '';
}

function langTag(l){
  if (l == 'en'){return '<en></en>';}
  else if (l == 'fr'){return '<fr></fr>';}
  else if (l == 'ar'){return '<ar></ar>';}
  else {return '<xx></xx>';}
}

function playBlob(blob) {
  if (blob.nchunks > 0){
    const audio = new Audio();
    const url = URL.createObjectURL(blob.audio);
    audio.src = url;
    audio.play()
      .then(() => { console.log("Audio playback started successfully."); })
      .catch(error => { console.error("Error playing audio:", error.message); })
      .finally(() => { URL.revokeObjectURL(url); }); // Clean up after playback is finished
  }
}


