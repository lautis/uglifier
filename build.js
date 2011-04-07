#!/usr/bin/env node

var fs       = require("fs");
var stitch   = require("stitch");
var UglifyJS = require("./vendor/uglifyjs");
var uglify   = UglifyJS.uglify;

var package = stitch.createPackage({
  paths: [__dirname + "/vendor/uglifyjs/lib"]
});

package.compile(function(err, source) {
  if (err) throw err;

 source = "(function(global) {" +
    source + ";" +
    "global.UglifyJS = {};" +
    "global.UglifyJS.parser = this.require('parse-js');" +
    "global.UglifyJS.uglify = this.require('process');" +
    "}).call({}, this)";

  var ast = UglifyJS.parser.parse(source);
  source  = uglify.gen_code(uglify.ast_squeeze(uglify.ast_mangle(ast)));

  fs.writeFile(__dirname + "/lib/uglify.js", source, function(err) {
    if (err) throw err;
  });
});
