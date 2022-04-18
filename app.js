// Import package
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator')
const socketIO = require('socket.io')
const qrcode = require('qrcode');
const cors = require('cors')
const http = require('http')
const { phoneNumberFormatter } = require('./helpers/formatter')
const fileUpload = require('express-fileupload')
const axios = require('axios')

// Initialize
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Use Express
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(fileUpload({
    debug: true
}))
app.use(cors())

// Create client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
        ],
    }
});

// Routing
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname })
})

// Message trigger
client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    }
});

client.initialize();

// Socket.io
io.on('connection', function (socket) {
    socket.emit('message', 'Connecting...')

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url)
            socket.emit('message', 'QR code received, scan please!')
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'WhatsApp is ready!')
        socket.emit('message', 'WhatsApp is ready!')
    });

    client.on('authenticated', () => {
        socket.emit('authenticated', 'WhatsApp is authenticated!')
        socket.emit('message', 'WhatsApp is authenticated!')
        console.log('AUTHENTICATED');
    });

    client.on('auth_failure', msg => {
        console.error('AUTHENTICATION FAILURE', msg);
    });
});


const checkRegisteredNumber = async function (number) {
    const isRegistered = await client.isRegisteredUser(number)
    return isRegistered;
}

// Send message
app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req).formatWith(({ message }) => {
        return message;
    })

    if (!errors.isEmpty()) {
        return res.status(422).json({
            status: false,
            message: errors.mapped()
        })
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number)

    if (!isRegisteredNumber) {
        return res.status(422).json({
            status: false,
            messsage: 'The number is not registeredd'
        })
    }

    client.sendMessage(number, message)
        .then(response => {
            res.status(200).json({
                status: true,
                response: response
            })
        }).catch(err => {
            res.status(500).json({
                status: false,
                response: err
            })
        })
})

// Send media
app.post('/send-media', [
], async (req, res) => {
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const fileUrl = req.body.file;

    // const media = MessageMedia.fromFilePath('./img/images.jpg')
    // const file = req.files.file;
    // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);

    const attachment = await axios.get(fileUrl, { responseType: 'arraybuffer' })
        .then(response => {
            mimetype = response.headers['content-type'];
            return response.data.toString('base64')
        })
    
    const media = new MessageMedia(mimetype, attachment, 'Media');

    client.sendMessage(number, media, { caption: caption })
        .then(response => {
            res.status(200).json({
                status: true,
                response: response
            })
        }).catch(err => {
            res.status(500).json({
                status: false,
                response: err
            })
        })
})

server.listen(8000, function () {
    console.log('App running on 8000')
})