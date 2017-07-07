const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

module.exports = {
	entry: {
		ptypo: [
			'./src/index',
		],
	},
	output: {
		path: path.join(__dirname, 'dist'),
		publicPath: '',
		filename: '[name].js',
		libraryTarget: 'var',
		library: 'Ptypo',
	},
	module: {
		loaders: [
			{
				test: /\.jsx?$/,
				loaders: ['babel-loader?cacheDirectory'],
				include: [
					path.join(__dirname, 'src'),
				],
			},
		],
		noParse: /(levelup|dist\/prototypo-canvas)/,
	},
	externals: [{
		'./node/window': true,
		'./node/extend': true,
	}],
	resolve: {
		extensions: ['.js', '.jsx'],
	},
};
