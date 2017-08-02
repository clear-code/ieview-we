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
  "github.com/robertkrimen/otto"
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
  Undefineds   []string `json:"undefineds"`
}

func ReadConfigStringValue(vm *otto.Otto, key string) (stringValue string, err error) {
  value, err := vm.Run("getPref('" + key + "')")
  stringValue, err = value.ToString();
  if stringValue == "undefined" {
    return "", errors.New("unknown pref: " + key)
  }
  return stringValue, nil
}
func ReadConfigIntegerValue(vm *otto.Otto, key string) (integerValue int64, err error) {
  value, err := vm.Run("getPref('" + key + "')")
  stringValue, err := value.ToString();
  if stringValue == "undefined" {
    return 0, errors.New("unknown pref: " + key)
  }
  integerValue, err = value.ToInteger();
  if err != nil {
    return 0, err
  }
  return integerValue, nil
}
func ReadConfigBooleanValue(vm *otto.Otto, key string) (booleanValue bool, err error) {
  value, err := vm.Run("getPref('" + key + "')")
  stringValue, err := value.ToString();
  if stringValue == "undefined" {
    return false, errors.New("unknown pref: " + key)
  }
  booleanValue, err = value.ToBoolean();
  if err != nil {
    return false, err
  }
  return booleanValue, nil
}

func SendMCDConfigs() {
  local := ReadLocalMCDConfigs()
  remote := ReadRemoteMCDConfigs()

  vm := otto.New()
  vm.Set("getenv", func(call otto.FunctionCall) otto.Value {
    name := call.Argument(0).String()
    result, _ := vm.ToValue(os.ExpandEnv("${" + name + "}"))
    return result
  })
  // See also https://dxr.mozilla.org/mozilla-central/source/extensions/pref/autoconfig/src/prefcalls.js
  _, err := vm.Run(`
    var $$defaultPrefs = {};
    var $$prefs = {};
    function pref(key, value) {
      $$prefs[key] = value;
    }
    function defaultPref(key, value) {
      $$defaultPrefs[key] = value;
    }
    function lockPref(key, value) {
      delete $$prefs[key];
      $$defaultPrefs[key] = value;
    }
    function clearPref(key) {
      delete $$prefs[key];
    }
    function getPref(key) {
      if (key in $$prefs)
        return $$prefs[key];
      if (key in $$defaultPrefs)
        return $$defaultPrefs[key];
      return undefined;
    }
    function unlockPref(key) {
    }
    var Components = {
      classes: {},
      interfaces: {},
      utils: {}
    };
  ` + local + "\n" + remote)
  if err != nil {
    log.Fatal(err)
  }

  response := &SendMCDConfigsResponse{}

  ieApp, err := ReadConfigStringValue(vm, "extensions.ieview.ieapp")
  if err == nil { response.IEApp = ieApp } else { response.Undefineds = append(response.Undefineds, "ieapp") }
  ieArgs, err := ReadConfigStringValue(vm, "extensions.ieview.ieargs")
  if err == nil { response.IEArgs = ieArgs } else { response.Undefineds = append(response.Undefineds, "ieargs") }
  noWait, err := ReadConfigBooleanValue(vm, "extensions.ieview.noWait")
  if err == nil { response.NoWait = noWait } else { response.Undefineds = append(response.Undefineds, "noWait") }
  forceIEList, err := ReadConfigStringValue(vm, "extensions.ieview.forceielist")
  if err == nil { response.ForceIEList = forceIEList } else { response.Undefineds = append(response.Undefineds, "forceielist") }
  disableForce, err := ReadConfigBooleanValue(vm, "extensions.ieview.disableForce")
  if err == nil { response.DisableForce = disableForce } else { response.Undefineds = append(response.Undefineds, "disableForce") }
  contextMenu, err := ReadConfigBooleanValue(vm, "extensions.ieview.contextMenu")
  if err == nil { response.ContextMenu = contextMenu } else { response.Undefineds = append(response.Undefineds, "contextMenu") }
  debug, err := ReadConfigBooleanValue(vm, "extensions.ieview.debug")
  if err == nil { response.Debug = debug } else { response.Undefineds = append(response.Undefineds, "debug") }

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

