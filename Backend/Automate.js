const puppeteer = require("puppeteer-extra");
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const locateChrome = require("locate-chrome");
const fs = require('fs');
const path = require("path");
const json2csv = require('json2csv').parse;
const { app } = require('electron');

class Automate {
  constructor() {
    this.lock = false;
    this.browser = null;
    this.page = null;
    this.stopped = false;
    this.logMessages = [];
  }

  async init() {
    // Initialization code if needed
  }

  async login(data) {
    this.lock = true;
    const chromePath = await locateChrome();
    console.log("Chromium path:", chromePath);
    puppeteer.use(StealthPlugin());

    this.browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--start-maximized',
        '--disable-infobars',
        '--disable-notifications',
        '--password-store=basic',
      ],
    });
    this.page = await this.browser.newPage();

    await this.page.goto("https://facebook.com/");
    try {
      await this.page.type("input[name='email']", data.username);
      await this.page.type("input[name='pass']", data.password);
      await this.page.waitForTimeout(3000);
      await this.page.click("button[name='login']");
      this.lock = false;
    } catch (error) {
      console.log("Already logged in");
      this.lock = true;
    }
  }

  async scrapeLink(links, listingDelay, scrollDelay, operationDelay, event) {
    if (this.lock) return;
    try {
      await this.page.goto(links, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Log the start of scraping
      this.onLogMessage('Waiting is over, starting to scrape...', 'status');
      this.sendLogsToUI(event);

      await this.page.waitForTimeout(listingDelay);
      await this.scrollPage(listingDelay, scrollDelay);

      // Log the progress of scraping
      this.onLogMessage('Scraping in progress...', 'status');
      this.sendLogsToUI(event);

      const Links = await this.extractLinkHrefs();

      const extractLink = [];
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.T]/g, '').slice(0, -5);

      for (const link of Links) {
        extractLink.push({ Link: link });
        this.onLogMessage('Link extracted: ' + link, 'operation');
        this.sendLogsToUI(event);
      }

      // Log the total scraped links
      this.onLogMessage('Total Scraped Links: ' + Links.length, 'status');
      this.sendLogsToUI(event);

      if (extractLink.length > 0) {
        const linkFileName = `Links${timestamp}.csv`;
        await this.write(Object.keys(extractLink), extractLink, linkFileName);
        event.sender.send('scrapeLinkCompleted');
      }
      this.onLogMessage('Scrap Link Save in Result Folder Successfully', 'status');
      this.sendLogsToUI(event);
      this.stop(event);
    } catch (error) {
      console.error('Error while scraping Link:', error);
      this.onLogMessage('Error while scraping Link: ' + error.message, 'status');
      this.sendLogsToUI(event);
      this.stop(event);
    }
  }


  async scrapeMarketplaceData(links, listingDelay, scrollDelay, operationDelay, event) {
    if (this.lock) return;
    try {
      await this.page.goto(links, {
        waitUntil: 'networkidle2',
        timeout: 40000
      });
      await this.page.waitForTimeout(listingDelay);
      await this.scrollPage(listingDelay, scrollDelay);
      this.onLogMessage('Waiting is over, starting to scrape...', "status");
      this.sendLogsToUI(event);

      const Links = await this.extractLinkHrefs();
      this.onLogMessage("Total Scraped Links:" + Links.length, "status")
      this.sendLogsToUI(event);

      let products = [];

      for (let i = 0; i < Links.length; i++) {
        this.onLogMessage(`Processing link ${i + 1} of ${Links.length}`, "operation")
        this.sendLogsToUI(event);



        if (!Links[i]) continue;
        await this.page.goto(Links[i], {
          waitUntil: 'networkidle2',
          timeout: 40000
        });
        await this.page.waitForTimeout(2000);

        const productName = await this.scrapeText(`//div[contains(@class, 'x1pi30zi')]/h1/span`);
        this.onLogMessage("Product Name:" + productName, "operation");
        this.sendLogsToUI(event);


        const productCondition = await this.scrapeText(`//span[@class='x1e558r4 xp4054r x3hqpx7']//span/span`);
        this.onLogMessage("Product Condition:" + productCondition, "operation");
        this.sendLogsToUI(event);


        const productDescription = await this.scrapeText(`//div[@class="xz9dl7a x4uap5 xsag5q8 xkhd6sd x126k92a"]//span`);
        this.onLogMessage("Product Description:" + productDescription, "operation");
        this.sendLogsToUI(event);


        const productPrice = await this.scrapeText(`//div[@class='x1xmf6yo']/div/span[contains(@class, 'x1s928wv ')]`);
        this.onLogMessage("Product Price:" + productPrice, "operation");
        this.sendLogsToUI(event);


        const productLocation = await this.scrapeText(`//div[@class="xu06os2 x1ok221b"]//span[contains(@class, 'x1nxh6w3 x1sibtaa')]/span`);
        this.onLogMessage("Product Location:" + productLocation, "operation");
        this.sendLogsToUI(event);


        products.push({
          ProductDescription: productDescription,
          ProductName: productName,
          ProductCondition: productCondition,
          ProductPrice: productPrice,
          ProductLocation: productLocation,
          ProductUrl: Links,
        });
      }
      // Generate a timestamp using new Date()
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.T]/g, '').slice(0, -5);
      if (products.length > 0) {
        const fileName = `Data${timestamp}.csv`;
        await this.write(Object.keys(products), products, fileName);
        this.onLogMessage("Scrap Data Save in Result Folder Successfully", "status")
        this.sendLogsToUI(event);

        event.sender.send("scrapeDataCompleted");
      }
      this.stop(event);
    } catch (error) {
      console.error("Error while scraping:", error);
      this.onLogMessage("Error while scraping Data:" + error.message, "status");
      this.sendLogsToUI(event);
    }
  }

  async extractLinkHrefs() {
    const linksElements = await this.page.$x(`//div[@class='x3ct3a4']//a[@role='link']`);
    const Links = await Promise.all(linksElements.map(async (link) => {
      const hrefProp = await link.getProperty("href");
      return hrefProp.jsonValue();
    }));
    return Links;
  }
  async scrapeText(xpath) {
    try {
      const [element] = await this.page.$x(xpath);
      return element ? await this.page.evaluate(el => el.textContent, element) : "";
    } catch (error) {
      return "";
    }
  }

  async scrollPage(listingDelay, scrollDelay) {
    for (let i = 0; i < scrollDelay; i++) {
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await this.page.waitForTimeout(listingDelay);
    }
  }

  async write(headersArray, dataJsonArray, fname) {
    // when make exe file (packed file ) use this write function to write the file to save file in the root dir of packed file 
    // const appRootDir = process.resourcesPath; // Get packed application root path
    //   const resultFolderPath = path.join(appRootDir, '..','Result'); // You can change 'Result' to 'Scrap Data' if needed
    //   const filename = path.join(resultFolderPath, fname);
    //   // Create the 'Result'folder if it doesn't exist
    //   if (!fs.existsSync(resultFolderPath)) {
    //     fs.mkdirSync(resultFolderPath);
    //   }

    const filename = path.join(__dirname, '..', `${fname}`);
    let rows;
    if (!fs.existsSync(filename)) {
      rows = json2csv(dataJsonArray, {
        header: true
      });
    } else {
      rows = json2csv(dataJsonArray, {
        header: false
      });
    }
    fs.appendFileSync(filename, rows);
    fs.appendFileSync(filename, "\r\n");
  }

  async stop(event) {
    if (this.browser) {
      this.stopped = true;
      await this.browser.close();
      this.onLogMessage("Browser stopped.", "status");
      this.sendLogsToUI(event);
    }
    event.sender.send("browserStopped");
  }

  onLogMessage(message, status, event) {
    this.logMessages.push({ message, status });
  }

  // Method to send log messages to the frontend and clear them
  sendLogsToUI(event) {
    const logMessageStringsWithStatus = this.logMessages.map(log => ({
      message: log.message,
      status: log.status
    }));
    this.logMessages = []; // Clear the log messages after sending
    event.sender.send("logMessageUpdate", logMessageStringsWithStatus);
  }
}

module.exports = Automate;