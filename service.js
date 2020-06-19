const express = require('express')
const bodyParser = require('body-parser')
const serveStatic = require('serve-static')
const fs = require('fs')
const path = require('path')
const formidableMiddleware = require('express-formidable');
const collection = require('./collection')


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
        const c = new collection.Collection()
        c.add(hash)
        const serializedCollection = c.serialize()
        const collectionHash = await bee.uploadData(serializedCollection)
        const index = new collection.CollectionIndex("manifest")
        index.add({
            filename: req.files.file.name,
            mimetype: req.files.file.type,
        }, 0);
        const serializedIndex = index.serialize()
        const indexHash = await bee.uploadData(serializedIndex)
        const manifest = new collection.Collection()
        manifest.add(collectionHash)
        manifest.add(indexHash)
        const serializedManifest = manifest.serialize()
        const manifestHash = await bee.uploadData(serializedManifest)
        res.status(200).send(bee.toHex(manifestHash))
    } catch (e) {
        console.error(e)
        res.status(400).send('invalid request')
    }
})

app.get(/\/bzz:\/([0-9a-f]{64})(\/.*)?/, async (req, res) => {
    try {
        console.log('bzz download', req.headers, req.params)
        const manifestHashHex = req.params[0]
        const path = req.params[1].replace('/', '')
        const serializedManifest = await bee.downloadData(manifestHashHex)
        const manifestCollection = new collection.Collection()
        if (manifestCollection.deserialize(serializedManifest) == false) {
            throw new Error('invalid manifest')
        }
        const collectionHash = manifestCollection.hashes[0]
        const indexHash = manifestCollection.hashes[1]

        const serializedCollection = await bee.downloadData(bee.toHex(collectionHash))
        const sc = new collection.Collection()
        if (sc.deserialize(serializedCollection) == false) {
            throw new Error('invalid collection')
        }
        const serializedIndex = await bee.downloadData(bee.toHex(indexHash))
        const si = new collection.CollectionIndex()
        if (si.deserialize(serializedIndex) == false) {
            throw new Error('invalid index')
        }
        const manifestAdapter = new collection.SimpleManifestAdapter(sc, si)
        const fileHash = manifestAdapter.getReference(path)
        const mimeType = manifestAdapter.getMimetype(path)
        console.log({fileHash})
        const fileData = await bee.downloadData(bee.toHex(fileHash))
        res.status(200).type(mimeType).send(Buffer.from(fileData))
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
