const express = require('express')
const bodyParser = require('body-parser')
const serveStatic = require('serve-static')
const fs = require('fs')
const path = require('path')
const formidableMiddleware = require('express-formidable');

const bee = require('./bee-client')

const LISTEN_PORT = 3001
const LISTEN_HOST = '127.0.0.1'

const app = express()
app.use(formidableMiddleware())

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.all('*', function (req, resp, next) {
    console.log(req.url)
    next()
})

app.post('/bzz:/', async (req, res) => {
    try {
        console.log('bzz upload', req.headers, req.fields, req.files)
        const fileData = fs.readFileSync(req.files.file.path)
        const hash = await bee.uploadData(fileData)
        res.status(200).send(hash)
    } catch (e) {
        console.error(e)
        res.status(400).send('invalid request')
    }
})

app.get(/\/bzz:\/([0-9a-f]{64})(\/.*)?/, async (req, res) => {
    try {
        console.log('bzz download', req.headers, req.params)
        const hash = req.params[0]
        const path = req.params[1]
        const data = await bee.downloadData(hash)
        res.status(200).send(Buffer.from(data))
    } catch (e) {
        console.error(e)
        res.status(400).send('invalid request')
    }
})

app.get('/', (req, res) => {
    res.status(200).sendFile(path.join(__dirname, './public', 'index.html'))
})

app.get('/bzz-tag:/', (req, res) => {
    res.status(200).send('0')
})

app.use('/static', express.static('public'))

app.listen(LISTEN_PORT, LISTEN_HOST, () => console.log('listening on port ' + LISTEN_PORT));
