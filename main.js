const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('use-gl', 'swiftshader')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-software-rasterizer')

let mainWindow
let server

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadURL('http://localhost:3000')
}

app.whenReady().then(() => {

  server = spawn('node', ['server.js'], {
    cwd: __dirname,
    shell: true,
    windowsHide: true
  })

  server.stdout.on('data', data => console.log(data.toString()))
  server.stderr.on('data', data => console.error(data.toString()))

  setTimeout(createWindow, 4000)
})

app.on('window-all-closed', () => {
  if (server) server.kill()
  if (process.platform !== 'darwin') app.quit()
})