package main

import (
	"encoding/json"
	"fmt"
	"github.com/clear-code/mcd-go"
	rotatelogs "github.com/lestrrat/go-file-rotatelogs"
	"github.com/lhside/chrome-go"
	"golang.org/x/sys/windows/registry"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
	Command          string        `json:"command"`
	Params           RequestParams `json:"params"`
	Logging          bool          `json:"logging"`
	LogRotationCount int           `json:"logRotationCount"`
	LogRotationTime  int           `json:"logRotationTime"`
	Debug            bool          `json:"debug"`
}

var DebugLogs []string
var Logging bool
var Debug bool

func main() {
	log.SetOutput(ioutil.Discard)

	rawRequest, err := chrome.Receive(os.Stdin)
	if err != nil {
		log.Fatal(err)
	}
	request := &Request{}
	if err := json.Unmarshal(rawRequest, request); err != nil {
		log.Fatal(err)
	}

	Logging = request.Logging
	Debug = request.Debug
	if Logging {
		logfileDir := os.ExpandEnv(`${temp}`)
		//
		logRotationTime := time.Duration(request.LogRotationTime) * time.Hour
		logRotationCount := request.LogRotationCount
		maxAge := time.Duration(-1)
		// for debugging
		//logRotationTime = time.Duration(request.LogRotationTime) * time.Minute
		rotateLog, err := rotatelogs.New(filepath.Join(logfileDir, "com.clear_code.ieview_we.log.%Y%m%d%H%M.txt"),
			rotatelogs.WithMaxAge(maxAge),
			rotatelogs.WithRotationTime(logRotationTime),
			rotatelogs.WithRotationCount(logRotationCount),
		)
		if err != nil {
			log.Fatal(err)
		}
		defer rotateLog.Close()

		log.SetOutput(rotateLog)
		log.SetFlags(log.Ldate | log.Ltime)
		LogForDebug("logRotationCount:" + fmt.Sprint(logRotationCount))
		LogForDebug("logRotationTime:" + fmt.Sprint(logRotationTime))
	}

	LogForDebug("Command is " + request.Command)
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

func LogForInfo(message string) {
	DebugLogs = append(DebugLogs, message)
	if Logging {
		log.Print(message + "\r\n")
	}
}

func LogForDebug(message string) {
	DebugLogs = append(DebugLogs, message)
	if Logging && Debug {
		log.Print(message + "\r\n")
	}
}

type LaunchResponse struct {
	Success bool     `json:"success"`
	Path    string   `json:"path"`
	Args    []string `json:"args"`
	Logs    []string `json:"logs"`
}

func Launch(path string, defaultArgs []string, url string) {
	args := []string{}
	replacedPlaceholder := false
	for _, arg := range defaultArgs {
		if arg == "%s" || arg == "%**" {
			args = append(args, url)
			replacedPlaceholder = true
		} else {
			args = append(args, arg)
		}
	}
	if !replacedPlaceholder {
		args = append(args, url)
	}
	command := exec.Command(path, args...)
	// "0x01000000" is the raw version of "CREATE_BREAKAWAY_FROM_JOB".
	// See also:
	//   https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Native_messaging#Closing_the_native_app
	//   https://msdn.microsoft.com/en-us/library/windows/desktop/ms684863(v=vs.85).aspx
	command.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x01000000}
	response := &LaunchResponse{true, path, args, DebugLogs}

	err := command.Start()
	if err != nil {
		LogForDebug("Failed to launch " + path)
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
	LogForInfo("Opened by external application: " + url)
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
		LogForDebug("Failed to open key " + keyPath)
		log.Fatal(err)
	}
	defer key.Close()

	path, _, err = key.GetStringValue("")
	if err != nil {
		LogForDebug("Failed to get value from key " + keyPath)
		log.Fatal(err)
	}
	return
}

type SendMCDConfigsResponse struct {
	IEApp             string   `json:"ieapp,omitempty"`
	IEArgs            string   `json:"ieargs,omitempty"`
	ForceIEList       string   `json:"forceielist,omitempty"`
	DisableForce      bool     `json:"disableForce,omitempty"`
	ContextMenu       bool     `json:"contextMenu,omitempty"`
	OnlyMainFrame     bool     `json:"onlyMainFrame,omitempty"`
	SitesOpenedBySelf string   `json:"sitesOpenedBySelf,omitempty"`
	DisableException  bool     `json:"disableException,omitempty"`
	IgnoreQueryString bool     `json:"ignoreQueryString,omitempty"`
	Logging           bool     `json:"logging,omitempty"`
	LogRotationCount  int64    `json:"logRotationCount,omitempty"`
	LogRotationTime   int64    `json:"logRotationTime,omitempty"`
	Debug             bool     `json:"debug,omitempty"`
	Logs              []string `json:"logs"`
}

func SendMCDConfigs() {
	configs, err := mcd.New()
	if len(mcd.DebugLogs) > 0 {
		LogForDebug("Logs from mcd:\n  " + strings.Join(mcd.DebugLogs, "\n  "))
	}
	if err != nil {
		LogForDebug("Failed to read MCD configs.\n" + err.Error())
		//log.Fatal(err)
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
	} else {
		LogForDebug("Failed to read extensions.ieview.disableForce.\n" + err.Error())
	}
	sitesOpenedBySelf, err := configs.GetStringValue("extensions.ieview.sitesOpenedBySelf")
	if err == nil {
		response.SitesOpenedBySelf = sitesOpenedBySelf
	}
	disableException, err := configs.GetBooleanValue("extensions.ieview.disableException")
	if err == nil {
		response.DisableException = disableException
	} else {
		LogForDebug("Failed to read extensions.ieview.disableException.\n" + err.Error())
	}
	contextMenu, err := configs.GetBooleanValue("extensions.ieview.contextMenu")
	if err == nil {
		response.ContextMenu = contextMenu
	} else {
		LogForDebug("Failed to read extensions.ieview.contextMenu.\n" + err.Error())
	}
	onlyMainFrame, err := configs.GetBooleanValue("extensions.ieview.onlyMainFrame")
	if err == nil {
		response.OnlyMainFrame = onlyMainFrame
	} else {
		LogForDebug("Failed to read extensions.ieview.onlyMainFrame.\n" + err.Error())
	}
	ignoreQueryString, err := configs.GetBooleanValue("extensions.ieview.ignoreQueryString")
	if err == nil {
		response.IgnoreQueryString = ignoreQueryString
	} else {
		LogForDebug("Failed to read extensions.ieview.ignoreQueryString.\n" + err.Error())
	}
	logging, err := configs.GetBooleanValue("extensions.ieview.logging")
	if err == nil {
		response.Logging = logging
	}
	logRotationCount, err := configs.GetIntegerValue("extensions.ieview.logRotationCount")
	if err == nil {
		response.LogRotationCount = logRotationCount
	}
	logRotationTime, err := configs.GetIntegerValue("extensions.ieview.logRotationTime")
	if err == nil {
		response.LogRotationTime = logRotationTime
	}
	debug, err := configs.GetBooleanValue("extensions.ieview.debug")
	if err == nil {
		response.Debug = debug
	} else {
		LogForDebug("Failed to read extensions.ieview.debug.\n" + err.Error())
	}

	if len(configs.DebugLogs) > 0 {
		LogForDebug("Logs from mcd configs:\n  " + strings.Join(configs.DebugLogs, "\n  "))
	}
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
