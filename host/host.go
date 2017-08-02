package main

import (
  "os"
  "os/exec"
  "syscall"
  "log"
  "encoding/json"
  "golang.org/x/sys/windows/registry" 
  "github.com/lhside/chrome-go"
)

type RequestParams struct {
  // launch
  Path string   `json:path`
  Args []string `json:args`
  Url  string   `json:url`
  NoWait bool   `json:noWait`
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
  IEApp        string `json:"ieapp"`
  IEArgs       string `json:"ieargs"`
  NoWait       bool   `json:"noWait"`
  ForceIEList  string `json:"forceielist"`
  DisableForce bool   `json:"disableForce"`
  ContextMenu  bool   `json:"contextMenu"`
  Debug        bool   `json:"debug"`
}

func SendMCDConfigs() {
  response := &SendMCDConfigsResponse{}
  ReadLocalMCDConfigs(response)
  ReadRemoteMCDConfigs(response)
  body, err := json.Marshal(response)
  if err != nil {
    log.Fatal(err)
  }
  err = chrome.Post(body, os.Stdout)
  if err != nil {
    log.Fatal(err)
  }
}

func ReadLocalMCDConfigs(response SendMCDConfigsResponse) {
}

func ReadRemoteMCDConfigs(response SendMCDConfigsResponse) {
}

