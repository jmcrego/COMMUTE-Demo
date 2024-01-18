
let mediaRecorder;
let websocket;
let tableResults = document.getElementById("tableResults");
let recordButton = document.getElementById("recordButton");
let delay_ms = document.getElementById("delay_ms");
let lang_src = 'pr';
let lang_tgt = 'fr';
let intervalId = 0;
let nChunk;
const curr_date = getDate();
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
  nChunk = 0;
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      const audioBlob = new Blob([event.data], { type: 'audio/wav' });
      const audioReader = new FileReader();
      audioReader.onloadend = () => {
        const audioData = audioReader.result.split(',')[1];
        const dataToSend = { audioData, nChunk, lang_src, lang_tgt };
        console.log('CLIENT Send nChunk=',nChunk);
        websocket.send(JSON.stringify(dataToSend));
        nChunk++;
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
  }, delay_ms.value);
}

function stopRecording() {
  clearInterval(intervalId);
  mediaRecorder.stop();
}

const serverRequest = async () => {
  if (audioRec.audioChunks.length > 0){
    const address = 'http://' + document.getElementById('IP').value + ':' + document.getElementById('PORT').value + document.getElementById('ROUTE').value;
    const slicedAudioChunks = audioRec.get(firstChunk);
    if (slicedAudioChunks != null && slicedAudioChunks.length >= delay_ms.value/chunk_ms.value) {      
      const blob = new Blob(slicedAudioChunks, { type: slicedAudioChunks[0].type })
      saveBlob(blob, `audio_${curr_date}_fromChunk-${firstChunk}-len-${slicedAudioChunks.length}`);
      console.log(`serverRequest audio: ${blob}, Blob size: ${blob.size}, firstChunk: ${firstChunk} nChunks: ${slicedAudioChunks.length}`);
      firstChunk += slicedAudioChunks.length;
      console.log(`firstChunk moved to: ${firstChunk}`);
      const formData = new FormData();
      formData.append('lang_src', lang_src);
      formData.append('lang_tgt', lang_tgt);
      formData.append('audio', blob);
      formData.append('firstChunk', firstChunk);
      formData.append('nChunks', slicedAudioChunks.length);
      try {
        const response = await fetch(address, { method: 'POST', body: formData });    
        if (!response.ok) { console.error('Server returned an error:', response.statusText); return; }
        const data = await response.json();
        updateResults(data);
      } 
      catch (error) { console.error('Fetch error:', error); }
    }
  }
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

function getDate(){
  // Create a new Date object
  const currentDate = new Date();
  // Get the current date and time
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // Months are zero-based, so add 1
  const day = currentDate.getDate();
  const hours = currentDate.getHours();
  const minutes = currentDate.getMinutes();
  const seconds = currentDate.getSeconds();
  // Format the date and time as a string
  const date = `${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`
  const time = `${hours < 10 ? '0' : ''}${hours}-${minutes < 10 ? '0' : ''}${minutes}-${seconds < 10 ? '0' : ''}${seconds}`; 
  return date + '@' + time; 
}



