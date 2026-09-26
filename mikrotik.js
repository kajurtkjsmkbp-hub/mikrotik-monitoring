const net = require('net');
const crypto = require('crypto');

class MikrotikClient {
    constructor(host, port = 8728, user = 'admin', password = '') {
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.socket = null;
        this.connected = false;
        this.loggedIn = false;
        this.buffer = Buffer.alloc(0);
        this.currentSentence = [];
        this.pendingSentences = [];
        this.sentenceWaiters = [];
    }

    encodeLength(len) {
        if (len < 0x80) {
            return Buffer.from([len]);
        } else if (len < 0x4000) {
            const val = len | 0x8000;
            return Buffer.from([(val >> 8) & 0xff, val & 0xff]);
        } else if (len < 0x200000) {
            const val = len | 0xc00000;
            return Buffer.from([(val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff]);
        } else if (len < 0x10000000) {
            const val = len | 0xe0000000;
            return Buffer.from([(val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff]);
        } else {
            const buf = Buffer.alloc(5);
            buf[0] = 0xf0;
            buf.writeUInt32BE(len, 1);
            return buf;
        }
    }

    _onData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this._parseBuffer();
    }

    _parseBuffer() {
        while (this.buffer.length > 0) {
            const firstByte = this.buffer[0];
            if (firstByte === 0) {
                // End of sentence
                this.buffer = this.buffer.slice(1);
                const s = this.currentSentence;
                this.currentSentence = [];
                if (this.sentenceWaiters.length > 0) {
                    const waiter = this.sentenceWaiters.shift();
                    waiter.resolve(s);
                } else {
                    this.pendingSentences.push(s);
                }
                continue;
            }

            let length = 0;
            let lenBytes = 0;

            if ((firstByte & 0x80) === 0x00) {
                length = firstByte;
                lenBytes = 1;
            } else if ((firstByte & 0xc0) === 0x80) {
                if (this.buffer.length < 2) return;
                length = ((this.buffer[0] & ~0xc0) << 8) + this.buffer[1];
                lenBytes = 2;
            } else if ((firstByte & 0xe0) === 0xc0) {
                if (this.buffer.length < 3) return;
                length = ((this.buffer[0] & ~0xe0) << 16) + (this.buffer[1] << 8) + this.buffer[2];
                lenBytes = 3;
            } else if ((firstByte & 0xf0) === 0xe0) {
                if (this.buffer.length < 4) return;
                length = ((this.buffer[0] & ~0xf0) << 24) + (this.buffer[1] << 16) + (this.buffer[2] << 8) + this.buffer[3];
                lenBytes = 4;
            } else if (firstByte === 0xf0) {
                if (this.buffer.length < 5) return;
                length = this.buffer.readUInt32BE(1);
                lenBytes = 5;
            }

            if (this.buffer.length < lenBytes + length) {
                return; // Wait for more chunks
            }

            const wordBuf = this.buffer.slice(lenBytes, lenBytes + length);
            this.buffer = this.buffer.slice(lenBytes + length);
            this.currentSentence.push(wordBuf.toString('utf-8'));
        }
    }

    sendSentence(words) {
        if (!this.socket || !this.connected) {
            throw new Error('Socket not connected');
        }
        const chunks = [];
        for (const w of words) {
            const strBuf = Buffer.from(w, 'utf-8');
            chunks.push(this.encodeLength(strBuf.length));
            chunks.push(strBuf);
        }
        chunks.push(Buffer.from([0x00])); // End of sentence
        this.socket.write(Buffer.concat(chunks));
    }

    readSentence(timeoutMs = 10000) {
        if (this.pendingSentences.length > 0) {
            return Promise.resolve(this.pendingSentences.shift());
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = this.sentenceWaiters.findIndex(w => w.resolve === resolve);
                if (idx !== -1) this.sentenceWaiters.splice(idx, 1);
                reject(new Error('Read timeout'));
            }, timeoutMs);

            this.sentenceWaiters.push({
                resolve: (res) => {
                    clearTimeout(timer);
                    resolve(res);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                }
            });
        });
    }

    async readCommandResult(timeoutMs = 10000) {
        const results = [];
        while (true) {
            const sentence = await this.readSentence(timeoutMs);
            if (!sentence || sentence.length === 0) continue;
            const replyType = sentence[0];
            if (replyType === '!done') {
                break;
            } else if (replyType === '!re') {
                const item = {};
                for (let i = 1; i < sentence.length; i++) {
                    const w = sentence[i];
                    if (w.startsWith('=')) {
                        const eqIdx = w.indexOf('=', 1);
                        if (eqIdx !== -1) {
                            const key = w.slice(1, eqIdx);
                            const val = w.slice(eqIdx + 1);
                            item[key] = val;
                        } else {
                            item[w.slice(1)] = '';
                        }
                    }
                }
                results.push(item);
            } else if (replyType === '!trap') {
                let msg = 'RouterOS Error';
                for (let i = 1; i < sentence.length; i++) {
                    if (sentence[i].startsWith('=message=')) {
                        msg = sentence[i].slice(9);
                    }
                }
                throw new Error(msg);
            } else if (replyType === '!fatal') {
                this.disconnect();
                throw new Error('RouterOS Fatal Error: ' + sentence.join(' '));
            }
        }
        return results;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.disconnect();
            this.buffer = Buffer.alloc(0);
            this.currentSentence = [];
            this.pendingSentences = [];
            this.sentenceWaiters = [];

            this.socket = new net.Socket();
            this.socket.setTimeout(10000);

            this.socket.on('data', (chunk) => this._onData(chunk));

            this.socket.connect(this.port, this.host, () => {
                this.connected = true;
                resolve();
            });

            this.socket.on('error', (err) => {
                this.connected = false;
                this.loggedIn = false;
                while (this.sentenceWaiters.length > 0) {
                    const w = this.sentenceWaiters.shift();
                    w.reject(err);
                }
                reject(err);
            });

            this.socket.on('timeout', () => {
                this.disconnect();
                reject(new Error('Connection timed out'));
            });

            this.socket.on('close', () => {
                this.connected = false;
                this.loggedIn = false;
                while (this.sentenceWaiters.length > 0) {
                    const w = this.sentenceWaiters.shift();
                    w.reject(new Error('Socket closed'));
                }
            });
        });
    }

    async login() {
        if (!this.connected) {
            await this.connect();
        }

        this.sendSentence(['/login', `=name=${this.user}`, `=password=${this.password}`]);
        const sentence = await this.readSentence();
        if (sentence[0] === '!done') {
            const ret = sentence.find(w => w.startsWith('=ret='));
            if (ret) {
                const chalHex = ret.slice(5);
                const chal = Buffer.from(chalHex, 'hex');
                const md5 = crypto.createHash('md5');
                md5.update(Buffer.concat([Buffer.from([0x00]), Buffer.from(this.password, 'utf-8'), chal]));
                const response = '00' + md5.digest('hex');
                this.sendSentence(['/login', `=name=${this.user}`, `=response=${response}`]);
                const authResp = await this.readSentence();
                if (authResp[0] !== '!done') {
                    throw new Error('Authentication failed (challenge)');
                }
            }
            this.loggedIn = true;
            return true;
        } else if (sentence[0] === '!trap') {
            let msg = 'Authentication failed';
            const msgWord = sentence.find(w => w.startsWith('=message='));
            if (msgWord) msg = msgWord.slice(9);
            throw new Error(msg);
        } else {
            throw new Error('Unexpected login response: ' + sentence[0]);
        }
    }

    async query(command, params = []) {
        if (!this.loggedIn) {
            await this.login();
        }
        const words = [command];
        for (const p of params) {
            words.push(p);
        }
        this.sendSentence(words);
        return await this.readCommandResult();
    }

    disconnect() {
        if (this.socket) {
            try {
                this.socket.removeAllListeners();
                this.socket.destroy();
            } catch (e) {}
            this.socket = null;
        }
        this.connected = false;
        this.loggedIn = false;
    }
}

module.exports = MikrotikClient;
