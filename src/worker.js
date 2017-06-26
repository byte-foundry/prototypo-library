import prototypo from './prototypo.js';

const ports = [];
const exportPorts = [];
let font;
const originSubset = {};
let currValues;
let currName;
let currSubset = [];
const arrayBufferMap = {};
const worker = self;
const fontsMap = {};

function translateSubset() {
	if (!currSubset.length) {
		return;
	}

	font.subset = currSubset.map(glyph => font.charMap[glyph.ot.unicode]).filter(Boolean);

	currSubset = font.subset;
};

function subset(eData) {
	let set = eData.data,
		add = eData.add,
		origin = eData.origin || 'native';

	const prevGlyphs = currSubset.map(glyph => glyph.name);

	if (add) {
		originSubset[origin] = set + originSubset[origin];
	}
	else {
		originSubset[origin] = set;
	}

	if (origin) {
		const currentStringSubset = Object
		.keys(originSubset)
		.map(key => originSubset[key]).join('');

		font.subset = currentStringSubset + set;
	}
	else {
		font.subset = set;
	}
	currSubset = font.subset;

	if (!currValues) {
		return true;
	}

	// search for glyphs *added* to the subset
	currSubset.filter(glyph => prevGlyphs.indexOf(glyph.name) === -1,

	// update those glyphs
	).forEach((glyph) => {
		glyph.update(currValues);
		glyph.updateOTCommands();
	});

	// Recreate the correct font.ot.glyphs.glyphs object, without
	// touching the ot commands
	font.updateOT({set: undefined});
	return font.toArrayBuffer();
}

const handlers = {};

prototypo.paper.setup({
	width: 1024,
	height: 1024,
});

// mini router
self.addEventListener('message', (e) => {
	let result;

	if (e.data.type && e.data.type in handlers) {
		result = handlers[e.data.type](e.data);

		if (result === null) {
			return;
		}

		arrayBufferMap[currName] = result;

		self.postMessage(
			result,
		);
	}
});

handlers.font = function (eData) {
	let fontSource = eData.data,
		templateName = eData.name,
		name = eData.db;

	// reset currValues to avoid using old values stored in the shared worker
	currValues = undefined;

	// TODO: this should be done using a memoizing table of limited size
	currName = name;
		/* if ( templateName in fontsMap ) {
		font = fontsMap[templateName];
		font.resetComponents();
		translateSubset();

		return {
			solvingOrders: null,
			handler: 'font',
		};
	}*/

	const fontObj = JSON.parse(fontSource);

	font = prototypo.parametricFont(fontObj);
	fontsMap[templateName] = font;

	translateSubset();

	const solvingOrders = {};

	Object.keys(font.glyphMap).forEach((key) => {
		solvingOrders[key] = font.glyphMap[key].solvingOrder;
	});

	return {
		solvingOrders,
		handler: 'font',
	};
};

handlers.update = function (eData) {
	const params = eData.data;

	currValues = params;
	font.update(currValues);
	font.updateOTCommands();
	const result = font.toArrayBuffer();

	return result;
};

handlers.getGlyphsProperties = function (eData) {
	let result = null;

	if (eData.data) {
		const names = font.subset.map(glyph => glyph.name);
		const properties = eData.data.properties;

		result = {};

		font.glyphs.forEach((glyph) => {
			if (names.indexOf(glyph.name) !== -1) {
				if (!result[glyph.unicode]) {
					result[glyph.unicode] = {};
				}

				if (typeof properties === 'string') {
					result[glyph.unicode][properties] = glyph[properties];
				}
				else if (Array.isArray(properties)) {
					properties.forEach((property) => {
						result[glyph.unicode][property] = glyph[property];
					});
				}
			}
		});
	}

	return {
		type: 'props',
		result,
	};
};

handlers.soloAlternate = function (params) {
	font.setAlternatesFor(params.unicode, params.glyphName);

	if (!currValues) {
		return true;
	}

	font.subset = font.subset.map(glyph => String.fromCharCode(glyph.unicode)).join('');

	const altGlyph = font.glyphMap[params.glyphName];

	font.subset.forEach((glyph) => {
		if ((altGlyph.src.relatedGlyphs && altGlyph.src.relatedGlyphs.indexOf(glyph.name) !== -1) || glyph.name === altGlyph.name) {
			glyph.update(currValues);
		}
	});
	altGlyph.updateOTCommands();

	// Recreate the correct font.ot.glyphs.glyphs object, without
	// touching the ot commands
	font.updateOT({set: undefined});
	return font.toArrayBuffer();
};

handlers.alternate = function (eData) {
	const params = eData.data;

	if (params.altList) {
		Object.keys(params.altList).forEach((unicode) => {
			handlers.soloAlternate({
				unicode,
				glyphName: params.altList[unicode],
			});
		});
	}
	else {
		handlers.soloAlternate(params);
	}
};

handlers.subset = subset;

function fillOs2Values(fontOt, values) {
	const weightChooser = [
		{test: 20,		value: 'THIN'},
		{test: 40,		value: 'EXTRA_LIGHT'},
		{test: 60,		value: 'LIGHT'},
		{test: 90,		value: 'NORMAL'},
		{test: 110,	value: 'MEDIUM'},
		{test: 130,	value: 'SEMI_BOLD'},
		{test: 150,	value: 'BOLD'},
		{test: 170,	value: 'EXTRA_BOLD'},
		{test: 190,	value: 'BLACK'},
	];

	const widthChooser = [
		{test: 0.5,	value: 'ULTRA_CONDENSED'},
		{test: 0.625,	value: 'EXTRA_CONDENSED'},
		{test: 0.75,	value: 'CONDENSED'},
		{test: 0.875,	value: 'SEMI_CONDENSED'},
		{test: 1,		value: 'MEDIUM'},
		{test: 1.125,	value: 'SEMI_EXPANDED'},
		{test: 1.25,	value: 'EXPANDED'},
		{test: 1.50,	value: 'EXTRA_EXPANDED'},
		{test: 2,		value: 'ULTRA_CONDENSED'},
	];

	weightChooser.forEach((weightObj) => {
		if (values.thickness > weightObj.test) {
			fontOt.tables.os2.weightClass = (
				fontOt.usWeightClasses[weightObj.value]
			);
		}
	});

	widthChooser.forEach((widthObj) => {
		if (values.width > widthObj.test) {
			fontOt.tables.os2.widthClass = (
				fontOt.usWidthClasses[widthObj.value]
			);
		}
	});

	let fsSel = 0;

	if (values.slant > 0) {
		fsSel |= fontOt.fsSelectionValues.ITALIC;
	}

	if (fontOt.tables.os2.weightClass > fontOt.usWeightClasses.NORMAL) {
		fsSel |= fontOt.fsSelectionValues.BOLD;
	}

	if (fsSel === 0) {
		fsSel = fontOt.fsSelectionValues.REGULAR;
	}

	fontOt.tables.os2.fsSelection = fsSel;
}

handlers.otfFont = function (eData) {
	const data = eData.data;
	// force-update of the whole font, ignoring the current subset
	const allChars = font.getGlyphSubset(false);
	const fontValues = data && data.values || currValues;

	font.update(fontValues, allChars);

	font.updateOTCommands(allChars, data && data.merged || false);

	const family = font.ot.names.fontFamily.en;
	const style = font.ot.names.fontSubfamily.en;
	const fullName = font.ot.names.fullName.en;
	const names = font.ot.names;

	// TODO: understand why we need to save the familyName and
	// and set them back into the font.ot for it to be able to
	// export multiple font
	const variantName
		= (data && data.style ? data.style.toLowerCase() : 'regular')
		.replace(/^./, a => a.toUpperCase());

	names.fontFamily.en = data && data.family || 'Prototypo';
	names.fontSubfamily.en = variantName;
	names.preferredFamily = names.fontFamily;
	names.preferredSubfamily = names.fontSubFamily;
	names.postScriptName.en
		= `${names.fontFamily.en}-${names.fontSubfamily.en}`;
	names.uniqueID = {en: (
		`Prototypo: ${
		names.fontFamily.en
		} ${
		names.fontSubfamily.en
		}:2016`
	)};
	names.fullName.en
		= `${names.fontFamily.en} ${names.fontSubfamily.en}`;
	names.version.en = 'Version 1.0';
	fillOs2Values(font.ot, fontValues);

	const result = font.toArrayBuffer();

	names.fontFamily.en = family;
	names.fontSubfamily.en = style;
	names.fullName.en = fullName;

	return result;
};

handlers.changeCursorsToManual = function (eData) {
	const cursors = eData.cursors;
	const glyphUnicode = eData.glyphUnicode;

	font.changeCursorsToManual(glyphUnicode, cursors);
};
