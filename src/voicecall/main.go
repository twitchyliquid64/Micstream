package voicecall


import (
	"github.com/gorilla/websocket"
	"github.com/hoisie/web"
	"log"
	"io/ioutil"
)

var allocatedIDs = 0
func id()int{
	allocatedIDs += 1;
	return allocatedIDs
}


type HelloPacket struct {
	Type string
	Name string
	Id int
}


func pageHandler(ctx *web.Context, name string){
	data, err := ioutil.ReadFile("static/test.html")
	if err != nil{
		log.Println(err)
		return
	}

	ctx.Write(data)
}

func mainWebsocketHandler(ctx *web.Context, name string) {
	var upgrader = websocket.Upgrader{
	    ReadBufferSize:  1024 * 5,
	    WriteBufferSize: 1024 * 5,
	}

	conn, err := upgrader.Upgrade(ctx, ctx.Request, nil)
	if err != nil {
		log.Println(err)
		return
	}

	connObj := &Connection{conn, name, "nil", id()}
	connObj.Start()
}


func Register() {
	web.Get("/connect/(.*)", mainWebsocketHandler)
	web.Get("/(.*)", pageHandler)
}
