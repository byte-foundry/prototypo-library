import uniq from "lodash.uniq";
import cloneDeep from "lodash.clonedeep";

export const templateNames = {
	ELZEVIR: 'elzevir.ptf',
	GROTESK: 'venus.ptf',
	FELL: 'john-fell.ptf',
	SPECTRAL: 'spectral.ptf',
	ANTIQUE: 'antique.ptf',
};

const validTemplates = [
	'elzevir.ptf',
	'venus.ptf',
	'john-fell.ptf',
	'spectral.ptf',
	'antique.ptf',
];

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
		const data = await font.json();
		const json = JSON.parse(data);
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
				data,
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
