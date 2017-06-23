export const templateNames = {
	ELZEVIR: 'elzevir.ptf',
	GROTESK: 'venus.ptf',
	FELL: 'john-fell.ptf',
	SPECTRAL: 'spectral.ptf',
};

const validTemplates = [
	'elzevir.ptf',
	'venus.ptf',
	'john-fell.ptf',
	'spectral.ptf',
];

const PtypoWorker = require('worker-loader!./worker.js');

export default class Ptypo {
	constructor(token) {
		this.token = token;
		this.fonts = {};
	}

	async createFont(fontName, fontTemplate) {
		if (validTemplates.indexOf(fontTemplate) === -1) {
			throw new Error('template not found, please use a correct template Name');
		}

		const font = await fetch(`https://tc1b6vq6o8.execute-api.eu-west-1.amazonaws.com/dev/fonts/${fontTemplate}`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.token}`,
			},
		});
		const json = await font.json();
		const data = JSON.stringify(json);
		const worker = new PtypoWorker();

		return new Promise((resolve, reject) => {
			const loadFontHandler = (e) => {
				if (typeof e.data !== 'object') {
					reject();
				}

				worker.removeEventListener('message', loadFontHandler);

				resolve(new PtypoFont(worker, json, fontName));
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
		this.init = {};
		this.fontName = fontName;
		json.controls.forEach((control) => {
			control.parameters.forEach((param) => {
				this.init[param.name] = param.init;
				this.values[param.name] = param.init;
			});
		});
		this.glyphsSet = _.uniq(json.glyphs.map((glyph) => {
			return String.fromCharCode(glyph.unicode);
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

				this.otfFont = new FontFace(this.fontName, e.data);

				document.fonts.add(this.otfFont);
			}
		});
	}

	changeParam(paramName, paramValue) {
		this.values[paramName] = paramValue;
		this.worker.postMessage({
			type: 'update',
			data: this.values,
		});
	}

	reset() {
		this.values = _.cloneDeep(this.init);
		this.worker.postMessage({
			type: 'update',
			data: this.values,
		});
	}
}

