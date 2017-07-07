const path = require('path');

var config = require('./base.config.js');

config.entry.ptypo.unshift('babel-polyfill');
config.output.path = path.join(__dirname, 'external_dist');

module.exports = config;
