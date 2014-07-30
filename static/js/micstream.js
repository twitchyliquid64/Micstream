'use strict';

var getUserMedia = navigator.getUserMedia ? 'getUserMedia' :
                   navigator.webkitGetUserMedia ? 'webkitGetUserMedia' :
                   navigator.mozGetUserMedia ? 'mozGetUserMedia' :
                   navigator.oGetUserMedia ? 'oGetUserMedia' :
                   navigator.msGetUserMedia ? 'msGetUserMedia' :
                   undefined;


function MicStream(mediaSocket, enableSend, enableRecv, enableCompression, enableDebug) {
	this.audioContext = window.AudioContext ? new window.AudioContext() :
                   window.webkitAudioContext ? new window.webkitAudioContext() :
                   window.mozAudioContext ? new window.mozAudioContext() :
                   window.oAudioContext ? new window.oAudioContext() :
                   window.msAudioContext ? new window.msAudioContext() :
                   undefined;

	this.wsAddr = mediaSocket;

	this.enableSend = enableSend;
	this.enableRecv = enableRecv;
	this.enableCompression = enableCompression;
	this.enableDebug = enableDebug;
	this.buffLength = 8192;		//at 44.1Khz
	this.wireBuffLength = 1520;	//at 8Khz (resampled for transmission)
	this.wireSampleRate = 8000;
	
	this.wsConnection = null;
	this.queuedAudio = [];		//Float32 audio buffers ready to be played immediately.
	this.micStream = null;		//pointer to microphone obtained by getUserMedia. Only set if enableSend is true.
	this.micStreamSourceNode = null;//pointer to microphone node. Only set if enableSend is true.
	this.liveAudioBuffer = null;	//web audio API node used to get/set live audio buffers.
	if (enableRecv){
		this.upsampler = new Resampler(this.wireSampleRate, this.audioContext.sampleRate, 1, this.buffLength);
	}
	if (enableSend){
		this.downsampler = new Resampler(this.audioContext.sampleRate, this.wireSampleRate, 1, this.wireBuffLength);
	}
	this.state = 0;
	this.networkInitialise();
};



//This is always called
MicStream.prototype.audioInit1 = function(){//Stage one -- connect to the mic if required, else it skips to stage 3
	this.state = 1;
	var _this = this, wrapMe = function(f){ return function(ev){ f.call(_this, ev); }; };
	if (this.enableSend){
		navigator[getUserMedia]({ audio: true }, wrapMe(this.audioInit2), wrapMe(this.audioInitErr));
	}else{
		if (this.enableDebug){
			console.log("Skipping Mic setup ...");
		}
		this.audioInit3();//no mic? Skip straight to stage three.
	}
};

MicStream.prototype.audioInit2 = function(micStream){//stage two -- setup the mic if required
	this.micStream = micStream;
	this.micStreamSourceNode = this.audioContext.createMediaStreamSource(this.micStream);
	this.audioInit3();
};

MicStream.prototype.audioInit3 = function(){//stage three -- hookup the audio API - always required.
	var _this = this, wrapMe = function(f){ return function(ev){ f.call(_this, ev); }; };
	this.liveAudioBuffer = this.audioContext.createScriptProcessor(this.buffLength, 1, 1);

	this.liveAudioBuffer.onaudioprocess = wrapMe(this.updateAudioEvent);
	if (this.enableSend){
		this.micStreamSourceNode.connect(this.liveAudioBuffer);
	}
	this.liveAudioBuffer.connect(this.audioContext.destination);
	this.state = 2;
	if (this.enableDebug){
		console.log("Audio ready.");
	}
};

MicStream.prototype.audioInitErr = function(err){
	if (this.enableDebug){
		console.log("Audio Init Err: ", err);
	}
	this.state = -3;
};





MicStream.prototype.updateAudioEvent = function(event){
	//if (this.enableDebug){
	//	console.log("UPDATE");
	//}

	if (this.enableSend){//if enabled, read from mic and transmit data
		var samples = this.downsample(event.inputBuffer.getChannelData(0));
		this.wsConnection.send(samples);
	}

	if (this.enableRecv){//if enabled, read from buffer and play queued audio.
		if (this.queuedAudio.length == 0) {
			if (this.enableDebug){
				console.log("Buffer miss!");
			}
			event.outputBuffer.getChannelData(0).set(new Float32Array(this.buffLength));
		}else{
			var b = this.queuedAudio.shift();//grab a chunk of audio data queued for playback.
			event.outputBuffer.getChannelData(0).set(new Float32Array(b));
		}
	}
};

MicStream.prototype.downsample = function(data){
	var samples = this.downsampler.resampler(data);
	var sampBuff = new Int16Array(samples.length);
	for (var i = 0; i < samples.length; ++i) {
		sampBuff[i] = Math.ceil(samples[i] * 32767);
	}
	return sampBuff;
};






MicStream.prototype.networkInitialise = function(){
	if (this.enableDebug){
		console.log("Opening connection to: " + this.wsAddr);
	}

	var _this = this, wrapMe = function(f){ return function(ev){ f.call(_this, ev); }; };
	this.wsConnection = new WebSocket(this.wsAddr);
	this.wsConnection.binaryType = 'arraybuffer';
	this.wsConnection.onopen = wrapMe(this.connectionOpenEvent);
	this.wsConnection.onmessage = wrapMe(this.connectionMsgEvent);
	this.wsConnection.onerror = wrapMe(this.connectionErrorEvent);
	this.wsConnection.onclose = wrapMe(this.connectionCloseEvent);

};

MicStream.prototype.connectionOpenEvent = function(event){//TODO: Check if the connection failed and abort
	if (this.enableDebug){
		console.log("Websocket opened:");
		console.log(event.data);
	}
	this.wsConnection.send(JSON.stringify({'Type':'hello','Name':"unnamed"}));
	this.audioInit1();
};

MicStream.prototype.connectionMsgEvent = function(event){
	if (typeof event.data == 'string') { //control message
		var msg = JSON.parse(event.data);
		if (this.enableDebug){
			console.log(event.data);
		}
	}else{ //audio data message
		if (this.enableRecv){//only bother processing incoming audio if we want it.
			var samples = this.upsample(event.data);
			this.queuedAudio.push(samples);//queue our chunk of audio for playback.
		}
	}
};

MicStream.prototype.connectionErrorEvent = function(event){
	if (this.enableDebug){
		console.log("Connection Error: ", event.data);
	}
	this.state = -1;
};


MicStream.prototype.connectionCloseEvent = function(event){
	if (this.enableDebug){
		console.log("Connection Closed: ", event.data);
	}
	this.state = -2;
};


MicStream.prototype.upsample = function(data){
	var input = new Int16Array(data);//wire format is int16
	var sampBuff = new Float32Array(input.length);
	for (var i = 0; i < input.length; ++i) {
		sampBuff[i] = input[i] / 32767.0;//first, convert from Int16 (wire) to Float32 (used by Audio API).
	}
	return this.upsampler.resampler(sampBuff);//actually upsample.
};








MicStream.prototype.IsErrState = function(){
	if(this.state < 0){
		return true;
	}
	return false;
};


MicStream.prototype.IsReady = function(){
	if(this.state == 2){
		return true;
	}
	return false;
};
