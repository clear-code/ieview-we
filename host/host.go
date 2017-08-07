package main

import (
	"encoding/json"
	"github.com/clear-code/mcd-go"
	"github.com/lhside/chrome-go"
	"golang.org/x/sys/windows/registry"
	"log"
	"os"
	"os/exec"
	"syscall"
)

type RequestParams struct {
	// launch
	Path   string   `json:path`
	Args   []string `json:args`
	Url    string   `json:url`
	NoWait bool     `json:noWait`
}
type Request struct {
	Command string        `json:"command"`
	Params  RequestParams `json:"params"`
}

func main() {
	rawRequest, err := chrome.Receive(os.Stdin)
	if err != nil {
		log.Fatal(err)
	}
	request := &Request{}
	if err := json.Unmarshal(rawRequest, request); err != nil {
		log.Fatal(err)
	}

	switch command := request.Command; command {
	case "launch":
		Launch(request.Params.Path, request.Params.Args, request.Params.Url, request.Params.NoWait)
	case "get-ie-path":
		SendIEPath()
	case "read-mcd-configs":
		SendMCDConfigs()
	default: // just echo
		err = chrome.Post(rawRequest, os.Stdout)
		if err != nil {
			log.Fatal(err)
		}
	}
}

type LaunchResponse struct {
	Success bool     `json:"success"`
	Path    string   `json:"path"`
	Args    []string `json:"args"`
}

func Launch(path string, defaultArgs []string, url string, noWait bool) {
	args := append(defaultArgs, url)
	command := exec.Command(path, args...)
	response := &LaunchResponse{true, path, args}

	if noWait {
		command.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
		err := command.Start()
		if err != nil {
			log.Fatal(err)
			response.Success = false
		}
	} else {
		err := command.Run()
		if err != nil {
			log.Fatal(err)
			response.Success = false
		}
	}

	body, err := json.Marshal(response)
	if err != nil {
		log.Fatal(err)
	}
	err = chrome.Post(body, os.Stdout)
	if err != nil {
		log.Fatal(err)
	}
}

type SendIEPathResponse struct {
	Path string `json:"path"`
}

func SendIEPath() {
	path := GetIEPath()
	response := &SendIEPathResponse{path}
	body, err := json.Marshal(response)
	if err != nil {
		log.Fatal(err)
	}
	err = chrome.Post(body, os.Stdout)
	if err != nil {
		log.Fatal(err)
	}
}

func GetIEPath() (path string) {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE,
		`SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\iexplore.exe`,
		registry.QUERY_VALUE)
	if err != nil {
		log.Fatal(err)
	}
	defer key.Close()

	path, _, err = key.GetStringValue("")
	if err != nil {
		log.Fatal(err)
	}
	return
}

type SendMCDConfigsResponse struct {
	IEApp        string `json:"ieapp,omitempty"`
	IEArgs       string `json:"ieargs,omitempty"`
	NoWait       bool   `json:"noWait,omitempty"`
	ForceIEList  string `json:"forceielist,omitempty"`
	DisableForce bool   `json:"disableForce,omitempty"`
	ContextMenu  bool   `json:"contextMenu,omitempty"`
	Debug        bool   `json:"debug,omitempty"`
}

func SendMCDConfigs() {
	configs, err := mcd.New()
	if err != nil {
		log.Fatal(err)
	}

	response := &SendMCDConfigsResponse{}

	ieApp, err := configs.GetStringValue("extensions.ieview.ieapp")
	if err == nil {
		response.IEApp = ieApp
	}
	ieArgs, err := configs.GetStringValue("extensions.ieview.ieargs")
	if err == nil {
		response.IEArgs = ieArgs
	}
	noWait, err := configs.GetBooleanValue("extensions.ieview.noWait")
	if err == nil {
		response.NoWait = noWait
	}
	forceIEList, err := configs.GetStringValue("extensions.ieview.forceielist")
	if err == nil {
		response.ForceIEList = forceIEList
	}
	disableForce, err := configs.GetBooleanValue("extensions.ieview.disableForce")
	if err == nil {
		response.DisableForce = disableForce
	}
	contextMenu, err := configs.GetBooleanValue("extensions.ieview.contextMenu")
	if err == nil {
		response.ContextMenu = contextMenu
	}
	debug, err := configs.GetBooleanValue("extensions.ieview.debug")
	if err == nil {
		response.Debug = debug
	}

	body, err := json.Marshal(response)
	if err != nil {
		log.Fatal(err)
	}
	err = chrome.Post(body, os.Stdout)
	if err != nil {
		log.Fatal(err)
	}
}
