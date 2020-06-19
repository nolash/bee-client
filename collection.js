module.exports = {
	isSwarmHash: isSwarmHash,
	Collection: Collection,
	CollectionIndex: CollectionIndex,
	SimpleManifestAdapter: SimpleManifestAdapter,
};

// brazenly stolen from git:felfele/bee-client
function mergeUint8Arrays(arrays) {
    const size = arrays.reduce((prev, curr) => prev + curr.length, 0)
    const r = new Uint8Array(size)
    let offset = 0
    for (const arr of arrays) {
        r.set(arr, offset)
        offset += arr.length
    }
    return r
}

function isSwarmHash(hash) {
	if (hash === undefined || hash.length === undefined || hash.length != 32) {
		return false;
	}
	return true;
}

function Collection() {
	this.hashes = [];
}

Collection.prototype.add = function(hash) {
	let new_index = this.hashes.length;
	if (!isSwarmHash(hash)) {
		return false;
	}
	this.hashes.push(hash);
	return new_index;
};

Collection.prototype.serialize = function() {
	return mergeUint8Arrays(this.hashes);
};

Collection.prototype.deserialize = function(b) {
	for (let i = 0; i < b.length; i += 32) {
		console.debug(i);
		if ((b.length - i) % 32 != 0) {
			this.hashes = [];
			return false;
		}
		let subArrayCopy = Uint8Array.from(b.slice(i, i+32));
		this.hashes.push(subArrayCopy);
	}
	return true;
};

Collection.prototype.each = function(f, mode) {
	for (let i = 0; i < this.hashes.length; i++) {
		f(this.hashes[i]);
	}
};

function isFilename(name) {
	return typeof(name) === 'string';
}

function isMimetype(typ) {
	return typeof(typ) === 'string' && typ.indexOf("/") > 0;
}

function validMetaData(key) {
	if (key === undefined || key.filename === undefined || key.mimetype === undefined) {
		return false;
	}
	if (!isFilename(key.filename) || !isMimetype(key.mimetype)) {
		return false;
	}
	return true;
}

function CollectionIndex(name) {
	this.name = name;
	this.keys = {};
	this.intermediate = [];
	this.values = [];
}

// the key may be anything but needs to have toString?
CollectionIndex.prototype.add = function(key, value) {
	if (key === undefined || !isFilename(key.filename) || !isMimetype(key.mimetype)) {
		return false;
	}
	this.values.push(value);
	this.intermediate.push(key.mimetype);
	this.keys[key.filename] = this.values.length-1;
	return true;
};

CollectionIndex.prototype.serialize = function() {
	let filenames = [];
	let i = 0;
	for (const k in this.keys) {
		filenames.push(k + ':' + i);
		i++;
	}

	let entries = {};
	filenames.sort()
	for (let i = 0; i < filenames.length; i++) {
		let s = filenames[i];
		parts = s.split(':');
		let idx = parseInt(parts[1], 10);
		//console.debug('serialize parts', parts, idx);
		entries[parts[0]] = [this.intermediate[idx], this.values[idx]];
	}
	//console.debug('serialize entries', entries);
	let enc = new TextEncoder();
	return enc.encode(JSON.stringify(entries));
};

CollectionIndex.prototype.deserialize = function(b) {
	let dec = new TextDecoder();
	let entries = JSON.parse(dec.decode(b));

	console.debug('entries', entries)
	let i = 0;
	for (const k in entries) {
		this.keys[k] = i;
		this.intermediate.push(entries[k][0]);
		this.values.push(entries[k][1]);
		i++;
	}
	return true;
};


function SimpleManifestAdapter(collection, index) {
	this.collection = collection;
	this.index = index;
}

SimpleManifestAdapter.prototype.getReference = function(k) {
	let index_position = this.index.keys[k];
	let collection_position = this.index.values[index_position];
	return this.collection.hashes[collection_position];
}

SimpleManifestAdapter.prototype.getMimetype = function(k) {
	let index_position = this.index.keys[k];
	return this.index.intermediate[index_position];
}
