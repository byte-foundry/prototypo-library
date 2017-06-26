const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

module.exports = {
	entry: {
		ptypo: [
			'babel-polyfill',
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
				loaders: ['transform/cacheable?envify', 'babel-loader?cacheDirectory'],
				include: [
					path.join(__dirname, 'app'),
				],
			},
		],
		noParse: /(levelup|dist\/prototypo-canvas)/,
	},
	externals: [{
		'./node/window': true,
		'./node/extend': true,
	}],
	plugins: [
		new webpack.ProvidePlugin({
			_: 'lodash',
		}),
	],
	resolve: {
		extensions: ['.js', '.jsx'],
	},
};
