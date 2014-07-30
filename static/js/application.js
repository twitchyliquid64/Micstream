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


var micstream = new MicStream(workOutWSURI() +"/connect/testconn", false, true, true, true);
