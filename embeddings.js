// Minimal embeddings shim so services can require it safely

async function getEmbeddings() {
	// Return a tiny interface compatible with expected usage
	return {
		// naive embedding: returns a fixed-length array; replace with real model as needed
		embed: async (text) => {
			const hash = Array.from(text || '')
				.reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 5381);
			const vec = new Array(16).fill(0).map((_, i) => ((hash >> (i % 8)) & 0xff) / 255);
			return vec;
		}
	};
}

module.exports = { getEmbeddings };



