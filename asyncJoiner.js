const swarm = require('swarm-lowlevel')

const toHex = byteArray => Array.from(byteArray, (byte) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('')

async function getByHash(hash, inCallback) {
    let buf = await inCallback(hash);
    let view = new DataView(buf);
    let size = view.getUint32(0, true);
    return {
        size: size,
        buf: buf.slice(8, buf.length),
    };
}

async function join(hash, inCallback, outCallback) {
    try {
        const { size, buf } = await getByHash(hash, inCallback);
        return await retrieve({
            level: 0,
            size,
            hash,
            buf,
            inCallback,
            outCallback,
            offset: 0,
        }); // here level 0 is root
    } catch (e) {
        throw e
    }
}

async function retrieve({ level, size, hash, buf, inCallback, outCallback, offset }) {
    if (size <= swarm.chunkSize) {
        outCallback({
            offset,
            total: size,
            reference: hash,
            data: new Uint8Array(buf),
        });
        return size;
    }
    for (let i = 0; i < buf.byteLength; i += swarm.sectionSize) {
        let newHash = buf.slice(i, i + swarm.sectionSize)
        let newHashArray = new Uint8Array(newHash);
        let newHashHex = toHex(newHashArray);
        let newObj = await getByHash(newHashHex, inCallback);
        offset += await retrieve({
            level: level + 1,
            size: newObj.size,
            hash: newHash,
            buf: newObj.buf,
            inCallback,
            outCallback,
            offset,
        });
    }
    return offset
}

module.exports = join
