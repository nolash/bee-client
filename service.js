const express = require('express')
const fs = require('fs')
const path = require('path')
const util = require('util')
const formidableMiddleware = require('express-formidable');
const collection = require('./collection')
const bee = require('./bee-client')

const LISTEN_PORT = 3001
const LISTEN_HOST = '127.0.0.1'

const app = express()
app.use(formidableMiddleware({multiples: true}))

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next()
});

app.all('*', function (req, resp, next) {
    console.log(req.url)
    next()
})

const readFileAsync = util.promisify(fs.readFile)

const addFile = async (file, hashCollection, indexCollection) => {
    const fileData = await readFileAsync(file.path)
    const hash = await bee.uploadData(fileData)
    const index = hashCollection.add(hash)
    indexCollection.add({
        filename: file.name,
        mimetype: file.type,
    }, index)
}

app.post('/bzz:/', async (req, res) => {
    try {
        console.log('bzz upload', req.headers, req.fields, req.files)
        const hashCollection = new collection.Collection()
        const indexCollection = new collection.CollectionIndex("manifest")
        if (Array.isArray(req.files.files)) {
            for (const file of req.files.files) {
                await addFile(file, hashCollection, indexCollection)
            }
        } else {
            await addFile(req.files.file, hashCollection, indexCollection)
        }
        const serializedCollection = hashCollection.serialize()
        const collectionHash = await bee.uploadData(serializedCollection)
        const serializedIndex = indexCollection.serialize()
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

const getPath = (paramPath) => {
    return paramPath.replace('/', '')
}


const td = (inner) => `<td>${inner}</td>`

const entryToTableRow = (entry) =>
    `<tr>
        ${td(`<a href='${entry.link}'>${entry.filename}</a>`)}
        ${td(entry.size)}
        ${td(entry.mimetype || '')}
    </tr>`

const generateHTML = (title, entries) => {
    return `<html><h1>${title}</h1><table>${entries.map(entryToTableRow).join('')}</table></html>`
}

const getEntrySize = async (entry) => {
    if (entry.hash == null) {
        return '&lt;DIR&gt;'
    }
    const chunk = await bee.downloadChunkData(bee.toHex(entry.hash))
    return Buffer.from(chunk.slice(0, 8)).readBigUInt64LE()
}

const makeLinkFromEntry = (entry, path, hash) => {
    return entry.hash == null
    ? `/bzz:/${hash}${path}${entry.filename}/`
    : `/bzz:/${hash}${path}${entry.filename}`
}

app.get(/\/bzz:\/([0-9a-f]{64})(\/.*)?/, async (req, res) => {
    try {
        console.log('bzz download', req.headers, req.params)
        const manifestHashHex = req.params[0]
        if (req.params[1] == null) {
            res.redirect(req.params[0] + '/')
            return
        }
        if (req.params[1].endsWith('/')) {
            const path = req.params[1]
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
            const entries = []
            const manifestAdapter = new collection.SimpleManifestAdapter(sc, si)
            for (const entry of manifestAdapter.list(path)) {
                console.log({entry})
                const size = await getEntrySize(entry)
                const link = makeLinkFromEntry(entry, path, manifestHashHex)
                entries.push({
                    ...entry,
                    link,
                    size,
                })
            }
            const title = `Listing of ${path}`
            const html = generateHTML(title, entries)
            res.status(200).type('html').send(Buffer.from(html))
        } else {
            const path = getPath(req.params[1])
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
        }
    } catch (e) {
        console.error(e)
        res.status(400).send('invalid request')
    }
})

app.get('/', (req, res) => {
    res.status(200).sendFile(path.join(__dirname, './public', 'index.html'))
})

app.get('/bzz-tag:/', (req, res) => {
    console.log('tag', req.params, req.query)
    res.status(200).send('0')
})

app.use('/static', express.static('public'))

app.listen(LISTEN_PORT, LISTEN_HOST, () => console.log('listening on port ' + LISTEN_PORT))
