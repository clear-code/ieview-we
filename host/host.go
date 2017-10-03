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
	"time"
)

type RequestParams struct {
	// launch
	Path string   `json:path`
	Args []string `json:args`
	Url  string   `json:url`
}
type Request struct {
	Command string        `json:"command"`
	Params  RequestParams `json:"params"`
}

var DebugLogs []string

func main() {
	rawRequest, err := chrome.Receive(os.Stdin)
	if err != nil {
		DebugLogs = append(DebugLogs, "Failed to read message from stdin.")
		log.Fatal(err)
	}
	request := &Request{}
	if err := json.Unmarshal(rawRequest, request); err != nil {
		DebugLogs = append(DebugLogs, "Failed to parse message.")
		log.Fatal(err)
	}

	DebugLogs = append(DebugLogs, "Command is "+request.Command)
	switch command := request.Command; command {
	case "launch":
		Launch(request.Params.Path, request.Params.Args, request.Params.Url)
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
	Logs    []string `json:"logs"`
}

func Launch(path string, defaultArgs []string, url string) {
	args := append(defaultArgs, url)
	command := exec.Command(path, args...)
	// "0x01000000" is the raw version of "CREATE_BREAKAWAY_FROM_JOB".
	// See also:
	//   https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Native_messaging#Closing_the_native_app
	//   https://msdn.microsoft.com/en-us/library/windows/desktop/ms684863(v=vs.85).aspx
	command.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x01000000}
	response := &LaunchResponse{true, path, args, DebugLogs}

	err := command.Start()
	if err != nil {
		DebugLogs = append(DebugLogs, "Failed to launch "+path)
		log.Fatal(err)
		response.Success = false
	}
	// Wait until the launcher completely finishes.
	time.Sleep(3 * time.Second)

	response.Logs = DebugLogs
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
	Path string   `json:"path"`
	Logs []string `json:"logs"`
}

func SendIEPath() {
	path := GetIEPath()
	response := &SendIEPathResponse{path, DebugLogs}
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
	keyPath := `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\iexplore.exe`
	key, err := registry.OpenKey(registry.LOCAL_MACHINE,
		keyPath,
		registry.QUERY_VALUE)
	if err != nil {
		DebugLogs = append(DebugLogs, "Failed to open key "+keyPath)
		log.Fatal(err)
	}
	defer key.Close()

	path, _, err = key.GetStringValue("")
	if err != nil {
		DebugLogs = append(DebugLogs, "Failed to get value from key "+keyPath)
		log.Fatal(err)
	}
	return
}

type SendMCDConfigsResponse struct {
	IEApp        string   `json:"ieapp,omitempty"`
	IEArgs       string   `json:"ieargs,omitempty"`
	ForceIEList  string   `json:"forceielist,omitempty"`
	DisableForce bool     `json:"disableForce,omitempty"`
	ContextMenu  bool     `json:"contextMenu,omitempty"`
	Debug        bool     `json:"debug,omitempty"`
	Logs         []string `json:"logs"`
}

func SendMCDConfigs() {
	configs, err := mcd.New()
	DebugLogs = append(DebugLogs, mcd.DebugLogs...)
	if err != nil {
		DebugLogs = append(DebugLogs, "Failed to get MCD configs.")
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

	DebugLogs = append(DebugLogs, configs.DebugLogs...)
	response.Logs = DebugLogs
	body, err := json.Marshal(response)
	if err != nil {
		log.Fatal(err)
	}
	err = chrome.Post(body, os.Stdout)
	if err != nil {
		log.Fatal(err)
	}
}
