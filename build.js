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

  var ast = UglifyJS.parser.parse(
    "(function(window) {" + source + ";" +
      "window.UglifyJS = this.require('.')" +
      "}).call({}, this)"
  );

  source = uglify.gen_code(uglify.ast_squeeze(uglify.ast_mangle(ast)));

  fs.writeFile(__dirname + "/lib/uglify.js", source, function(err) {
    if (err) throw err;
  });
});
