(function(source) {
  var sources = {};
  var compiled = {};
  exports = {};
  var compiling = false;

  function normalize(file) {
    return file.split("/").reverse()[0];
  }

  require = function(file) {
    var f = normalize(file);
    if (compiled[f]) {
      return exports;
    }

    compiled[f] = true
    eval(sources[f]);
    return exports;
  }

  load = function (file, source) {
    sources[file] = source;
  }
}());
