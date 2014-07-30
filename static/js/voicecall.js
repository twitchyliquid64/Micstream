//Detect which API to use, and detect compatibility
'use strict';

var getUserMedia = navigator.getUserMedia ? 'getUserMedia' :
                   navigator.webkitGetUserMedia ? 'webkitGetUserMedia' :
                   navigator.mozGetUserMedia ? 'mozGetUserMedia' :
                   navigator.oGetUserMedia ? 'oGetUserMedia' :
                   navigator.msGetUserMedia ? 'msGetUserMedia' :
                   undefined;

//global variables
var audioContext = window.AudioContext ? new window.AudioContext() :
                   window.webkitAudioContext ? new window.webkitAudioContext() :
                   window.mozAudioContext ? new window.mozAudioContext() :
                   window.oAudioContext ? new window.oAudioContext() :
                   window.msAudioContext ? new window.msAudioContext() :
                   undefined;


var BUFFER_LENGTH = 8192;

var connection = null;

var micStream = null;
var micStreamSourceNode = null;
var micBufferNode = null;
var bufferedWebAudio = [];

var downsampler = new Resampler(audioContext.sampleRate, 8000, 1, 1520);
var   upsampler = new Resampler(8000, audioContext.sampleRate, 1, BUFFER_LENGTH);



var workOutWSURI = function(){
	var loc = window.location, new_uri;
	if (loc.protocol === "https:") {
		new_uri = "wss:";
	} else {
		new_uri = "ws:";
	}
	new_uri += "//" + loc.host;
	return new_uri;
}


//checks compatibility and displays error messages if any.
var initialise = function(){
	var error_msg = [];
	if (!WebSocket) {
		error_msg.push("Your browser doesn't seem to support WebSocket.");
	}
	if (!audioContext) {
		error_msg.push("Your browser doesn't seem to support Web Audio API.");
	}
	if (!getUserMedia) {
		error_msg.push("Your browser doesn't seem to support WebRTC.");
	}

	for (var i = 0; i < error_msg.length; i++) {
		$("#browser_alerts").append("<li class='text-error' >" + error_msg[i] + "</li>");
	}

	console.log("Initialise() finished.");
	setTimeout(startup, 1000);
}

//called by the connect button - creates the websocket and calls startMicStream()
var startup = function(){
	console.log("Opening connection to: " + workOutWSURI() +"/connect"+window.location.pathname);
	connection = new WebSocket(workOutWSURI() +"/connect"+window.location.pathname);
	connection.binaryType = 'arraybuffer';


	connection.onopen = function(event){
		console.log("Websocket opened:");
		console.log(event.data);
		connection.send(JSON.stringify({'Type':'hello','Name':"unnamed"}));
	}


	connection.onmessage = function(event){

		if (typeof event.data == 'string') {
			var msg = JSON.parse(event.data);
			console.log(event.data);
		}else{
			var input = new Int16Array(event.data);
			var sampBuff = new Float32Array(input.length);
			for (var i = 0; i < input.length; ++i) {
				sampBuff[i] = input[i] / 32767.0;
			}
			var samples = upsampler.resampler(sampBuff);
			bufferedWebAudio.push(samples);//we have a chunk of audio data, so queue it for playback.
		}
	}
	startMicStream();
}



var startMicStream = function(){
	navigator[getUserMedia]({ audio: true }, function(obj){
		//create and store all the required nodes - the audio node, and the JS node (which we inspect to get the PCM data)
		//mic -> MediaStream -> scriptProcessor (we read this) -> output (we leave the output buffers blank so we dont get sound)
		micStream = obj;
		micStreamSourceNode = audioContext.createMediaStreamSource(micStream);
		micBufferNode = audioContext.createScriptProcessor(BUFFER_LENGTH, 1, 1);

		micBufferNode.onaudioprocess = function(event){
			var samples = downsampler.resampler(event.inputBuffer.getChannelData(0));
			var sampBuff = new Int16Array(samples.length);
			for (var i = 0; i < samples.length; ++i) {
				sampBuff[i] = Math.ceil(samples[i] * 32767);
			}
			connection.send(sampBuff);//send data read from the mic

			if (bufferedWebAudio.length == 0) {
				console.log("Buffer miss!");
			}else{
				var b = bufferedWebAudio.shift();//grab a chunk of audio data queued for playback.
				event.outputBuffer.getChannelData(0).set(new Float32Array(b) || new Float32Array(BUFFER_LENGTH));
			}
		};

		//finally, connect them together
		micStreamSourceNode.connect(micBufferNode);
		micBufferNode.connect(audioContext.destination);

		console.log("Mic stream is now setup.");
	}, function(err){console.log("ERR! Could not get mic stream.");});
}

$(initialise);
