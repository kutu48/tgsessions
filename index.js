require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs');
const path = require('path');

class TelegramSessionManager {
    constructor() {
        this.apiId = parseInt(process.env.API_ID);
        this.apiHash = process.env.API_HASH;
        this.deviceModel = process.env.DEVICE_MODEL || 'GenericDevice';
        this.sessionPath = path.join(__dirname, 'session');
        this.dataPath = path.join(__dirname, 'data.txt');
    }

    log(message) {
        console.log(message);
    }

    async createSession(phoneNumber, sessionName) {
        try {
            if (typeof this.apiId !== 'number' || typeof this.apiHash !== 'string') {
                throw new Error('Invalid API credentials');
            }

            const client = new TelegramClient(
                new StringSession(""),
                this.apiId,
                this.apiHash,
                {
                    deviceModel: this.deviceModel,
                    connectionRetries: 5
                }
            );
            await client.start({
                phoneNumber: async () => phoneNumber,
                password: async () => await input.text('Enter your password: '),
                phoneCode: async () => await input.text('Enter the code you received: '),
                onError: err => {
                    if (!err.message.includes('TIMEOUT') && !err.message.includes('CastError')) {
                        this.log(`Telegram authentication error: ${err.message}`.red);
                    }
                },
            });
            this.log('Successfully created a new session!'.green);
            const stringSession = client.session.save();
            const sessionId = sessionName || new Date().getTime();
            if (!fs.existsSync(this.sessionPath)) {
                fs.mkdirSync(this.sessionPath);
            }
            fs.writeFileSync(path.join(this.sessionPath, `session_${sessionId}.session`), stringSession);
            await client.sendMessage("me", { message: "Successfully created a new session!" });
            this.log('Saved the new session to session file.'.green);
            await client.disconnect();
        } catch (error) {
            if (!error.message.includes('TIMEOUT') && !error.message.includes('CastError')) {
                this.log(`Error: ${error.message}`.red);
            }
        }
    }

    async retrieveNewQueryData(sessionFile) {
        const sessionFilePath = path.join(this.sessionPath, `${sessionFile}`);
        try {
            const sessionString = fs.readFileSync(sessionFilePath, 'utf8');
            const client = new TelegramClient(
                new StringSession(sessionString),
                this.apiId,
                this.apiHash,
                {
                    deviceModel: this.deviceModel,
                    connectionRetries: 5
                }
            );
            await client.start({
                phoneNumber: async () => sessionFile,
                password: async () => await input.text('Enter your password: '),
                phoneCode: async () => await input.text('Enter the code you received: '),
                onError: err => {
                    if (!err.message.includes('TIMEOUT') && !err.message.includes('CastError')) {
                        this.log(`Telegram authentication error: ${err.message}`.red);
                    }
                },
            });
            try {
                const peer = await client.getInputEntity('OKX_official_bot');
                if (!peer) {
                    this.log('Failed to get peer entity.'.red);
                    return;
                }
                const webview = await client.invoke(
                    new Api.messages.RequestWebView({
                        peer: peer,
                        bot: peer,
                        fromBotMenu: false,
                        platform: 'Android',
                        url: "https://www.okx.com/",
                    })
                );
                if (!webview || !webview.url) {
                    this.log('Failed to get webview URL.'.red);
                    return;
                }
                const query = decodeURIComponent(webview.url.split("&tgWebAppVersion=")[0].split("#tgWebAppData=")[1]);
                const currentData = fs.readFileSync(this.dataPath, 'utf8').split('\n').filter(Boolean);

                if (!currentData.includes(query)) {
                    fs.appendFileSync(this.dataPath, `${query}\n`);
                    this.log("Saved new query to data.txt".green);
                } else {
                    this.log("Query already exists in data.txt, skipping save.".yellow);
                }
            } catch (e) {
                this.log(`Error retrieving query data: ${e.message}`.red);
            } finally {
                await client.disconnect();
            }
        } catch (error) {
            if (!error.message.includes('TIMEOUT') && !error.message.includes('CastError')) {
                this.log(`Error: ${error.message}`.red);
            }
        }
    }

    extractUserData(queryId) {
        const urlParams = new URLSearchParams(queryId);
        const userParam = urlParams.get('user');
        if (!userParam) {
            throw new Error(`Invalid queryId: ${queryId}`);
        }
        const user = JSON.parse(decodeURIComponent(userParam));
        return {
            extUserId: user.id,
            extUserName: user.username
        };
    }
}

(async () => {
    const sessionManager = new TelegramSessionManager();
    const phoneNumber = await input.text('Enter your phone number: ');
    const sessionName = await input.text('Enter session name (optional): ');
    await sessionManager.createSession(phoneNumber, sessionName);
    
    const sessionFile = await input.text('Enter the session file name to retrieve data from: ');
    await sessionManager.retrieveNewQueryData(sessionFile);
    
    const queryId = await input.text('Enter the queryId to extract user data from: ');
    const userData = sessionManager.extractUserData(queryId);
    console.log(`Extracted User Data:`, userData);
})();
