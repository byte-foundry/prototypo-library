import uniq from "lodash.uniq";
import cloneDeep from "lodash.clonedeep";

export const templateNames = {
	ELZEVIR: 'elzevir.ptf',
	GROTESK: 'venus.ptf',
	FELL: 'john-fell.ptf',
	SPECTRAL: 'gfnt.ptf',
	ANTIQUE: 'antique.ptf',
};

const validTemplates = Object.values(templateNames);

const PtypoWorker = require('worker-loader?inline!./worker.js');

export default class Ptypo {
	constructor(token) {
		this.token = token;
		this.fonts = {};
	}

	async createFont(fontName, fontTemplate) {
		if (validTemplates.indexOf(fontTemplate) === -1) {
			throw new Error('template not found, please use a correct template Name');
		}
		const font = await fetch(`https://e4jpj60rk8.execute-api.eu-west-1.amazonaws.com/prod/fonts/${fontTemplate}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
		});

		if (!data.ok && data.statusCode === 403) {
			throw new Error(
				"The domain from where you're using the Prototypo library is not authorized. You can manage authorized domains in the developers page on your account. See https://app.prototypo.io/#/account/prototypo-library"
			);
		}

		const json = await data.json();

		if (!this.token /*|| TODO: check if AWS returned a free font */) {
			console.warn(
				"You're using the free version of the Prototypo library. Get a pro account now and access the entire glyphset. https://app.prototypo.io/#/account/subscribe"
			);
		}

		const worker = new PtypoWorker();

		return new Promise((resolve, reject) => {
			const loadFontHandler = (e) => {
				if (typeof e.data !== 'object') {
					reject();
				}

				worker.removeEventListener('message', loadFontHandler);

				const fontInstance = new PtypoFont(worker, json, fontName);

				fontInstance.reset();
				resolve(fontInstance);
			};

			worker.addEventListener('message', loadFontHandler);

			worker.postMessage({
				type: 'font',
				name: fontName,
				data: JSON.stringify(json),
			});
		});
	}
}

export class PtypoFont {
	constructor(worker, json, fontName) {
		this.worker = worker;
		this.json = json;
		this.values = {};
		this.shouldDownload = false;
		this.init = {};
		this.fontName = fontName;
		this.buildingResolver = () => {};

		json.controls.forEach((control) => {
			control.parameters.forEach((param) => {
				this.init[param.name] = param.init;
				this.values[param.name] = param.init;
			});
		});
		this.glyphsSet = uniq(Object.keys(json.glyphs).map((key) => {
			return String.fromCharCode(json.glyphs[key].unicode);
		}));
		this.worker.postMessage({
			type: 'subset',
			data: this.glyphsSet,
		});

		this.worker.addEventListener('message', (e) => {
			if (e.data instanceof ArrayBuffer) {
				if (this.otfFont) {
					document.fonts.delete(this.otfFont);
				}

				if (this.shouldDownload) {
					this.downloadResolver(e.data);
					this.shouldDownload = false;
				}

				this.otfSource = e.data;
				this.otfFont = new FontFace(this.fontName, e.data);

				document.fonts.add(this.otfFont);

				this.buildingResolver(this);
			}
			else if (e.data.type === 'props') {
				this.glyphProperties = e.data.result;
			}
		});
	}

	changeParams(paramObj) {
		Object.keys(paramObj).forEach((key) => {
			this.values[key] = paramObj[key];
		});
		return this.createFont();
	}

	createFont() {
		this.worker.postMessage({
			type: 'update',
			data: this.values,
		});
		this.worker.postMessage({
			type: 'getGlyphsProperties',
			data: {
				properties: ['advanceWidth'],
			},
		});
		const {xHeight, capDelta, ascender, descender} = this.values;

		this.globalHeight = xHeight + Math.max(capDelta, ascender) - descender;

		return new Promise(resolve => {
			this.buildingResolver = resolve;
		})
	}

	changeParam(paramName, paramValue) {
		this.values[paramName] = paramValue;
		return this.createFont();
	}



	getArrayBuffer() {
		this.shouldDownload = true;
		return new Promise(((resolve) => {
			this.downloadResolver = resolve;
			this.worker.postMessage({
				type: 'otfFont',
				data: {
					family: this.fontName,
					style: 'regular',
					merged: true,
					values: this.values
				},
				serialized: false,
			});
		}));
	}

	reset() {
		this.values = cloneDeep(this.init);
		return this.createFont();
	}
}
