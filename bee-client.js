const fetch = require('node-fetch')
const swarm = require('swarm-lowlevel')

const join = require('./asyncJoiner')

const chunkDataEndpoint = 'http://localhost:8080/bzz-chunk'

const toHex = byteArray => Array.from(byteArray, (byte) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('')

const uploadData = async (data) => {
    const chunks = []
    const chunkCallback = (chunk) => chunks.push(chunk)
    const hasher = new swarm.fileHasher(chunkCallback)
    const hash = hasher.Hash(data)
    for (const chunk of chunks) {
        const reference = toHex(chunk.reference)
        const data = Uint8Array.from([...chunk.span, ...chunk.data])
        console.log('uploadData', {chunk})
        await uploadChunkData(data, reference)
    }
    return hash
}

const uploadChunkData = async (data, hash) => {
    const options = {
        headers: {
            'Content-Type': 'binary/octet-stream',
        },
        method: 'POST',
        body: data,
    }
    const endpoint = `${chunkDataEndpoint}/${hash}`
    const response = await fetch(endpoint, options)
    if (!response.ok) {
        throw new Error('invalid response: ' + response.statusText)
    }
    // console.log('uploadChunk', response, response.headers)
    return hash
}

const downloadChunkData = async (hash) => {
    console.log('downloadSingleChunk', hash)
    const endpoint = `${chunkDataEndpoint}/${hash}`
    const response = await fetch(endpoint)
    if (!response.ok) {
        throw new Error(response.statusText)
    }
    // console.log('downloadChunk', response, response.headers)
    const bytes = await response.arrayBuffer()
    return bytes
}

const downloadChunks = async (hash) => {
    const chunks = []
    const totalSize = await join(hash, downloadChunkData, data => {
        console.log('outCallback', data)
        chunks.push(data)
    })
    return chunks
}

const mergeUint8Arrays = (arrays) => {
    const size = arrays.reduce((prev, curr) => prev + curr.length, 0)
    const r = new Uint8Array(size)
    let offset = 0
    for (const arr of arrays) {
        r.set(arr, offset)
        offset += arr.length
    }
    return r
}

const downloadData = async (hash) => {
    const chunks = await downloadChunks(hash)
    const buffers = chunks.map(chunk => chunk.data)
    return mergeUint8Arrays(buffers)
}

const testUploadAndDownload = async () => {
    const data = new Uint8Array(4096 * 8 + 1)
    const hash = await uploadData(data)
    const buffers = await downloadData(hash)
    console.log(buffers)
}

module.exports = {
    uploadData,
    downloadData,
    downloadChunkData,
    mergeUint8Arrays,
    toHex,
}
// testUploadAndDownload()
