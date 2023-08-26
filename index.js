const electron = require('electron');
const Automate = require('./Backend/Automate');
const { app, BrowserWindow, ipcMain } = electron;
const axios = require('axios');

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
    },
    show: false,
  });
  mainWindow.maximize();
  global.user = { id: 1 };
  mainWindow.loadURL(`file://${__dirname}/Frontend/listing-executer.html`);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const browse = new Automate(); // Instantiate Automate class here

  ipcMain.on('facebook:login', (event, data) => {
    browse.login(data);
  });

  ipcMain.on("automate:scrapLink", (event, link, scrollDelay, listingDelay, operationDelay) => {
    if (browse) {
      browse.scrapeLink(link, listingDelay, scrollDelay, operationDelay, event);
    }
  });

  ipcMain.on("automate:scrapData", (event, link, scrollDelay, listingDelay, operationDelay) => {
    if (browse) {
      browse.scrapeMarketplaceData(link, listingDelay, scrollDelay, operationDelay, event);
    }
  });

  ipcMain.on('automate:stop', (event) => {
    if (browse) {
      browse.stop(event);
    }
  });

  ipcMain.on("scrapeLinkCompleted", (event) => {
    event.sender.send("action:completed");
  });

  ipcMain.on("scrapeDataCompleted", (event) => {
    event.sender.send("action:completed");
  });

  ipcMain.on("browserStopped", (event) => {
    event.sender.send("action:stopped");
  });
});
