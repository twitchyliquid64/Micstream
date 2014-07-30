package voicecall

import (
	"github.com/gorilla/websocket"
	"log"
)

type Connection struct {
	conn *websocket.Conn
	roomName, connName string
	id int
}

func (inst *Connection)getID()int{
	return inst.id
}

func (inst *Connection)Start(){
	var pkt HelloPacket
	err := inst.conn.ReadJSON(&pkt)
	if err != nil {
		log.Println(err)
		return
	}
	inst.connName = pkt.Name
	inst.conn.WriteJSON(HelloPacket{"Start", inst.connName, inst.id})
	Attach(inst.roomName, inst)
	inst.mainloop()
}

func (inst *Connection)mainloop(){
	for {
		messageType, p, err := inst.conn.ReadMessage()
		if err != nil {
			log.Println("Closing: ", err)
			return
		}
		if messageType == websocket.BinaryMessage{
			Hubs[inst.roomName].Broadcast(inst.id, p)
		}	
	}
}

func (inst *Connection)Send(data []byte)error{
	if err := inst.conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
		return err
	}
	return nil
}
