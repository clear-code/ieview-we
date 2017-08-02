package main

import (
  "log"
  "errors"
  "os"
  "os/exec"
  "syscall"
  "unicode/utf16"
  "unsafe"
  "path/filepath"
  "io/ioutil"
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
  Configs string `json:"configs"`
}

func SendMCDConfigs() {
  local := ReadLocalMCDConfigs()
  remote := ReadRemoteMCDConfigs()
  response := &SendMCDConfigsResponse{local + remote}
  body, err := json.Marshal(response)
  if err != nil {
    log.Fatal(err)
  }
  err = chrome.Post(body, os.Stdout)
  if err != nil {
    log.Fatal(err)
  }
}

func ReadLocalMCDConfigs() (configs string) {
  path, err := GetLocalMCDPath()
  if err != nil {
    return ""
  }
  buffer, err := ioutil.ReadFile(path)
  if err != nil {
    return ""
  }
  return string(buffer)
}

func GetLocalMCDPath() (path string, err error) {
  exePath, err := GetPathToRunningApp()
  if err != nil {
    return "", err
  }
  //TODO: We should detect the effective file.
  // Currently we return the first one always.
  pattern := filepath.Join(filepath.Dir(exePath), "*.cfg")
  path, err = GetFirstMatchedFile(pattern)
  return
}

func GetFirstMatchedFile(pattern string) (path string, err error) {
  possibleFiles, err := filepath.Glob(pattern)
  if err != nil {
    return "", err
  }
  if len(possibleFiles) == 0 {
    return "", errors.New("no match")
  }
  return possibleFiles[0], nil
}

const PROCESS_VM_READ = 1 << 4

func GetPathToRunningApp() (path string, err error) {
  parentId := os.Getppid()
  inheritHandle := false
  processHandle, err := syscall.OpenProcess(syscall.PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, inheritHandle, uint32(parentId))
  defer syscall.CloseHandle(processHandle)
  if err != nil {
    return "", err
  }
  getModuleFileNameEx := syscall.MustLoadDLL("psapi.dll").MustFindProc("GetModuleFileNameExW")
  buffer := make([]uint16, syscall.MAX_PATH)
  bufferSize := uint32(len(buffer))
  rawLength, _, err := getModuleFileNameEx.Call(uintptr(processHandle), 0, uintptr(unsafe.Pointer(&buffer[0])), uintptr(bufferSize))
  length := uint32(rawLength)
  if length == 0 {
    return "", errors.New("failed to get the path of the application")
  }
  return string(utf16.Decode(buffer[0:length])), nil
}

func ReadRemoteMCDConfigs() (configs string) {
  // codes to read failover.jsc in the profile
  path, err := GetFailoverJscPath()
  if err != nil {
    return ""
  }
  buffer, err := ioutil.ReadFile(path)
  if err != nil {
    return ""
  }
  return string(buffer)
}

func GetFailoverJscPath() (path string, err error) {
  //TODO: We should detect the actually used profile directory.
  // Currently we return the default profile.
  pattern := os.ExpandEnv(`${AppData}\Mozilla\Firefox\Profiles\*.default\failover.jsc`)
  path, err = GetFirstMatchedFile(pattern)
  if path != "" {
    return
  }
  pattern = os.ExpandEnv(`${AppData}\Mozilla\Firefox\Profiles\*\failover.jsc`)
  path, err = GetFirstMatchedFile(pattern)
  return
}

