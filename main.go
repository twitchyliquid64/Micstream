package main

import (
	"github.com/hoisie/web"
	"voicecall"
)


func main() {
	voicecall.Register()
	web.Run("0.0.0.0:6162")
}
