window = this;/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Define a module along with a payload.
 * @param {string} moduleName Name for the payload
 * @param {ignored} deps Ignored. For compatibility with CommonJS AMD Spec
 * @param {function} payload Function with (require, exports, module) params
 */
function define(moduleName, deps, payload) {
  if (typeof moduleName != "string") {
    throw new TypeError('Expected string, got: ' + moduleName);
  }

  if (arguments.length == 2) {
    payload = deps;
  }

  if (moduleName in define.modules) {
    throw new Error("Module already defined: " + moduleName);
  }
  define.modules[moduleName] = payload;
};

/**
 * The global store of un-instantiated modules
 */
define.modules = {};


/**
 * We invoke require() in the context of a Domain so we can have multiple
 * sets of modules running separate from each other.
 * This contrasts with JSMs which are singletons, Domains allows us to
 * optionally load a CommonJS module twice with separate data each time.
 * Perhaps you want 2 command lines with a different set of commands in each,
 * for example.
 */
function Domain() {
  this.modules = {};
  this._currentModule = null;
}

(function () {

  /**
   * Lookup module names and resolve them by calling the definition function if
   * needed.
   * There are 2 ways to call this, either with an array of dependencies and a
   * callback to call when the dependencies are found (which can happen
   * asynchronously in an in-page context) or with a single string an no callback
   * where the dependency is resolved synchronously and returned.
   * The API is designed to be compatible with the CommonJS AMD spec and
   * RequireJS.
   * @param {string[]|string} deps A name, or names for the payload
   * @param {function|undefined} callback Function to call when the dependencies
   * are resolved
   * @return {undefined|object} The module required or undefined for
   * array/callback method
   */
  Domain.prototype.require = function(deps, callback) {
    if (Array.isArray(deps)) {
      var params = deps.map(function(dep) {
        return this.lookup(dep);
      }, this);
      if (callback) {
        callback.apply(null, params);
      }
      return undefined;
    }
    else {
      return this.lookup(deps);
    }
  };

  function normalize(path) {
    var bits = path.split('/');
    var i = 1;
    while (i < bits.length) {
      if (bits[i] === '..') {
        bits.splice(i-1, 1);
      } else if (bits[i] === '.') {
        bits.splice(i, 1);
      } else {
        i++;
      }
    }
    return bits.join('/');
  }

  function join(a, b) {
    a = a.trim();
    b = b.trim();
    if (/^\//.test(b)) {
      return b;
    } else {
      return a.replace(/\/*$/, '/') + b;
    }
  }

  function dirname(path) {
    var bits = path.split('/');
    bits.pop();
    return bits.join('/');
  }

  /**
   * Lookup module names and resolve them by calling the definition function if
   * needed.
   * @param {string} moduleName A name for the payload to lookup
   * @return {object} The module specified by aModuleName or null if not found.
   */
  Domain.prototype.lookup = function(moduleName) {
    if (/^\./.test(moduleName)) {
      moduleName = normalize(join(dirname(this._currentModule), moduleName));
    }

    if (moduleName in this.modules) {
      var module = this.modules[moduleName];
      return module;
    }

    if (!(moduleName in define.modules)) {
      throw new Error("Module not defined: " + moduleName);
    }

    var module = define.modules[moduleName];

    if (typeof module == "function") {
      var exports = {};
      var previousModule = this._currentModule;
      this._currentModule = moduleName;
      module(this.require.bind(this), exports, { id: moduleName, uri: "" });
      this._currentModule = previousModule;
      module = exports;
    }

    // cache the resulting module object for next time
    this.modules[moduleName] = module;

    return module;
  };

}());

define.Domain = Domain;
define.globalDomain = new Domain();
var require = define.globalDomain.require.bind(define.globalDomain);
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define('source-map/source-map-generator', ['require', 'exports', 'module' ,  'source-map/base64-vlq', 'source-map/util', 'source-map/array-set'], function(require, exports, module) {

  var base64VLQ = require('./base64-vlq');
  var util = require('./util');
  var ArraySet = require('./array-set').ArraySet;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. To create a new one, you must pass an object
   * with the following properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: An optional root for all URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    this._file = util.getArg(aArgs, 'file');
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = [];
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      this._validateMapping(generated, original, source, name);

      if (source && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.push({
        generated: generated,
        original: original,
        source: source,
        name: name
      });
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping.');
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      // The mappings must be guarenteed to be in sorted order before we start
      // serializing them or else the generated line numbers (which are defined
      // via the ';' separators) will be all messed up. Note: it might be more
      // performant to maintain the sorting as we insert them, rather than as we
      // serialize them, but the big O is the same either way.
      this._mappings.sort(function (mappingA, mappingB) {
        var cmp = mappingA.generated.line - mappingB.generated.line;
        return cmp === 0
          ? mappingA.generated.column - mappingB.generated.column
          : cmp;
      });

      for (var i = 0, len = this._mappings.length; i < len; i++) {
        mapping = this._mappings[i];

        if (mapping.generated.line !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generated.line !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generated.column
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generated.column;

        if (mapping.source && mapping.original) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.original.line - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.original.line - 1;

          result += base64VLQ.encode(mapping.original.column
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.original.column;

          if (mapping.name) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        file: this._file,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._sourceRoot) {
        map.sourceRoot = this._sourceRoot;
      }
      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this);
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
define('source-map/base64-vlq', ['require', 'exports', 'module' ,  'source-map/base64'], function(require, exports, module) {

  var base64 = require('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string.
   */
  exports.decode = function base64VLQ_decode(aStr) {
    var i = 0;
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (i >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }
      digit = base64.decode(aStr.charAt(i++));
      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    return {
      value: fromVLQSigned(result),
      rest: aStr.slice(i)
    };
  };

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define('source-map/base64', ['require', 'exports', 'module' , ], function(require, exports, module) {

  var charToIntMap = {};
  var intToCharMap = {};

  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach(function (ch, index) {
      charToIntMap[ch] = index;
      intToCharMap[index] = ch;
    });

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function base64_encode(aNumber) {
    if (aNumber in intToCharMap) {
      return intToCharMap[aNumber];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 digit to an integer.
   */
  exports.decode = function base64_decode(aChar) {
    if (aChar in charToIntMap) {
      return charToIntMap[aChar];
    }
    throw new TypeError("Not a valid base 64 digit: " + aChar);
  };

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define('source-map/util', ['require', 'exports', 'module' , ], function(require, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  function join(aRoot, aPath) {
    return aPath.charAt(0) === '/'
      ? aPath
      : aRoot.replace(/\/*$/, '') + '/' + aPath;
  }
  exports.join = join;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define('source-map/array-set', ['require', 'exports', 'module' , ], function(require, exports, module) {

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i]);
    }
    return set;
  };

  /**
   * Because behavior goes wacky when you set `__proto__` on `this._set`, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  ArraySet.prototype._toSetString = function ArraySet__toSetString (aStr) {
    return "$" + aStr;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr) {
    if (this.has(aStr)) {
      // Already a member; nothing to do.
      return;
    }
    var idx = this._array.length;
    this._array.push(aStr);
    this._set[this._toSetString(aStr)] = idx;
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                this._toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[this._toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define('source-map/source-map-consumer', ['require', 'exports', 'module' ,  'source-map/util', 'source-map/binary-search', 'source-map/array-set', 'source-map/base64-vlq'], function(require, exports, module) {

  var util = require('./util');
  var binarySearch = require('./binary-search');
  var ArraySet = require('./array-set').ArraySet;
  var base64VLQ = require('./base64-vlq');

  /**
   * A SourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    var names = util.getArg(sourceMap, 'names');
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file');

    if (version !== this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    this._names = ArraySet.fromArray(names);
    this._sources = ArraySet.fromArray(sources);
    this._sourceRoot = sourceRoot;
    this.file = file;

    // `this._generatedMappings` and `this._originalMappings` hold the parsed
    // mapping coordinates from the source map's "mappings" attribute. Each
    // object in the array is of the form
    //
    //     {
    //       generatedLine: The line number in the generated code,
    //       generatedColumn: The column number in the generated code,
    //       source: The path to the original source file that generated this
    //               chunk of code,
    //       originalLine: The line number in the original source that
    //                     corresponds to this chunk of generated code,
    //       originalColumn: The column number in the original source that
    //                       corresponds to this chunk of generated code,
    //       name: The name of the original symbol which generated this chunk of
    //             code.
    //     }
    //
    // All properties except for `generatedLine` and `generatedColumn` can be
    // `null`.
    //
    // `this._generatedMappings` is ordered by the generated positions.
    //
    // `this._originalMappings` is ordered by the original positions.
    this._generatedMappings = [];
    this._originalMappings = [];
    this._parseMappings(mappings, sourceRoot);
  }

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this._sourceRoot ? util.join(this._sourceRoot, s) : s;
      }, this);
    }
  });

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (an ordered list in this._generatedMappings).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var mappingSeparator = /^[,;]/;
      var str = aStr;
      var mapping;
      var temp;

      while (str.length > 0) {
        if (str.charAt(0) === ';') {
          generatedLine++;
          str = str.slice(1);
          previousGeneratedColumn = 0;
        }
        else if (str.charAt(0) === ',') {
          str = str.slice(1);
        }
        else {
          mapping = {};
          mapping.generatedLine = generatedLine;

          // Generated column.
          temp = base64VLQ.decode(str);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
            // Original source.
            temp = base64VLQ.decode(str);
            if (aSourceRoot) {
              mapping.source = util.join(aSourceRoot, this._sources.at(previousSource + temp.value));
            }
            else {
              mapping.source = this._sources.at(previousSource + temp.value);
            }
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            temp = base64VLQ.decode(str);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            temp = base64VLQ.decode(str);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
              // Original name.
              temp = base64VLQ.decode(str);
              mapping.name = this._names.at(previousName + temp.value);
              previousName += temp.value;
              str = temp.rest;
            }
          }

          this._generatedMappings.push(mapping);
          this._originalMappings.push(mapping);
        }
      }

      this._originalMappings.sort(this._compareOriginalPositions);
    };

  /**
   * Comparator between two mappings where the original positions are compared.
   */
  SourceMapConsumer.prototype._compareOriginalPositions =
    function SourceMapConsumer_compareOriginalPositions(mappingA, mappingB) {
      if (mappingA.source > mappingB.source) {
        return 1;
      }
      else if (mappingA.source < mappingB.source) {
        return -1;
      }
      else {
        var cmp = mappingA.originalLine - mappingB.originalLine;
        return cmp === 0
          ? mappingA.originalColumn - mappingB.originalColumn
          : cmp;
      }
    };

  /**
   * Comparator between two mappings where the generated positions are compared.
   */
  SourceMapConsumer.prototype._compareGeneratedPositions =
    function SourceMapConsumer_compareGeneratedPositions(mappingA, mappingB) {
      var cmp = mappingA.generatedLine - mappingB.generatedLine;
      return cmp === 0
        ? mappingA.generatedColumn - mappingB.generatedColumn
        : cmp;
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  SourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator);
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  SourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var mapping = this._findMapping(needle,
                                      this._generatedMappings,
                                      "generatedLine",
                                      "generatedColumn",
                                      this._compareGeneratedPositions)

      if (mapping) {
        return {
          source: util.getArg(mapping, 'source', null),
          line: util.getArg(mapping, 'originalLine', null),
          column: util.getArg(mapping, 'originalColumn', null),
          name: util.getArg(mapping, 'name', null)
        };
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      var mapping = this._findMapping(needle,
                                      this._originalMappings,
                                      "originalLine",
                                      "originalColumn",
                                      this._compareOriginalPositions)

      if (mapping) {
        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null)
        };
      }

      return {
        line: null,
        column: null
      };
    };

  exports.SourceMapConsumer = SourceMapConsumer;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define('source-map/binary-search', ['require', 'exports', 'module' , ], function(require, exports, module) {

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the next
    //      closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return null.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid]);
    if (cmp === 0) {
      // Found the element we are looking for.
      return aHaystack[mid];
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return aHaystack[mid];
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0
        ? null
        : aHaystack[aLow];
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the next lowest value checked if there is no exact hit. This is because
   * mappings between original and generated line/col pairs are single points,
   * and there is an implicit region between each of them, so a miss just means
   * that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    return aHaystack.length > 0
      ? recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
      : null;
  };

});
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
define('source-map/source-node', ['require', 'exports', 'module' ,  'source-map/source-map-generator'], function(require, exports, module) {

  var SourceMapGenerator = require('./source-map-generator').SourceMapGenerator;

  /**
   * SourceNodes provide a way to abstract over interpolating/concatenating
   * snippets of generated JavaScript source code while maintaining the line and
   * column information associated with the original source code.
   *
   * @param aLine The original line number.
   * @param aColumn The original column number.
   * @param aSource The original source's filename.
   * @param aChunks Optional. An array of strings which are snippets of
   *        generated JS, or other SourceNodes.
   */
  function SourceNode(aLine, aColumn, aSource, aChunks) {
    this.children = [];
    this.line = aLine;
    this.column = aColumn;
    this.source = aSource;
    if (aChunks != null) this.add(aChunks);
  }

  /**
   * Add a chunk of generated JS to this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.add = function SourceNode_add(aChunk) {
    if (Array.isArray(aChunk)) {
      aChunk.forEach(function (chunk) {
        this.add(chunk);
      }, this);
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      if (aChunk) {
        this.children.push(aChunk);
      }
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Add a chunk of generated JS to the beginning of this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
    if (Array.isArray(aChunk)) {
      for (var i = aChunk.length-1; i >= 0; i--) {
        this.prepend(aChunk[i]);
      }
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      this.children.unshift(aChunk);
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Walk over the tree of JS snippets in this node and its children. The
   * walking function is called once for each snippet of JS and is passed that
   * snippet and the its original associated source's line/column location.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
    this.children.forEach(function (chunk) {
      if (chunk instanceof SourceNode) {
        chunk.walk(aFn);
      }
      else {
        if (chunk !== '') {
          aFn(chunk, { source: this.source, line: this.line, column: this.column });
        }
      }
    }, this);
  };

  /**
   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
   * each of `this.children`.
   *
   * @param aSep The separator.
   */
  SourceNode.prototype.join = function SourceNode_join(aSep) {
    var newChildren;
    var i;
    var len = this.children.length
    if (len > 0) {
      newChildren = [];
      for (i = 0; i < len-1; i++) {
        newChildren.push(this.children[i]);
        newChildren.push(aSep);
      }
      newChildren.push(this.children[i]);
      this.children = newChildren;
    }
    return this;
  };

  /**
   * Call String.prototype.replace on the very right-most source snippet. Useful
   * for trimming whitespace from the end of a source node, etc.
   *
   * @param aPattern The pattern to replace.
   * @param aReplacement The thing to replace the pattern with.
   */
  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
    var lastChild = this.children[this.children.length - 1];
    if (lastChild instanceof SourceNode) {
      lastChild.replaceRight(aPattern, aReplacement);
    }
    else if (typeof lastChild === 'string') {
      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
    }
    else {
      this.children.push(''.replace(aPattern, aReplacement));
    }
    return this;
  };

  /**
   * Return the string representation of this source node. Walks over the tree
   * and concatenates all the various snippets together to one string.
   */
  SourceNode.prototype.toString = function SourceNode_toString() {
    var str = "";
    this.walk(function (chunk) {
      str += chunk;
    });
    return str;
  };

  /**
   * Returns the string representation of this source node along with a source
   * map.
   */
  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
    var generated = {
      code: "",
      line: 1,
      column: 0
    };
    var map = new SourceMapGenerator(aArgs);
    this.walk(function (chunk, original) {
      generated.code += chunk;
      if (original.source != null
          && original.line != null
          && original.column != null) {
        map.addMapping({
          source: original.source,
          original: {
            line: original.line,
            column: original.column
          },
          generated: {
            line: generated.line,
            column: generated.column
          }
        });
      }
      chunk.split('').forEach(function (char) {
        if (char === '\n') {
          generated.line++;
          generated.column = 0;
        } else {
          generated.column++;
        }
      });
    });

    return { code: generated.code, map: map };
  };

  exports.SourceNode = SourceNode;

});
/* -*- Mode: js; js-indent-level: 2; -*- */
///////////////////////////////////////////////////////////////////////////////

window.sourceMap = {
  SourceMapConsumer: require('source-map/source-map-consumer').SourceMapConsumer,
  SourceMapGenerator: require('source-map/source-map-generator').SourceMapGenerator,
  SourceNode: require('source-map/source-node').SourceNode
};
MOZ_SourceMap = sourceMap;(function(exports,global){global["UglifyJS"]=exports;"use strict";function array_to_hash(a){var ret=Object.create(null);for(var i=0;i<a.length;++i)ret[a[i]]=true;return ret}function slice(a,start){return Array.prototype.slice.call(a,start||0)}function characters(str){return str.split("")}function member(name,array){for(var i=array.length;--i>=0;)if(array[i]==name)return true;return false}function find_if(func,array){for(var i=0,n=array.length;i<n;++i){if(func(array[i]))return array[i]}}function repeat_string(str,i){if(i<=0)return"";if(i==1)return str;var d=repeat_string(str,i>>1);d+=d;if(i&1)d+=str;return d}function DefaultsError(msg,defs){this.msg=msg;this.defs=defs}function defaults(args,defs,croak){if(args===true)args={};var ret=args||{};if(croak)for(var i in ret)if(ret.hasOwnProperty(i)&&!defs.hasOwnProperty(i))throw new DefaultsError("`"+i+"` is not a supported option",defs);for(var i in defs)if(defs.hasOwnProperty(i)){ret[i]=args&&args.hasOwnProperty(i)?args[i]:defs[i]}return ret}function merge(obj,ext){for(var i in ext)if(ext.hasOwnProperty(i)){obj[i]=ext[i]}return obj}function noop(){}var MAP=function(){function MAP(a,f,backwards){var ret=[],top=[],i;function doit(){var val=f(a[i],i);var is_last=val instanceof Last;if(is_last)val=val.v;if(val instanceof AtTop){val=val.v;if(val instanceof Splice){top.push.apply(top,backwards?val.v.slice().reverse():val.v)}else{top.push(val)}}else if(val!==skip){if(val instanceof Splice){ret.push.apply(ret,backwards?val.v.slice().reverse():val.v)}else{ret.push(val)}}return is_last}if(a instanceof Array){if(backwards){for(i=a.length;--i>=0;)if(doit())break;ret.reverse();top.reverse()}else{for(i=0;i<a.length;++i)if(doit())break}}else{for(i in a)if(a.hasOwnProperty(i))if(doit())break}return top.concat(ret)}MAP.at_top=function(val){return new AtTop(val)};MAP.splice=function(val){return new Splice(val)};MAP.last=function(val){return new Last(val)};var skip=MAP.skip={};function AtTop(val){this.v=val}function Splice(val){this.v=val}function Last(val){this.v=val}return MAP}();function push_uniq(array,el){if(array.indexOf(el)<0)array.push(el)}function string_template(text,props){return text.replace(/\{(.+?)\}/g,function(str,p){return props[p]})}function remove(array,el){for(var i=array.length;--i>=0;){if(array[i]===el)array.splice(i,1)}}function mergeSort(array,cmp){if(array.length<2)return array.slice();function merge(a,b){var r=[],ai=0,bi=0,i=0;while(ai<a.length&&bi<b.length){cmp(a[ai],b[bi])<=0?r[i++]=a[ai++]:r[i++]=b[bi++]}if(ai<a.length)r.push.apply(r,a.slice(ai));if(bi<b.length)r.push.apply(r,b.slice(bi));return r}function _ms(a){if(a.length<=1)return a;var m=Math.floor(a.length/2),left=a.slice(0,m),right=a.slice(m);left=_ms(left);right=_ms(right);return merge(left,right)}return _ms(array)}function set_difference(a,b){return a.filter(function(el){return b.indexOf(el)<0})}function set_intersection(a,b){return a.filter(function(el){return b.indexOf(el)>=0})}function makePredicate(words){if(!(words instanceof Array))words=words.split(" ");var f="",cats=[];out:for(var i=0;i<words.length;++i){for(var j=0;j<cats.length;++j)if(cats[j][0].length==words[i].length){cats[j].push(words[i]);continue out}cats.push([words[i]])}function compareTo(arr){if(arr.length==1)return f+="return str === "+JSON.stringify(arr[0])+";";f+="switch(str){";for(var i=0;i<arr.length;++i)f+="case "+JSON.stringify(arr[i])+":";f+="return true}return false;"}if(cats.length>3){cats.sort(function(a,b){return b.length-a.length});f+="switch(str.length){";for(var i=0;i<cats.length;++i){var cat=cats[i];f+="case "+cat[0].length+":";compareTo(cat)}f+="}"}else{compareTo(words)}return new Function("str",f)}"use strict";function DEFNODE(type,props,methods,base){if(arguments.length<4)base=AST_Node;if(!props)props=[];else props=props.split(/\s+/);var self_props=props;if(base&&base.PROPS)props=props.concat(base.PROPS);var code="return function AST_"+type+"(props){ if (props) { ";for(var i=props.length;--i>=0;){code+="this."+props[i]+" = props."+props[i]+";"}var proto=base&&new base;if(proto&&proto.initialize||methods&&methods.initialize)code+="this.initialize();";code+="}}";var ctor=new Function(code)();if(proto){ctor.prototype=proto;ctor.BASE=base}if(base)base.SUBCLASSES.push(ctor);ctor.prototype.CTOR=ctor;ctor.PROPS=props||null;ctor.SELF_PROPS=self_props;ctor.SUBCLASSES=[];if(type){ctor.prototype.TYPE=ctor.TYPE=type}if(methods)for(i in methods)if(methods.hasOwnProperty(i)){if(/^\$/.test(i)){ctor[i.substr(1)]=methods[i]}else{ctor.prototype[i]=methods[i]}}ctor.DEFMETHOD=function(name,method){this.prototype[name]=method};return ctor}var AST_Token=DEFNODE("Token","type value line col pos endpos nlb comments_before file",{},null);var AST_Node=DEFNODE("Node","start end",{clone:function(){return new this.CTOR(this)},$documentation:"Base class of all AST nodes",$propdoc:{start:"[AST_Token] The first token of this node",end:"[AST_Token] The last token of this node"},_walk:function(visitor){return visitor._visit(this)},walk:function(visitor){return this._walk(visitor)}},null);AST_Node.warn_function=null;AST_Node.warn=function(txt,props){if(AST_Node.warn_function)AST_Node.warn_function(string_template(txt,props))};var AST_Statement=DEFNODE("Statement",null,{$documentation:"Base class of all statements"});var AST_Debugger=DEFNODE("Debugger",null,{$documentation:"Represents a debugger statement"},AST_Statement);var AST_Directive=DEFNODE("Directive","value scope",{$documentation:'Represents a directive, like "use strict";',$propdoc:{value:"[string] The value of this directive as a plain string (it's not an AST_String!)",scope:"[AST_Scope/S] The scope that this directive affects"}},AST_Statement);var AST_SimpleStatement=DEFNODE("SimpleStatement","body",{$documentation:"A statement consisting of an expression, i.e. a = 1 + 2",$propdoc:{body:"[AST_Node] an expression node (should not be instanceof AST_Statement)"},_walk:function(visitor){return visitor._visit(this,function(){this.body._walk(visitor)})}},AST_Statement);function walk_body(node,visitor){if(node.body instanceof AST_Statement){node.body._walk(visitor)}else node.body.forEach(function(stat){stat._walk(visitor)})}var AST_Block=DEFNODE("Block","body",{$documentation:"A body of statements (usually bracketed)",$propdoc:{body:"[AST_Statement*] an array of statements"},_walk:function(visitor){return visitor._visit(this,function(){walk_body(this,visitor)})}},AST_Statement);var AST_BlockStatement=DEFNODE("BlockStatement",null,{$documentation:"A block statement"},AST_Block);var AST_EmptyStatement=DEFNODE("EmptyStatement",null,{$documentation:"The empty statement (empty block or simply a semicolon)",_walk:function(visitor){return visitor._visit(this)}},AST_Statement);var AST_StatementWithBody=DEFNODE("StatementWithBody","body",{$documentation:"Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`",$propdoc:{body:"[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"},_walk:function(visitor){return visitor._visit(this,function(){this.body._walk(visitor)})}},AST_Statement);var AST_LabeledStatement=DEFNODE("LabeledStatement","label",{$documentation:"Statement with a label",$propdoc:{label:"[AST_Label] a label definition"},_walk:function(visitor){return visitor._visit(this,function(){this.label._walk(visitor);this.body._walk(visitor)})}},AST_StatementWithBody);var AST_DWLoop=DEFNODE("DWLoop","condition",{$documentation:"Base class for do/while statements",$propdoc:{condition:"[AST_Node] the loop condition.  Should not be instanceof AST_Statement"},_walk:function(visitor){return visitor._visit(this,function(){this.condition._walk(visitor);this.body._walk(visitor)})}},AST_StatementWithBody);var AST_Do=DEFNODE("Do",null,{$documentation:"A `do` statement"},AST_DWLoop);var AST_While=DEFNODE("While",null,{$documentation:"A `while` statement"},AST_DWLoop);var AST_For=DEFNODE("For","init condition step",{$documentation:"A `for` statement",$propdoc:{init:"[AST_Node?] the `for` initialization code, or null if empty",condition:"[AST_Node?] the `for` termination clause, or null if empty",step:"[AST_Node?] the `for` update clause, or null if empty"},_walk:function(visitor){return visitor._visit(this,function(){if(this.init)this.init._walk(visitor);if(this.condition)this.condition._walk(visitor);if(this.step)this.step._walk(visitor);this.body._walk(visitor)})}},AST_StatementWithBody);var AST_ForIn=DEFNODE("ForIn","init name object",{$documentation:"A `for ... in` statement",$propdoc:{init:"[AST_Node] the `for/in` initialization code",name:"[AST_SymbolRef?] the loop variable, only if `init` is AST_Var",object:"[AST_Node] the object that we're looping through"},_walk:function(visitor){return visitor._visit(this,function(){this.init._walk(visitor);this.object._walk(visitor);this.body._walk(visitor)})}},AST_StatementWithBody);var AST_With=DEFNODE("With","expression",{$documentation:"A `with` statement",$propdoc:{expression:"[AST_Node] the `with` expression"},_walk:function(visitor){return visitor._visit(this,function(){this.expression._walk(visitor);this.body._walk(visitor)})}},AST_StatementWithBody);var AST_Scope=DEFNODE("Scope","directives variables functions uses_with uses_eval parent_scope enclosed cname",{$documentation:"Base class for all statements introducing a lexical scope",$propdoc:{directives:"[string*/S] an array of directives declared in this scope",variables:"[Object/S] a map of name -> SymbolDef for all variables/functions defined in this scope",functions:"[Object/S] like `variables`, but only lists function declarations",uses_with:"[boolean/S] tells whether this scope uses the `with` statement",uses_eval:"[boolean/S] tells whether this scope contains a direct call to the global `eval`",parent_scope:"[AST_Scope?/S] link to the parent scope",enclosed:"[SymbolDef*/S] a list of all symbol definitions that are accessed from this scope or any subscopes",cname:"[integer/S] current index for mangling variables (used internally by the mangler)"}},AST_Block);var AST_Toplevel=DEFNODE("Toplevel","globals",{$documentation:"The toplevel scope",$propdoc:{globals:"[Object/S] a map of name -> SymbolDef for all undeclared names"},wrap_commonjs:function(name,export_all){var self=this;if(export_all){self.figure_out_scope();var to_export=[];self.walk(new TreeWalker(function(node){if(node instanceof AST_SymbolDeclaration&&node.definition().global){if(!find_if(function(n){return n.name==node.name},to_export))to_export.push(node)}}))}var wrapped_tl="(function(exports, global){ global['"+name+"'] = exports; '$ORIG'; '$EXPORTS'; }({}, (function(){return this}())))";wrapped_tl=parse(wrapped_tl);wrapped_tl=wrapped_tl.transform(new TreeTransformer(function before(node){if(node instanceof AST_SimpleStatement){node=node.body;if(node instanceof AST_String)switch(node.getValue()){case"$ORIG":return MAP.splice(self.body);case"$EXPORTS":var body=[];to_export.forEach(function(sym){body.push(new AST_SimpleStatement({body:new AST_Assign({left:new AST_Sub({expression:new AST_SymbolRef({name:"exports"}),property:new AST_String({value:sym.name})}),operator:"=",right:new AST_SymbolRef(sym)})}))});return MAP.splice(body)}}}));return wrapped_tl}},AST_Scope);var AST_Lambda=DEFNODE("Lambda","name argnames uses_arguments",{$documentation:"Base class for functions",$propdoc:{name:"[AST_SymbolDeclaration?] the name of this function",argnames:"[AST_SymbolFunarg*] array of function arguments",uses_arguments:"[boolean/S] tells whether this function accesses the arguments array"},_walk:function(visitor){return visitor._visit(this,function(){if(this.name)this.name._walk(visitor);this.argnames.forEach(function(arg){arg._walk(visitor)});walk_body(this,visitor)})}},AST_Scope);var AST_Function=DEFNODE("Function",null,{$documentation:"A function expression"},AST_Lambda);var AST_Defun=DEFNODE("Defun",null,{$documentation:"A function definition"},AST_Lambda);var AST_Jump=DEFNODE("Jump",null,{$documentation:"Base class for “jumps” (for now that's `return`, `throw`, `break` and `continue`)"},AST_Statement);var AST_Exit=DEFNODE("Exit","value",{$documentation:"Base class for “exits” (`return` and `throw`)",$propdoc:{value:"[AST_Node?] the value returned or thrown by this statement; could be null for AST_Return"},_walk:function(visitor){return visitor._visit(this,this.value&&function(){this.value._walk(visitor)})}},AST_Jump);var AST_Return=DEFNODE("Return",null,{$documentation:"A `return` statement"},AST_Exit);var AST_Throw=DEFNODE("Throw",null,{$documentation:"A `throw` statement"},AST_Exit);var AST_LoopControl=DEFNODE("LoopControl","label",{$documentation:"Base class for loop control statements (`break` and `continue`)",$propdoc:{label:"[AST_LabelRef?] the label, or null if none"},_walk:function(visitor){return visitor._visit(this,this.label&&function(){this.label._walk(visitor)})}},AST_Jump);var AST_Break=DEFNODE("Break",null,{$documentation:"A `break` statement"},AST_LoopControl);var AST_Continue=DEFNODE("Continue",null,{$documentation:"A `continue` statement"},AST_LoopControl);var AST_If=DEFNODE("If","condition alternative",{$documentation:"A `if` statement",$propdoc:{condition:"[AST_Node] the `if` condition",alternative:"[AST_Statement?] the `else` part, or null if not present"},_walk:function(visitor){return visitor._visit(this,function(){this.condition._walk(visitor);this.body._walk(visitor);if(this.alternative)this.alternative._walk(visitor)})}},AST_StatementWithBody);var AST_Switch=DEFNODE("Switch","expression",{$documentation:"A `switch` statement",$propdoc:{expression:"[AST_Node] the `switch` “discriminant”"},_walk:function(visitor){return visitor._visit(this,function(){this.expression._walk(visitor);walk_body(this,visitor)})}},AST_Block);var AST_SwitchBranch=DEFNODE("SwitchBranch",null,{$documentation:"Base class for `switch` branches"},AST_Block);var AST_Default=DEFNODE("Default",null,{$documentation:"A `default` switch branch"},AST_SwitchBranch);var AST_Case=DEFNODE("Case","expression",{$documentation:"A `case` switch branch",$propdoc:{expression:"[AST_Node] the `case` expression"},_walk:function(visitor){return visitor._visit(this,function(){this.expression._walk(visitor);walk_body(this,visitor)})}},AST_SwitchBranch);var AST_Try=DEFNODE("Try","bcatch bfinally",{$documentation:"A `try` statement",$propdoc:{bcatch:"[AST_Catch?] the catch block, or null if not present",bfinally:"[AST_Finally?] the finally block, or null if not present"},_walk:function(visitor){return visitor._visit(this,function(){walk_body(this,visitor);if(this.bcatch)this.bcatch._walk(visitor);if(this.bfinally)this.bfinally._walk(visitor)})}},AST_Block);var AST_Catch=DEFNODE("Catch","argname",{$documentation:"A `catch` node; only makes sense as part of a `try` statement",$propdoc:{argname:"[AST_SymbolCatch] symbol for the exception"},_walk:function(visitor){return visitor._visit(this,function(){this.argname._walk(visitor);walk_body(this,visitor)})}},AST_Block);var AST_Finally=DEFNODE("Finally",null,{$documentation:"A `finally` node; only makes sense as part of a `try` statement"},AST_Block);var AST_Definitions=DEFNODE("Definitions","definitions",{$documentation:"Base class for `var` or `const` nodes (variable declarations/initializations)",$propdoc:{definitions:"[AST_VarDef*] array of variable definitions"},_walk:function(visitor){return visitor._visit(this,function(){this.definitions.forEach(function(def){def._walk(visitor)})})}},AST_Statement);var AST_Var=DEFNODE("Var",null,{$documentation:"A `var` statement"},AST_Definitions);var AST_Const=DEFNODE("Const",null,{$documentation:"A `const` statement"},AST_Definitions);var AST_VarDef=DEFNODE("VarDef","name value",{$documentation:"A variable declaration; only appears in a AST_Definitions node",$propdoc:{name:"[AST_SymbolVar|AST_SymbolConst] name of the variable",value:"[AST_Node?] initializer, or null of there's no initializer"},_walk:function(visitor){return visitor._visit(this,function(){this.name._walk(visitor);if(this.value)this.value._walk(visitor)})}});var AST_Call=DEFNODE("Call","expression args",{$documentation:"A function call expression",$propdoc:{expression:"[AST_Node] expression to invoke as function",args:"[AST_Node*] array of arguments"},_walk:function(visitor){return visitor._visit(this,function(){this.expression._walk(visitor);this.args.forEach(function(arg){arg._walk(visitor)})})}});var AST_New=DEFNODE("New",null,{$documentation:"An object instantiation.  Derives from a function call since it has exactly the same properties"},AST_Call);var AST_Seq=DEFNODE("Seq","car cdr",{$documentation:"A sequence expression (two comma-separated expressions)",$propdoc:{car:"[AST_Node] first element in sequence",cdr:"[AST_Node] second element in sequence"},$cons:function(x,y){var seq=new AST_Seq(x);seq.car=x;seq.cdr=y;return seq},$from_array:function(array){if(array.length==0)return null;if(array.length==1)return array[0].clone();var list=null;for(var i=array.length;--i>=0;){list=AST_Seq.cons(array[i],list)}var p=list;while(p){if(p.cdr&&!p.cdr.cdr){p.cdr=p.cdr.car;break}p=p.cdr}return list},to_array:function(){var p=this,a=[];while(p){a.push(p.car);if(p.cdr&&!(p.cdr instanceof AST_Seq)){a.push(p.cdr);break}p=p.cdr}return a},add:function(node){var p=this;while(p){if(!(p.cdr instanceof AST_Seq)){var cell=AST_Seq.cons(p.cdr,node);return p.cdr=cell}p=p.cdr}},_walk:function(visitor){return visitor._visit(this,function(){this.car._walk(visitor);if(this.cdr)this.cdr._walk(visitor)})}});var AST_PropAccess=DEFNODE("PropAccess","expression property",{$documentation:'Base class for property access expressions, i.e. `a.foo` or `a["foo"]`',$propdoc:{expression:"[AST_Node] the “container” expression",property:"[AST_Node|string] the property to access.  For AST_Dot this is always a plain string, while for AST_Sub it's an arbitrary AST_Node"}});var AST_Dot=DEFNODE("Dot",null,{$documentation:"A dotted property access expression",_walk:function(visitor){return visitor._visit(this,function(){this.expression._walk(visitor)})}},AST_PropAccess);var AST_Sub=DEFNODE("Sub",null,{$documentation:'Index-style property access, i.e. `a["foo"]`',_walk:function(visitor){return visitor._visit(this,function(){this.expression._walk(visitor);this.property._walk(visitor)})}},AST_PropAccess);var AST_Unary=DEFNODE("Unary","operator expression",{$documentation:"Base class for unary expressions",$propdoc:{operator:"[string] the operator",expression:"[AST_Node] expression that this unary operator applies to"},_walk:function(visitor){return visitor._visit(this,function(){this.expression._walk(visitor)})}});var AST_UnaryPrefix=DEFNODE("UnaryPrefix",null,{$documentation:"Unary prefix expression, i.e. `typeof i` or `++i`"},AST_Unary);var AST_UnaryPostfix=DEFNODE("UnaryPostfix",null,{$documentation:"Unary postfix expression, i.e. `i++`"},AST_Unary);var AST_Binary=DEFNODE("Binary","left operator right",{$documentation:"Binary expression, i.e. `a + b`",$propdoc:{left:"[AST_Node] left-hand side expression",operator:"[string] the operator",right:"[AST_Node] right-hand side expression"},_walk:function(visitor){return visitor._visit(this,function(){this.left._walk(visitor);this.right._walk(visitor)})}});var AST_Conditional=DEFNODE("Conditional","condition consequent alternative",{$documentation:"Conditional expression using the ternary operator, i.e. `a ? b : c`",$propdoc:{condition:"[AST_Node]",consequent:"[AST_Node]",alternative:"[AST_Node]"},_walk:function(visitor){return visitor._visit(this,function(){this.condition._walk(visitor);this.consequent._walk(visitor);this.alternative._walk(visitor)})}});var AST_Assign=DEFNODE("Assign",null,{$documentation:"An assignment expression — `a = b + 5`"},AST_Binary);var AST_Array=DEFNODE("Array","elements",{$documentation:"An array literal",$propdoc:{elements:"[AST_Node*] array of elements"},_walk:function(visitor){return visitor._visit(this,function(){this.elements.forEach(function(el){el._walk(visitor)})})}});var AST_Object=DEFNODE("Object","properties",{$documentation:"An object literal",$propdoc:{properties:"[AST_ObjectProperty*] array of properties"},_walk:function(visitor){return visitor._visit(this,function(){this.properties.forEach(function(prop){prop._walk(visitor)})})}});var AST_ObjectProperty=DEFNODE("ObjectProperty","key value",{$documentation:"Base class for literal object properties",$propdoc:{key:"[string] the property name; it's always a plain string in our AST, no matter if it was a string, number or identifier in original code",value:"[AST_Node] property value.  For setters and getters this is an AST_Function."},_walk:function(visitor){return visitor._visit(this,function(){this.value._walk(visitor)})}});var AST_ObjectKeyVal=DEFNODE("ObjectKeyVal",null,{$documentation:"A key: value object property"},AST_ObjectProperty);var AST_ObjectSetter=DEFNODE("ObjectSetter",null,{$documentation:"An object setter property"},AST_ObjectProperty);var AST_ObjectGetter=DEFNODE("ObjectGetter",null,{$documentation:"An object getter property"},AST_ObjectProperty);var AST_Symbol=DEFNODE("Symbol","scope name thedef",{$propdoc:{name:"[string] name of this symbol",scope:"[AST_Scope/S] the current scope (not necessarily the definition scope)",thedef:"[SymbolDef/S] the definition of this symbol"},$documentation:"Base class for all symbols"});var AST_SymbolDeclaration=DEFNODE("SymbolDeclaration","init",{$documentation:"A declaration symbol (symbol in var/const, function name or argument, symbol in catch)",$propdoc:{init:"[AST_Node*/S] array of initializers for this declaration."}},AST_Symbol);var AST_SymbolVar=DEFNODE("SymbolVar",null,{$documentation:"Symbol defining a variable"},AST_SymbolDeclaration);var AST_SymbolConst=DEFNODE("SymbolConst",null,{$documentation:"A constant declaration"},AST_SymbolDeclaration);var AST_SymbolFunarg=DEFNODE("SymbolFunarg",null,{$documentation:"Symbol naming a function argument"},AST_SymbolVar);var AST_SymbolDefun=DEFNODE("SymbolDefun",null,{$documentation:"Symbol defining a function"},AST_SymbolDeclaration);var AST_SymbolLambda=DEFNODE("SymbolLambda",null,{$documentation:"Symbol naming a function expression"},AST_SymbolDeclaration);var AST_SymbolCatch=DEFNODE("SymbolCatch",null,{$documentation:"Symbol naming the exception in catch"},AST_SymbolDeclaration);var AST_Label=DEFNODE("Label","references",{$documentation:"Symbol naming a label (declaration)",$propdoc:{references:"[AST_LabelRef*] a list of nodes referring to this label"}},AST_Symbol);var AST_SymbolRef=DEFNODE("SymbolRef",null,{$documentation:"Reference to some symbol (not definition/declaration)"},AST_Symbol);var AST_LabelRef=DEFNODE("LabelRef",null,{$documentation:"Reference to a label symbol"},AST_SymbolRef);var AST_This=DEFNODE("This",null,{$documentation:"The `this` symbol"},AST_Symbol);var AST_Constant=DEFNODE("Constant",null,{$documentation:"Base class for all constants",getValue:function(){return this.value}});var AST_String=DEFNODE("String","value",{$documentation:"A string literal",$propdoc:{value:"[string] the contents of this string"}},AST_Constant);var AST_Number=DEFNODE("Number","value",{$documentation:"A number literal",$propdoc:{value:"[number] the numeric value"}},AST_Constant);var AST_RegExp=DEFNODE("RegExp","value",{$documentation:"A regexp literal",$propdoc:{value:"[RegExp] the actual regexp"}},AST_Constant);var AST_Atom=DEFNODE("Atom",null,{$documentation:"Base class for atoms"},AST_Constant);var AST_Null=DEFNODE("Null",null,{$documentation:"The `null` atom",value:null},AST_Atom);var AST_NaN=DEFNODE("NaN",null,{$documentation:"The impossible value",value:0/0},AST_Atom);var AST_Undefined=DEFNODE("Undefined",null,{$documentation:"The `undefined` value",value:function(){}()},AST_Atom);var AST_Infinity=DEFNODE("Infinity",null,{$documentation:"The `Infinity` value",value:1/0},AST_Atom);var AST_Boolean=DEFNODE("Boolean",null,{$documentation:"Base class for booleans"},AST_Atom);var AST_False=DEFNODE("False",null,{$documentation:"The `false` atom",value:false},AST_Boolean);var AST_True=DEFNODE("True",null,{$documentation:"The `true` atom",value:true},AST_Boolean);function TreeWalker(callback){this.visit=callback;this.stack=[]}TreeWalker.prototype={_visit:function(node,descend){this.stack.push(node);var ret=this.visit(node,descend?function(){descend.call(node)}:noop);if(!ret&&descend){descend.call(node)}this.stack.pop();return ret},parent:function(n){return this.stack[this.stack.length-2-(n||0)]},push:function(node){this.stack.push(node)},pop:function(){return this.stack.pop()},self:function(){return this.stack[this.stack.length-1]},find_parent:function(type){var stack=this.stack;for(var i=stack.length;--i>=0;){var x=stack[i];if(x instanceof type)return x}},in_boolean_context:function(){var stack=this.stack;var i=stack.length,self=stack[--i];while(i>0){var p=stack[--i];if(p instanceof AST_If&&p.condition===self||p instanceof AST_Conditional&&p.condition===self||p instanceof AST_DWLoop&&p.condition===self||p instanceof AST_For&&p.condition===self||p instanceof AST_UnaryPrefix&&p.operator=="!"&&p.expression===self){return true}if(!(p instanceof AST_Binary&&(p.operator=="&&"||p.operator=="||")))return false;self=p}},loopcontrol_target:function(label){var stack=this.stack;if(label){for(var i=stack.length;--i>=0;){var x=stack[i];if(x instanceof AST_LabeledStatement&&x.label.name==label.name){return x.body}}}else{for(var i=stack.length;--i>=0;){var x=stack[i];if(x instanceof AST_Switch||x instanceof AST_For||x instanceof AST_ForIn||x instanceof AST_DWLoop)return x}}}};"use strict";var KEYWORDS="break case catch const continue debugger default delete do else finally for function if in instanceof new return switch throw try typeof var void while with";var KEYWORDS_ATOM="false null true";var RESERVED_WORDS="abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized this throws transient volatile"+" "+KEYWORDS_ATOM+" "+KEYWORDS;var KEYWORDS_BEFORE_EXPRESSION="return new delete throw else case";KEYWORDS=makePredicate(KEYWORDS);RESERVED_WORDS=makePredicate(RESERVED_WORDS);KEYWORDS_BEFORE_EXPRESSION=makePredicate(KEYWORDS_BEFORE_EXPRESSION);KEYWORDS_ATOM=makePredicate(KEYWORDS_ATOM);var OPERATOR_CHARS=makePredicate(characters("+-*&%=<>!?|~^"));var RE_HEX_NUMBER=/^0x[0-9a-f]+$/i;var RE_OCT_NUMBER=/^0[0-7]+$/;var RE_DEC_NUMBER=/^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i;var OPERATORS=makePredicate(["in","instanceof","typeof","new","void","delete","++","--","+","-","!","~","&","|","^","*","/","%",">>","<<",">>>","<",">","<=",">=","==","===","!=","!==","?","=","+=","-=","/=","*=","%=",">>=","<<=",">>>=","|=","^=","&=","&&","||"]);var WHITESPACE_CHARS=makePredicate(characters("  \n\r	\f​᠎             　"));var PUNC_BEFORE_EXPRESSION=makePredicate(characters("[{(,.;:"));var PUNC_CHARS=makePredicate(characters("[]{}(),;:"));var REGEXP_MODIFIERS=makePredicate(characters("gmsiy"));var UNICODE={letter:new RegExp("[\\u0041-\\u005A\\u0061-\\u007A\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u0523\\u0531-\\u0556\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0621-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07FA\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0971\\u0972\\u097B-\\u097F\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C33\\u0C35-\\u0C39\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CBD\\u0CDE\\u0CE0\\u0CE1\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D28\\u0D2A-\\u0D39\\u0D3D\\u0D60\\u0D61\\u0D7A-\\u0D7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0EC6\\u0EDC\\u0EDD\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0F88-\\u0F8B\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\u108E\\u10A0-\\u10C5\\u10D0-\\u10FA\\u10FC\\u1100-\\u1159\\u115F-\\u11A2\\u11A8-\\u11F9\\u1200-\\u1248\\u124A-\\u124D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u128A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u1401-\\u166C\\u166F-\\u1676\\u1681-\\u169A\\u16A0-\\u16EA\\u1700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC\\u1820-\\u1877\\u1880-\\u18A8\\u18AA\\u1900-\\u191C\\u1950-\\u196D\\u1970-\\u1974\\u1980-\\u19A9\\u19C1-\\u19C7\\u1A00-\\u1A16\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\u1BAE\\u1BAF\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C7D\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2071\\u207F\\u2090-\\u2094\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213C-\\u213F\\u2145-\\u2149\\u214E\\u2183\\u2184\\u2C00-\\u2C2E\\u2C30-\\u2C5E\\u2C60-\\u2C6F\\u2C71-\\u2C7D\\u2C80-\\u2CE4\\u2D00-\\u2D25\\u2D30-\\u2D65\\u2D6F\\u2D80-\\u2D96\\u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2DDE\\u2E2F\\u3005\\u3006\\u3031-\\u3035\\u303B\\u303C\\u3041-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3105-\\u312D\\u3131-\\u318E\\u31A0-\\u31B7\\u31F0-\\u31FF\\u3400\\u4DB5\\u4E00\\u9FC3\\uA000-\\uA48C\\uA500-\\uA60C\\uA610-\\uA61F\\uA62A\\uA62B\\uA640-\\uA65F\\uA662-\\uA66E\\uA67F-\\uA697\\uA717-\\uA71F\\uA722-\\uA788\\uA78B\\uA78C\\uA7FB-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA822\\uA840-\\uA873\\uA882-\\uA8B3\\uA90A-\\uA925\\uA930-\\uA946\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAC00\\uD7A3\\uF900-\\uFA2D\\uFA30-\\uFA6A\\uFA70-\\uFAD9\\uFB00-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\uFDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF21-\\uFF3A\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFFCF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]"),non_spacing_mark:new RegExp("[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u065E\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-\\u082D\\u0900-\\u0902\\u093C\\u0941-\\u0948\\u094D\\u0951-\\u0955\\u0962\\u0963\\u0981\\u09BC\\u09C1-\\u09C4\\u09CD\\u09E2\\u09E3\\u0A01\\u0A02\\u0A3C\\u0A41\\u0A42\\u0A47\\u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81\\u0A82\\u0ABC\\u0AC1-\\u0AC5\\u0AC7\\u0AC8\\u0ACD\\u0AE2\\u0AE3\\u0B01\\u0B3C\\u0B3F\\u0B41-\\u0B44\\u0B4D\\u0B56\\u0B62\\u0B63\\u0B82\\u0BC0\\u0BCD\\u0C3E-\\u0C40\\u0C46-\\u0C48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0CBC\\u0CBF\\u0CC6\\u0CCC\\u0CCD\\u0CE2\\u0CE3\\u0D41-\\u0D44\\u0D4D\\u0D62\\u0D63\\u0DCA\\u0DD2-\\u0DD4\\u0DD6\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F71-\\u0F7E\\u0F80-\\u0F84\\u0F86\\u0F87\\u0F90-\\u0F97\\u0F99-\\u0FBC\\u0FC6\\u102D-\\u1030\\u1032-\\u1037\\u1039\\u103A\\u103D\\u103E\\u1058\\u1059\\u105E-\\u1060\\u1071-\\u1074\\u1082\\u1085\\u1086\\u108D\\u109D\\u135F\\u1712-\\u1714\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B7-\\u17BD\\u17C6\\u17C9-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920-\\u1922\\u1927\\u1928\\u1932\\u1939-\\u193B\\u1A17\\u1A18\\u1A56\\u1A58-\\u1A5E\\u1A60\\u1A62\\u1A65-\\u1A6C\\u1A73-\\u1A7C\\u1A7F\\u1B00-\\u1B03\\u1B34\\u1B36-\\u1B3A\\u1B3C\\u1B42\\u1B6B-\\u1B73\\u1B80\\u1B81\\u1BA2-\\u1BA5\\u1BA8\\u1BA9\\u1C2C-\\u1C33\\u1C36\\u1C37\\u1CD0-\\u1CD2\\u1CD4-\\u1CE0\\u1CE2-\\u1CE8\\u1CED\\u1DC0-\\u1DE6\\u1DFD-\\u1DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA67C\\uA67D\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA825\\uA826\\uA8C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA951\\uA980-\\uA982\\uA9B3\\uA9B6-\\uA9B9\\uA9BC\\uAA29-\\uAA2E\\uAA31\\uAA32\\uAA35\\uAA36\\uAA43\\uAA4C\\uAAB0\\uAAB2-\\uAAB4\\uAAB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uABE5\\uABE8\\uABED\\uFB1E\\uFE00-\\uFE0F\\uFE20-\\uFE26]"),space_combining_mark:new RegExp("[\\u0903\\u093E-\\u0940\\u0949-\\u094C\\u094E\\u0982\\u0983\\u09BE-\\u09C0\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7\\u0A03\\u0A3E-\\u0A40\\u0A83\\u0ABE-\\u0AC0\\u0AC9\\u0ACB\\u0ACC\\u0B02\\u0B03\\u0B3E\\u0B40\\u0B47\\u0B48\\u0B4B\\u0B4C\\u0B57\\u0BBE\\u0BBF\\u0BC1\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\u0BCC\\u0BD7\\u0C01-\\u0C03\\u0C41-\\u0C44\\u0C82\\u0C83\\u0CBE\\u0CC0-\\u0CC4\\u0CC7\\u0CC8\\u0CCA\\u0CCB\\u0CD5\\u0CD6\\u0D02\\u0D03\\u0D3E-\\u0D40\\u0D46-\\u0D48\\u0D4A-\\u0D4C\\u0D57\\u0D82\\u0D83\\u0DCF-\\u0DD1\\u0DD8-\\u0DDF\\u0DF2\\u0DF3\\u0F3E\\u0F3F\\u0F7F\\u102B\\u102C\\u1031\\u1038\\u103B\\u103C\\u1056\\u1057\\u1062-\\u1064\\u1067-\\u106D\\u1083\\u1084\\u1087-\\u108C\\u108F\\u109A-\\u109C\\u17B6\\u17BE-\\u17C5\\u17C7\\u17C8\\u1923-\\u1926\\u1929-\\u192B\\u1930\\u1931\\u1933-\\u1938\\u19B0-\\u19C0\\u19C8\\u19C9\\u1A19-\\u1A1B\\u1A55\\u1A57\\u1A61\\u1A63\\u1A64\\u1A6D-\\u1A72\\u1B04\\u1B35\\u1B3B\\u1B3D-\\u1B41\\u1B43\\u1B44\\u1B82\\u1BA1\\u1BA6\\u1BA7\\u1BAA\\u1C24-\\u1C2B\\u1C34\\u1C35\\u1CE1\\u1CF2\\uA823\\uA824\\uA827\\uA880\\uA881\\uA8B4-\\uA8C3\\uA952\\uA953\\uA983\\uA9B4\\uA9B5\\uA9BA\\uA9BB\\uA9BD-\\uA9C0\\uAA2F\\uAA30\\uAA33\\uAA34\\uAA4D\\uAA7B\\uABE3\\uABE4\\uABE6\\uABE7\\uABE9\\uABEA\\uABEC]"),connector_punctuation:new RegExp("[\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]")};
function is_letter(code){return code>=97&&code<=122||code>=65&&code<=90||code>=170&&UNICODE.letter.test(String.fromCharCode(code))}function is_digit(code){return code>=48&&code<=57}function is_alphanumeric_char(code){return is_digit(code)||is_letter(code)}function is_unicode_combining_mark(ch){return UNICODE.non_spacing_mark.test(ch)||UNICODE.space_combining_mark.test(ch)}function is_unicode_connector_punctuation(ch){return UNICODE.connector_punctuation.test(ch)}function is_identifier(name){return/^[a-z_$][a-z0-9_$]*$/i.test(name)&&!RESERVED_WORDS(name)}function is_identifier_start(code){return code==36||code==95||is_letter(code)}function is_identifier_char(ch){var code=ch.charCodeAt(0);return is_identifier_start(code)||is_digit(code)||code==8204||code==8205||is_unicode_combining_mark(ch)||is_unicode_connector_punctuation(ch)}function parse_js_number(num){if(RE_HEX_NUMBER.test(num)){return parseInt(num.substr(2),16)}else if(RE_OCT_NUMBER.test(num)){return parseInt(num.substr(1),8)}else if(RE_DEC_NUMBER.test(num)){return parseFloat(num)}}function JS_Parse_Error(message,line,col,pos){this.message=message;this.line=line;this.col=col;this.pos=pos;this.stack=(new Error).stack}JS_Parse_Error.prototype.toString=function(){return this.message+" (line: "+this.line+", col: "+this.col+", pos: "+this.pos+")"+"\n\n"+this.stack};function js_error(message,filename,line,col,pos){AST_Node.warn("ERROR: {message} [{file}:{line},{col}]",{message:message,file:filename,line:line,col:col});throw new JS_Parse_Error(message,line,col,pos)}function is_token(token,type,val){return token.type==type&&(val==null||token.value==val)}var EX_EOF={};function tokenizer($TEXT,filename){var S={text:$TEXT.replace(/\r\n?|[\n\u2028\u2029]/g,"\n").replace(/\uFEFF/g,""),filename:filename,pos:0,tokpos:0,line:1,tokline:0,col:0,tokcol:0,newline_before:false,regex_allowed:false,comments_before:[]};function peek(){return S.text.charAt(S.pos)}function next(signal_eof,in_string){var ch=S.text.charAt(S.pos++);if(signal_eof&&!ch)throw EX_EOF;if(ch=="\n"){S.newline_before=S.newline_before||!in_string;++S.line;S.col=0}else{++S.col}return ch}function find(what,signal_eof){var pos=S.text.indexOf(what,S.pos);if(signal_eof&&pos==-1)throw EX_EOF;return pos}function start_token(){S.tokline=S.line;S.tokcol=S.col;S.tokpos=S.pos}function token(type,value,is_comment){S.regex_allowed=type=="operator"&&!UNARY_POSTFIX[value]||type=="keyword"&&KEYWORDS_BEFORE_EXPRESSION(value)||type=="punc"&&PUNC_BEFORE_EXPRESSION(value);var ret={type:type,value:value,line:S.tokline,col:S.tokcol,pos:S.tokpos,endpos:S.pos,nlb:S.newline_before,file:filename};if(!is_comment){ret.comments_before=S.comments_before;S.comments_before=[];for(var i=0,len=ret.comments_before.length;i<len;i++){ret.nlb=ret.nlb||ret.comments_before[i].nlb}}S.newline_before=false;return new AST_Token(ret)}function skip_whitespace(){while(WHITESPACE_CHARS(peek()))next()}function read_while(pred){var ret="",ch,i=0;while((ch=peek())&&pred(ch,i++))ret+=next();return ret}function parse_error(err){js_error(err,filename,S.tokline,S.tokcol,S.tokpos)}function read_num(prefix){var has_e=false,after_e=false,has_x=false,has_dot=prefix==".";var num=read_while(function(ch,i){var code=ch.charCodeAt(0);switch(code){case 120:case 88:return has_x?false:has_x=true;case 101:case 69:return has_x?true:has_e?false:has_e=after_e=true;case 45:return after_e||i==0&&!prefix;case 43:return after_e;case after_e=false,46:return!has_dot&&!has_x&&!has_e?has_dot=true:false}return is_alphanumeric_char(code)});if(prefix)num=prefix+num;var valid=parse_js_number(num);if(!isNaN(valid)){return token("num",valid)}else{parse_error("Invalid syntax: "+num)}}function read_escaped_char(in_string){var ch=next(true,in_string);switch(ch.charCodeAt(0)){case 110:return"\n";case 114:return"\r";case 116:return"	";case 98:return"\b";case 118:return"";case 102:return"\f";case 48:return"\0";case 120:return String.fromCharCode(hex_bytes(2));case 117:return String.fromCharCode(hex_bytes(4));case 10:return"";default:return ch}}function hex_bytes(n){var num=0;for(;n>0;--n){var digit=parseInt(next(true),16);if(isNaN(digit))parse_error("Invalid hex-character pattern in string");num=num<<4|digit}return num}var read_string=with_eof_error("Unterminated string constant",function(){var quote=next(),ret="";for(;;){var ch=next(true);if(ch=="\\"){var octal_len=0,first=null;ch=read_while(function(ch){if(ch>="0"&&ch<="7"){if(!first){first=ch;return++octal_len}else if(first<="3"&&octal_len<=2)return++octal_len;else if(first>="4"&&octal_len<=1)return++octal_len}return false});if(octal_len>0)ch=String.fromCharCode(parseInt(ch,8));else ch=read_escaped_char(true)}else if(ch==quote)break;ret+=ch}return token("string",ret)});function read_line_comment(){next();var i=find("\n"),ret;if(i==-1){ret=S.text.substr(S.pos);S.pos=S.text.length}else{ret=S.text.substring(S.pos,i);S.pos=i}return token("comment1",ret,true)}var read_multiline_comment=with_eof_error("Unterminated multiline comment",function(){next();var i=find("*/",true);var text=S.text.substring(S.pos,i);var a=text.split("\n"),n=a.length;S.pos=i+2;S.line+=n-1;if(n>1)S.col=a[n-1].length;else S.col+=a[n-1].length;S.col+=2;S.newline_before=S.newline_before||text.indexOf("\n")>=0;return token("comment2",text,true)});function read_name(){var backslash=false,name="",ch,escaped=false,hex;while((ch=peek())!=null){if(!backslash){if(ch=="\\")escaped=backslash=true,next();else if(is_identifier_char(ch))name+=next();else break}else{if(ch!="u")parse_error("Expecting UnicodeEscapeSequence -- uXXXX");ch=read_escaped_char();if(!is_identifier_char(ch))parse_error("Unicode char: "+ch.charCodeAt(0)+" is not valid in identifier");name+=ch;backslash=false}}if(KEYWORDS(name)&&escaped){hex=name.charCodeAt(0).toString(16).toUpperCase();name="\\u"+"0000".substr(hex.length)+hex+name.slice(1)}return name}var read_regexp=with_eof_error("Unterminated regular expression",function(regexp){var prev_backslash=false,ch,in_class=false;while(ch=next(true))if(prev_backslash){regexp+="\\"+ch;prev_backslash=false}else if(ch=="["){in_class=true;regexp+=ch}else if(ch=="]"&&in_class){in_class=false;regexp+=ch}else if(ch=="/"&&!in_class){break}else if(ch=="\\"){prev_backslash=true}else{regexp+=ch}var mods=read_name();return token("regexp",new RegExp(regexp,mods))});function read_operator(prefix){function grow(op){if(!peek())return op;var bigger=op+peek();if(OPERATORS(bigger)){next();return grow(bigger)}else{return op}}return token("operator",grow(prefix||next()))}function handle_slash(){next();var regex_allowed=S.regex_allowed;switch(peek()){case"/":S.comments_before.push(read_line_comment());S.regex_allowed=regex_allowed;return next_token();case"*":S.comments_before.push(read_multiline_comment());S.regex_allowed=regex_allowed;return next_token()}return S.regex_allowed?read_regexp(""):read_operator("/")}function handle_dot(){next();return is_digit(peek().charCodeAt(0))?read_num("."):token("punc",".")}function read_word(){var word=read_name();return KEYWORDS_ATOM(word)?token("atom",word):!KEYWORDS(word)?token("name",word):OPERATORS(word)?token("operator",word):token("keyword",word)}function with_eof_error(eof_error,cont){return function(x){try{return cont(x)}catch(ex){if(ex===EX_EOF)parse_error(eof_error);else throw ex}}}function next_token(force_regexp){if(force_regexp!=null)return read_regexp(force_regexp);skip_whitespace();start_token();var ch=peek();if(!ch)return token("eof");var code=ch.charCodeAt(0);switch(code){case 34:case 39:return read_string();case 46:return handle_dot();case 47:return handle_slash()}if(is_digit(code))return read_num();if(PUNC_CHARS(ch))return token("punc",next());if(OPERATOR_CHARS(ch))return read_operator();if(code==92||is_identifier_start(code))return read_word();parse_error("Unexpected character '"+ch+"'")}next_token.context=function(nc){if(nc)S=nc;return S};return next_token}var UNARY_PREFIX=makePredicate(["typeof","void","delete","--","++","!","~","-","+"]);var UNARY_POSTFIX=makePredicate(["--","++"]);var ASSIGNMENT=makePredicate(["=","+=","-=","/=","*=","%=",">>=","<<=",">>>=","|=","^=","&="]);var PRECEDENCE=function(a,ret){for(var i=0,n=1;i<a.length;++i,++n){var b=a[i];for(var j=0;j<b.length;++j){ret[b[j]]=n}}return ret}([["||"],["&&"],["|"],["^"],["&"],["==","===","!=","!=="],["<",">","<=",">=","in","instanceof"],[">>","<<",">>>"],["+","-"],["*","/","%"]],{});var STATEMENTS_WITH_LABELS=array_to_hash(["for","do","while","switch"]);var ATOMIC_START_TOKEN=array_to_hash(["atom","num","string","regexp","name"]);function parse($TEXT,options){options=defaults(options,{strict:false,filename:null,toplevel:null});var S={input:typeof $TEXT=="string"?tokenizer($TEXT,options.filename):$TEXT,token:null,prev:null,peeked:null,in_function:0,in_directives:true,in_loop:0,labels:[]};S.token=next();function is(type,value){return is_token(S.token,type,value)}function peek(){return S.peeked||(S.peeked=S.input())}function next(){S.prev=S.token;if(S.peeked){S.token=S.peeked;S.peeked=null}else{S.token=S.input()}S.in_directives=S.in_directives&&(S.token.type=="string"||is("punc",";"));return S.token}function prev(){return S.prev}function croak(msg,line,col,pos){var ctx=S.input.context();js_error(msg,ctx.filename,line!=null?line:ctx.tokline,col!=null?col:ctx.tokcol,pos!=null?pos:ctx.tokpos)}function token_error(token,msg){croak(msg,token.line,token.col)}function unexpected(token){if(token==null)token=S.token;token_error(token,"Unexpected token: "+token.type+" ("+token.value+")")}function expect_token(type,val){if(is(type,val)){return next()}token_error(S.token,"Unexpected token "+S.token.type+" «"+S.token.value+"»"+", expected "+type+" «"+val+"»")}function expect(punc){return expect_token("punc",punc)}function can_insert_semicolon(){return!options.strict&&(S.token.nlb||is("eof")||is("punc","}"))}function semicolon(){if(is("punc",";"))next();else if(!can_insert_semicolon())unexpected()}function parenthesised(){expect("(");var exp=expression(true);expect(")");return exp}function embed_tokens(parser){return function(){var start=S.token;var expr=parser();var end=prev();expr.start=start;expr.end=end;return expr}}var statement=embed_tokens(function(){var tmp;if(is("operator","/")||is("operator","/=")){S.peeked=null;S.token=S.input(S.token.value.substr(1))}switch(S.token.type){case"string":var dir=S.in_directives,stat=simple_statement();if(dir&&stat.body instanceof AST_String&&!is("punc",","))return new AST_Directive({value:stat.body.value});return stat;case"num":case"regexp":case"operator":case"atom":return simple_statement();case"name":return is_token(peek(),"punc",":")?labeled_statement():simple_statement();case"punc":switch(S.token.value){case"{":return new AST_BlockStatement({start:S.token,body:block_(),end:prev()});case"[":case"(":return simple_statement();case";":next();return new AST_EmptyStatement;default:unexpected()}case"keyword":switch(tmp=S.token.value,next(),tmp){case"break":return break_cont(AST_Break);case"continue":return break_cont(AST_Continue);case"debugger":semicolon();return new AST_Debugger;case"do":return new AST_Do({body:in_loop(statement),condition:(expect_token("keyword","while"),tmp=parenthesised(),semicolon(),tmp)});case"while":return new AST_While({condition:parenthesised(),body:in_loop(statement)});case"for":return for_();case"function":return function_(true);case"if":return if_();case"return":if(S.in_function==0)croak("'return' outside of function");return new AST_Return({value:is("punc",";")?(next(),null):can_insert_semicolon()?null:(tmp=expression(true),semicolon(),tmp)});case"switch":return new AST_Switch({expression:parenthesised(),body:in_loop(switch_body_)});case"throw":if(S.token.nlb)croak("Illegal newline after 'throw'");return new AST_Throw({value:(tmp=expression(true),semicolon(),tmp)});case"try":return try_();case"var":return tmp=var_(),semicolon(),tmp;case"const":return tmp=const_(),semicolon(),tmp;case"with":return new AST_With({expression:parenthesised(),body:statement()});default:unexpected()}}});function labeled_statement(){var label=as_symbol(AST_Label);if(find_if(function(l){return l.name==label.name},S.labels)){croak("Label "+label.name+" defined twice")}expect(":");S.labels.push(label);var stat=statement();S.labels.pop();return new AST_LabeledStatement({body:stat,label:label})}function simple_statement(tmp){return new AST_SimpleStatement({body:(tmp=expression(true),semicolon(),tmp)})}function break_cont(type){var label=null;if(!can_insert_semicolon()){label=as_symbol(AST_LabelRef,true)}if(label!=null){if(!find_if(function(l){return l.name==label.name},S.labels))croak("Undefined label "+label.name)}else if(S.in_loop==0)croak(type.TYPE+" not inside a loop or switch");semicolon();return new type({label:label})}function for_(){expect("(");var init=null;if(!is("punc",";")){init=is("keyword","var")?(next(),var_(true)):expression(true,true);if(is("operator","in")){if(init instanceof AST_Var&&init.definitions.length>1)croak("Only one variable declaration allowed in for..in loop");next();return for_in(init)}}return regular_for(init)}function regular_for(init){expect(";");var test=is("punc",";")?null:expression(true);expect(";");var step=is("punc",")")?null:expression(true);expect(")");return new AST_For({init:init,condition:test,step:step,body:in_loop(statement)})}function for_in(init){var lhs=init instanceof AST_Var?init.definitions[0].name:null;var obj=expression(true);expect(")");return new AST_ForIn({init:init,name:lhs,object:obj,body:in_loop(statement)})}var function_=function(in_statement,ctor){var name=is("name")?as_symbol(in_statement?AST_SymbolDefun:AST_SymbolLambda):null;if(in_statement&&!name)unexpected();expect("(");if(!ctor)ctor=in_statement?AST_Defun:AST_Function;return new ctor({name:name,argnames:function(first,a){while(!is("punc",")")){if(first)first=false;else expect(",");a.push(as_symbol(AST_SymbolFunarg))}next();return a}(true,[]),body:function(loop,labels){++S.in_function;S.in_directives=true;S.in_loop=0;S.labels=[];var a=block_();--S.in_function;S.in_loop=loop;S.labels=labels;return a}(S.in_loop,S.labels)})};function if_(){var cond=parenthesised(),body=statement(),belse=null;if(is("keyword","else")){next();belse=statement()}return new AST_If({condition:cond,body:body,alternative:belse})}function block_(){expect("{");var a=[];while(!is("punc","}")){if(is("eof"))unexpected();a.push(statement())}next();return a}function switch_body_(){expect("{");var a=[],cur=null,branch=null,tmp;while(!is("punc","}")){if(is("eof"))unexpected();if(is("keyword","case")){if(branch)branch.end=prev();cur=[];branch=new AST_Case({start:(tmp=S.token,next(),tmp),expression:expression(true),body:cur});a.push(branch);expect(":")}else if(is("keyword","default")){if(branch)branch.end=prev();cur=[];branch=new AST_Default({start:(tmp=S.token,next(),expect(":"),tmp),body:cur});a.push(branch)}else{if(!cur)unexpected();cur.push(statement())}}if(branch)branch.end=prev();next();return a}function try_(){var body=block_(),bcatch=null,bfinally=null;if(is("keyword","catch")){var start=S.token;next();expect("(");var name=as_symbol(AST_SymbolCatch);expect(")");bcatch=new AST_Catch({start:start,argname:name,body:block_(),end:prev()})}if(is("keyword","finally")){var start=S.token;next();bfinally=new AST_Finally({start:start,body:block_(),end:prev()})}if(!bcatch&&!bfinally)croak("Missing catch/finally blocks");return new AST_Try({body:body,bcatch:bcatch,bfinally:bfinally})}function vardefs(no_in,in_const){var a=[];for(;;){a.push(new AST_VarDef({start:S.token,name:as_symbol(in_const?AST_SymbolConst:AST_SymbolVar),value:is("operator","=")?(next(),expression(false,no_in)):null,end:prev()}));if(!is("punc",","))break;next()}return a}var var_=function(no_in){return new AST_Var({start:prev(),definitions:vardefs(no_in,false),end:prev()})};var const_=function(){return new AST_Const({start:prev(),definitions:vardefs(false,true),end:prev()})};var new_=function(){var start=S.token;expect_token("operator","new");var newexp=expr_atom(false),args;if(is("punc","(")){next();args=expr_list(")")}else{args=[]}return subscripts(new AST_New({start:start,expression:newexp,args:args,end:prev()}),true)};function as_atom_node(){var tok=S.token,ret;switch(tok.type){case"name":return as_symbol(AST_SymbolRef);case"num":ret=new AST_Number({start:tok,end:tok,value:tok.value});break;case"string":ret=new AST_String({start:tok,end:tok,value:tok.value});break;case"regexp":ret=new AST_RegExp({start:tok,end:tok,value:tok.value});break;case"atom":switch(tok.value){case"false":ret=new AST_False({start:tok,end:tok});break;case"true":ret=new AST_True({start:tok,end:tok});break;case"null":ret=new AST_Null({start:tok,end:tok});break}break}next();return ret}var expr_atom=function(allow_calls){if(is("operator","new")){return new_()}var start=S.token;if(is("punc")){switch(start.value){case"(":next();var ex=expression(true);ex.start=start;ex.end=S.token;expect(")");return subscripts(ex,allow_calls);case"[":return subscripts(array_(),allow_calls);case"{":return subscripts(object_(),allow_calls)}unexpected()}if(is("keyword","function")){next();var func=function_(false);func.start=start;func.end=prev();return subscripts(func,allow_calls)}if(ATOMIC_START_TOKEN[S.token.type]){return subscripts(as_atom_node(),allow_calls)}unexpected()};function expr_list(closing,allow_trailing_comma,allow_empty){var first=true,a=[];while(!is("punc",closing)){if(first)first=false;else expect(",");if(allow_trailing_comma&&is("punc",closing))break;if(is("punc",",")&&allow_empty){a.push(new AST_Undefined({start:S.token,end:S.token}))}else{a.push(expression(false))}}next();return a}var array_=embed_tokens(function(){expect("[");return new AST_Array({elements:expr_list("]",!options.strict,true)})});var object_=embed_tokens(function(){expect("{");var first=true,a=[];while(!is("punc","}")){if(first)first=false;else expect(",");if(!options.strict&&is("punc","}"))break;var start=S.token;var type=start.type;var name=as_property_name();if(type=="name"&&!is("punc",":")){if(name=="get"){a.push(new AST_ObjectGetter({start:start,key:name,value:function_(false,AST_Lambda),end:prev()}));continue}if(name=="set"){a.push(new AST_ObjectSetter({start:start,key:name,value:function_(false,AST_Lambda),end:prev()}));continue}}expect(":");a.push(new AST_ObjectKeyVal({start:start,key:name,value:expression(false),end:prev()}))}next();return new AST_Object({properties:a})});function as_property_name(){var tmp=S.token;next();switch(tmp.type){case"num":case"string":case"name":case"operator":case"keyword":case"atom":return tmp.value;default:unexpected()}}function as_name(){var tmp=S.token;next();switch(tmp.type){case"name":case"operator":case"keyword":case"atom":return tmp.value;default:unexpected()}}function as_symbol(type,noerror){if(!is("name")){if(!noerror)croak("Name expected");return null}var name=S.token.value;var sym=new(name=="this"?AST_This:type)({name:String(S.token.value),start:S.token,end:S.token});next();return sym}var subscripts=function(expr,allow_calls){var start=expr.start;if(is("punc",".")){next();return subscripts(new AST_Dot({start:start,expression:expr,property:as_name(),end:prev()}),allow_calls)}if(is("punc","[")){next();var prop=expression(true);expect("]");return subscripts(new AST_Sub({start:start,expression:expr,property:prop,end:prev()}),allow_calls)}if(allow_calls&&is("punc","(")){next();return subscripts(new AST_Call({start:start,expression:expr,args:expr_list(")"),end:prev()}),true)}return expr};var maybe_unary=function(allow_calls){var start=S.token;if(is("operator")&&UNARY_PREFIX(start.value)){next();var ex=make_unary(AST_UnaryPrefix,start.value,maybe_unary(allow_calls));ex.start=start;ex.end=prev();return ex}var val=expr_atom(allow_calls);while(is("operator")&&UNARY_POSTFIX(S.token.value)&&!S.token.nlb){val=make_unary(AST_UnaryPostfix,S.token.value,val);val.start=start;val.end=S.token;next()}return val};function make_unary(ctor,op,expr){if((op=="++"||op=="--")&&!is_assignable(expr))croak("Invalid use of "+op+" operator");return new ctor({operator:op,expression:expr})}var expr_op=function(left,min_prec,no_in){var op=is("operator")?S.token.value:null;if(op=="in"&&no_in)op=null;var prec=op!=null?PRECEDENCE[op]:null;if(prec!=null&&prec>min_prec){next();var right=expr_op(maybe_unary(true),prec,no_in);return expr_op(new AST_Binary({start:left.start,left:left,operator:op,right:right,end:right.end}),min_prec,no_in)}return left};function expr_ops(no_in){return expr_op(maybe_unary(true),0,no_in)}var maybe_conditional=function(no_in){var start=S.token;var expr=expr_ops(no_in);if(is("operator","?")){next();var yes=expression(false);expect(":");return new AST_Conditional({start:start,condition:expr,consequent:yes,alternative:expression(false,no_in),end:peek()})}return expr};function is_assignable(expr){if(!options.strict)return true;switch(expr[0]+""){case"dot":case"sub":case"new":case"call":return true;case"name":return expr[1]!="this"}}var maybe_assign=function(no_in){var start=S.token;var left=maybe_conditional(no_in),val=S.token.value;if(is("operator")&&ASSIGNMENT(val)){if(is_assignable(left)){next();return new AST_Assign({start:start,left:left,operator:val,right:maybe_assign(no_in),end:peek()})}croak("Invalid assignment")}return left};var expression=function(commas,no_in){var start=S.token;var expr=maybe_assign(no_in);if(commas&&is("punc",",")){next();return new AST_Seq({start:start,car:expr,cdr:expression(true,no_in),end:peek()})}return expr};function in_loop(cont){++S.in_loop;var ret=cont();--S.in_loop;return ret}return function(){var start=S.token;var body=[];while(!is("eof"))body.push(statement());var end=prev();var toplevel=options.toplevel;if(toplevel){toplevel.body=toplevel.body.concat(body);toplevel.end=end}else{toplevel=new AST_Toplevel({start:start,body:body,end:end})}return toplevel}()}"use strict";function TreeTransformer(before,after){TreeWalker.call(this);this.before=before;this.after=after}TreeTransformer.prototype=new TreeWalker;(function(undefined){function _(node,descend){node.DEFMETHOD("transform",function(tw,in_list){var x,y;tw.push(this);if(tw.before)x=tw.before(this,descend,in_list);if(x===undefined){if(!tw.after){x=this;descend(x,tw)}else{tw.stack[tw.stack-1]=x=this.clone();descend(x,tw);y=tw.after(x,in_list);if(y!==undefined)x=y}}tw.pop();return x})}function do_list(list,tw){return MAP(list,function(node){return node.transform(tw,true)})}_(AST_Node,noop);_(AST_LabeledStatement,function(self,tw){self.label=self.label.transform(tw);self.body=self.body.transform(tw)});_(AST_SimpleStatement,function(self,tw){self.body=self.body.transform(tw)});_(AST_Block,function(self,tw){self.body=do_list(self.body,tw)});_(AST_DWLoop,function(self,tw){self.condition=self.condition.transform(tw);self.body=self.body.transform(tw)});_(AST_For,function(self,tw){if(self.init)self.init=self.init.transform(tw);if(self.condition)self.condition=self.condition.transform(tw);if(self.step)self.step=self.step.transform(tw);self.body=self.body.transform(tw)});_(AST_ForIn,function(self,tw){self.init=self.init.transform(tw);self.object=self.object.transform(tw);self.body=self.body.transform(tw)});_(AST_With,function(self,tw){self.expression=self.expression.transform(tw);self.body=self.body.transform(tw)});_(AST_Exit,function(self,tw){if(self.value)self.value=self.value.transform(tw)});_(AST_LoopControl,function(self,tw){if(self.label)self.label=self.label.transform(tw)});_(AST_If,function(self,tw){self.condition=self.condition.transform(tw);self.body=self.body.transform(tw);if(self.alternative)self.alternative=self.alternative.transform(tw)});_(AST_Switch,function(self,tw){self.expression=self.expression.transform(tw);self.body=do_list(self.body,tw)});_(AST_Case,function(self,tw){self.expression=self.expression.transform(tw);self.body=do_list(self.body,tw)});_(AST_Try,function(self,tw){self.body=do_list(self.body,tw);if(self.bcatch)self.bcatch=self.bcatch.transform(tw);if(self.bfinally)self.bfinally=self.bfinally.transform(tw)});_(AST_Catch,function(self,tw){self.argname=self.argname.transform(tw);self.body=do_list(self.body,tw)});_(AST_Definitions,function(self,tw){self.definitions=do_list(self.definitions,tw)});_(AST_VarDef,function(self,tw){if(self.value)self.value=self.value.transform(tw)});_(AST_Lambda,function(self,tw){if(self.name)self.name=self.name.transform(tw);self.argnames=do_list(self.argnames,tw);self.body=do_list(self.body,tw)});_(AST_Call,function(self,tw){self.expression=self.expression.transform(tw);self.args=do_list(self.args,tw)});_(AST_Seq,function(self,tw){self.car=self.car.transform(tw);self.cdr=self.cdr.transform(tw)});_(AST_Dot,function(self,tw){self.expression=self.expression.transform(tw)});_(AST_Sub,function(self,tw){self.expression=self.expression.transform(tw);self.property=self.property.transform(tw)});_(AST_Unary,function(self,tw){self.expression=self.expression.transform(tw)});_(AST_Binary,function(self,tw){self.left=self.left.transform(tw);self.right=self.right.transform(tw)});_(AST_Conditional,function(self,tw){self.condition=self.condition.transform(tw);self.consequent=self.consequent.transform(tw);self.alternative=self.alternative.transform(tw)});_(AST_Array,function(self,tw){self.elements=do_list(self.elements,tw)});_(AST_Object,function(self,tw){self.properties=do_list(self.properties,tw)});_(AST_ObjectProperty,function(self,tw){self.value=self.value.transform(tw)})})();"use strict";function SymbolDef(scope,orig){this.name=orig.name;this.orig=[orig];this.scope=scope;this.references=[];this.global=false;this.mangled_name=null;this.undeclared=false;this.constant=false}SymbolDef.prototype={unmangleable:function(){return this.global||this.undeclared||this.scope.uses_eval||this.scope.uses_with},mangle:function(){if(!this.mangled_name&&!this.unmangleable())this.mangled_name=this.scope.next_mangled()}};AST_Toplevel.DEFMETHOD("figure_out_scope",function(){var self=this;var scope=self.parent_scope=null;var labels=Object.create(null);var tw=new TreeWalker(function(node,descend){if(node instanceof AST_Scope){node.init_scope_vars();var save_scope=node.parent_scope=scope;scope=node;descend();scope=save_scope;return true}if(node instanceof AST_Directive){node.scope=scope;push_uniq(scope.directives,node.value);return true}if(node instanceof AST_With){for(var s=scope;s;s=s.parent_scope)s.uses_with=true;return}if(node instanceof AST_LabeledStatement){var l=node.label;if(labels[l.name])throw new Error(string_template("Label {name} defined twice",l));labels[l.name]=l;descend();delete labels[l.name];return true}if(node instanceof AST_SymbolDeclaration){node.init_scope_vars()}if(node instanceof AST_Symbol){node.scope=scope}if(node instanceof AST_Label){node.thedef=node;node.init_scope_vars()}if(node instanceof AST_SymbolLambda){(node.scope=scope.parent_scope).def_function(node);node.init.push(tw.parent())}else if(node instanceof AST_SymbolDefun){(node.scope=scope.parent_scope).def_function(node);node.init.push(tw.parent())}else if(node instanceof AST_SymbolVar||node instanceof AST_SymbolConst){var def=scope.def_variable(node);def.constant=node instanceof AST_SymbolConst;def=tw.parent();if(def.value)node.init.push(def)}else if(node instanceof AST_SymbolCatch){scope.def_variable(node)}if(node instanceof AST_LabelRef){var sym=labels[node.name];if(!sym)throw new Error(string_template("Undefined label {name} [{line},{col}]",{name:node.name,line:node.start.line,col:node.start.col}));node.thedef=sym}});self.walk(tw);var func=null;var globals=self.globals=Object.create(null);var tw=new TreeWalker(function(node,descend){if(node instanceof AST_Lambda){var prev_func=func;func=node;descend();func=prev_func;return true}if(node instanceof AST_LabelRef){node.reference();return true}if(node instanceof AST_SymbolRef){var name=node.name;var sym=node.scope.find_variable(name);if(!sym){var g;if(globals[name]){g=globals[name]}else{g=new SymbolDef(self,node);g.undeclared=true;globals[name]=g}node.thedef=g;if(name=="eval"&&tw.parent()instanceof AST_Call){for(var s=node.scope;s&&!s.uses_eval;s=s.parent_scope)s.uses_eval=true}if(name=="arguments"){func.uses_arguments=true}}else{node.thedef=sym}node.reference();return true}});self.walk(tw)});AST_Scope.DEFMETHOD("init_scope_vars",function(){this.directives=[];this.variables=Object.create(null);this.functions=Object.create(null);this.uses_with=false;this.uses_eval=false;this.parent_scope=null;this.enclosed=[];this.cname=-1});AST_Scope.DEFMETHOD("strict",function(){return this.has_directive("use strict")});AST_Lambda.DEFMETHOD("init_scope_vars",function(){AST_Scope.prototype.init_scope_vars.call(this);this.uses_arguments=false});AST_SymbolRef.DEFMETHOD("reference",function(){var def=this.definition();def.references.push(this);var s=this.scope;while(s){push_uniq(s.enclosed,def);if(s===def.scope)break;s=s.parent_scope}});AST_SymbolDeclaration.DEFMETHOD("init_scope_vars",function(){this.init=[]});AST_Label.DEFMETHOD("init_scope_vars",function(){this.references=[]});AST_LabelRef.DEFMETHOD("reference",function(){this.thedef.references.push(this)});AST_Scope.DEFMETHOD("find_variable",function(name){if(name instanceof AST_Symbol)name=name.name;return this.variables[name]||this.parent_scope&&this.parent_scope.find_variable(name)});AST_Scope.DEFMETHOD("has_directive",function(value){return this.parent_scope&&this.parent_scope.has_directive(value)||(this.directives.indexOf(value)>=0?this:null)});AST_Scope.DEFMETHOD("def_function",function(symbol){this.functions[symbol.name]=this.def_variable(symbol)});AST_Scope.DEFMETHOD("def_variable",function(symbol){var def;if(!this.variables[symbol.name]){def=new SymbolDef(this,symbol);this.variables[symbol.name]=def;def.global=!this.parent_scope}else{def=this.variables[symbol.name];def.orig.push(symbol)}return symbol.thedef=def});AST_Scope.DEFMETHOD("next_mangled",function(){var ext=this.enclosed,n=ext.length;out:while(true){var m=base54(++this.cname);if(!is_identifier(m))continue;for(var i=n;--i>=0;){var sym=ext[i];var name=sym.mangled_name||sym.unmangleable()&&sym.name;if(m==name)continue out}return m}});AST_Scope.DEFMETHOD("references",function(sym){if(sym instanceof AST_Symbol)sym=sym.definition();return this.enclosed.indexOf(sym)<0?null:sym});AST_Symbol.DEFMETHOD("unmangleable",function(){return this.definition().unmangleable()});AST_Label.DEFMETHOD("unmangleable",function(){return false});AST_Symbol.DEFMETHOD("unreferenced",function(){return this.definition().references.length==0&&!(this.scope.uses_eval||this.scope.uses_with)});AST_Symbol.DEFMETHOD("undeclared",function(){return this.definition().undeclared});AST_LabelRef.DEFMETHOD("undeclared",function(){return false});AST_Label.DEFMETHOD("undeclared",function(){return false});AST_Symbol.DEFMETHOD("definition",function(){return this.thedef});AST_Symbol.DEFMETHOD("global",function(){return this.definition().global});AST_Toplevel.DEFMETHOD("mangle_names",function(options){options=defaults(options,{except:[]});var lname=-1;var to_mangle=[];var tw=new TreeWalker(function(node,descend){if(node instanceof AST_LabeledStatement){var save_nesting=lname;descend();lname=save_nesting;return true}if(node instanceof AST_Scope){var p=tw.parent();var is_setget=p instanceof AST_ObjectSetter||p instanceof AST_ObjectGetter;var a=node.variables;for(var i in a){var symbol=a[i];if(!(is_setget&&symbol instanceof AST_SymbolLambda)){if(options.except.indexOf(symbol.name)<0){to_mangle.push(symbol)}}}return}if(node instanceof AST_Label){var name;do name=base54(++lname);while(!is_identifier(name));node.mangled_name=name;return true}});this.walk(tw);to_mangle.forEach(function(def){def.mangle(options)})});AST_Toplevel.DEFMETHOD("compute_char_frequency",function(){var tw=new TreeWalker(function(node){if(node instanceof AST_Constant)base54.consider(node.print_to_string());else if(node instanceof AST_Return)base54.consider("return");else if(node instanceof AST_Throw)base54.consider("throw");else if(node instanceof AST_Continue)base54.consider("continue");else if(node instanceof AST_Break)base54.consider("break");else if(node instanceof AST_Debugger)base54.consider("debugger");
else if(node instanceof AST_Directive)base54.consider(node.value);else if(node instanceof AST_While)base54.consider("while");else if(node instanceof AST_Do)base54.consider("do while");else if(node instanceof AST_If){base54.consider("if");if(node.alternative)base54.consider("else")}else if(node instanceof AST_Var)base54.consider("var");else if(node instanceof AST_Const)base54.consider("const");else if(node instanceof AST_Lambda)base54.consider("function");else if(node instanceof AST_For)base54.consider("for");else if(node instanceof AST_ForIn)base54.consider("for in");else if(node instanceof AST_Switch)base54.consider("switch");else if(node instanceof AST_Case)base54.consider("case");else if(node instanceof AST_Default)base54.consider("default");else if(node instanceof AST_With)base54.consider("with");else if(node instanceof AST_ObjectSetter)base54.consider("set"+node.key);else if(node instanceof AST_ObjectGetter)base54.consider("get"+node.key);else if(node instanceof AST_ObjectKeyVal)base54.consider(node.key);else if(node instanceof AST_New)base54.consider("new");else if(node instanceof AST_This)base54.consider("this");else if(node instanceof AST_Try)base54.consider("try");else if(node instanceof AST_Catch)base54.consider("catch");else if(node instanceof AST_Finally)base54.consider("finally");else if(node instanceof AST_Symbol&&node.unmangleable())base54.consider(node.name);else if(node instanceof AST_Unary||node instanceof AST_Binary)base54.consider(node.operator);else if(node instanceof AST_Dot)base54.consider(node.property)});this.walk(tw);base54.sort()});var base54=function(){var string="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_0123456789";var chars,frequency;function reset(){frequency=Object.create(null);chars=string.split("").map(function(ch){return ch.charCodeAt(0)});chars.forEach(function(ch){frequency[ch]=0})}base54.consider=function(str){for(var i=str.length;--i>=0;){var code=str.charCodeAt(i);if(code in frequency)++frequency[code]}};base54.sort=function(){chars=mergeSort(chars,function(a,b){if(is_digit(a)&&!is_digit(b))return 1;if(is_digit(b)&&!is_digit(a))return-1;return frequency[b]-frequency[a]})};base54.reset=reset;reset();base54.get=function(){return chars};base54.freq=function(){return frequency};function base54(num){var ret="",base=54;do{ret+=String.fromCharCode(chars[num%base]);num=Math.floor(num/base);base=64}while(num>0);return ret}return base54}();AST_Toplevel.DEFMETHOD("scope_warnings",function(options){options=defaults(options,{undeclared:false,unreferenced:true,assign_to_global:true,func_arguments:true,nested_defuns:true,eval:true});var tw=new TreeWalker(function(node){if(options.undeclared&&node instanceof AST_SymbolRef&&node.undeclared()){AST_Node.warn("Undeclared symbol: {name} [{file}:{line},{col}]",{name:node.name,file:node.start.file,line:node.start.line,col:node.start.col})}if(options.assign_to_global){var sym=null;if(node instanceof AST_Assign&&node.left instanceof AST_SymbolRef)sym=node.left;else if(node instanceof AST_ForIn&&node.init instanceof AST_SymbolRef)sym=node.init;if(sym&&(sym.undeclared()||sym.global()&&sym.scope!==sym.definition().scope)){AST_Node.warn("{msg}: {name} [{file}:{line},{col}]",{msg:sym.undeclared()?"Accidental global?":"Assignment to global",name:sym.name,file:sym.start.file,line:sym.start.line,col:sym.start.col})}}if(options.eval&&node instanceof AST_SymbolRef&&node.undeclared()&&node.name=="eval"){AST_Node.warn("Eval is used [{file}:{line},{col}]",node.start)}if(options.unreferenced&&(node instanceof AST_SymbolDeclaration||node instanceof AST_Label)&&node.unreferenced()){AST_Node.warn("{type} {name} is declared but not referenced [{file}:{line},{col}]",{type:node instanceof AST_Label?"Label":"Symbol",name:node.name,file:node.start.file,line:node.start.line,col:node.start.col})}if(options.func_arguments&&node instanceof AST_Lambda&&node.uses_arguments){AST_Node.warn("arguments used in function {name} [{file}:{line},{col}]",{name:node.name?node.name.name:"anonymous",file:node.start.file,line:node.start.line,col:node.start.col})}if(options.nested_defuns&&node instanceof AST_Defun&&!(tw.parent()instanceof AST_Scope)){AST_Node.warn('Function {name} declared in nested statement "{type}" [{file}:{line},{col}]',{name:node.name.name,type:tw.parent().TYPE,file:node.start.file,line:node.start.line,col:node.start.col})}});this.walk(tw)});"use strict";function OutputStream(options){options=defaults(options,{indent_start:0,indent_level:4,quote_keys:false,space_colon:true,ascii_only:false,inline_script:false,width:80,max_line_len:32e3,ie_proof:true,beautify:false,source_map:null,bracketize:false,semicolons:true,comments:false},true);var indentation=0;var current_col=0;var current_line=1;var current_pos=0;var OUTPUT="";function to_ascii(str){return str.replace(/[\u0080-\uffff]/g,function(ch){var code=ch.charCodeAt(0).toString(16);while(code.length<4)code="0"+code;return"\\u"+code})}function make_string(str){var dq=0,sq=0;str=str.replace(/[\\\b\f\n\r\t\x22\x27\u2028\u2029\0]/g,function(s){switch(s){case"\\":return"\\\\";case"\b":return"\\b";case"\f":return"\\f";case"\n":return"\\n";case"\r":return"\\r";case"\u2028":return"\\u2028";case"\u2029":return"\\u2029";case'"':++dq;return'"';case"'":++sq;return"'";case"\0":return"\\0"}return s});if(options.ascii_only)str=to_ascii(str);if(dq>sq)return"'"+str.replace(/\x27/g,"\\'")+"'";else return'"'+str.replace(/\x22/g,'\\"')+'"'}function encode_string(str){var ret=make_string(str);if(options.inline_script)ret=ret.replace(/<\x2fscript([>\/\t\n\f\r ])/gi,"<\\/script$1");return ret}function make_name(name){name=name.toString();if(options.ascii_only)name=to_ascii(name);return name}function make_indent(back){return repeat_string(" ",options.indent_start+indentation-back*options.indent_level)}var might_need_space=false;var might_need_semicolon=false;var last=null;function last_char(){return last.charAt(last.length-1)}function maybe_newline(){if(options.max_line_len&&current_col>options.max_line_len)print("\n")}var requireSemicolonChars=makePredicate("( [ + * / - , .");function print(str){str=String(str);var ch=str.charAt(0);if(might_need_semicolon){if(";}".indexOf(ch)<0&&!/[;]$/.test(last)){if(options.semicolons||requireSemicolonChars(ch)){OUTPUT+=";";current_col++;current_pos++}else{OUTPUT+="\n";current_pos++;current_line++;current_col=0}if(!options.beautify)might_need_space=false}might_need_semicolon=false;maybe_newline()}if(might_need_space){var prev=last_char();if(is_identifier_char(prev)&&(is_identifier_char(ch)||ch=="\\")||/^[\+\-\/]$/.test(ch)&&ch==prev){OUTPUT+=" ";current_col++;current_pos++}might_need_space=false}var a=str.split(/\r?\n/),n=a.length-1;current_line+=n;if(n==0){current_col+=a[n].length}else{current_col=a[n].length}current_pos+=str.length;last=str;OUTPUT+=str}var space=options.beautify?function(){print(" ")}:function(){might_need_space=true};var indent=options.beautify?function(half){if(options.beautify){print(make_indent(half?.5:0))}}:noop;var with_indent=options.beautify?function(col,cont){if(col===true)col=next_indent();var save_indentation=indentation;indentation=col;var ret=cont();indentation=save_indentation;return ret}:function(col,cont){return cont()};var newline=options.beautify?function(){print("\n")}:noop;var semicolon=options.beautify?function(){print(";")}:function(){might_need_semicolon=true};function force_semicolon(){might_need_semicolon=false;print(";")}function next_indent(){return indentation+options.indent_level}function with_block(cont){var ret;print("{");newline();with_indent(next_indent(),function(){ret=cont()});indent();print("}");return ret}function with_parens(cont){print("(");var ret=cont();print(")");return ret}function with_square(cont){print("[");var ret=cont();print("]");return ret}function comma(){print(",");space()}function colon(){print(":");if(options.space_colon)space()}var add_mapping=options.source_map?function(token,name){try{if(token)options.source_map.add(token.file||"?",current_line,current_col,token.line,token.col,!name&&token.type=="name"?token.value:name)}catch(ex){AST_Node.warn("Couldn't figure out mapping for {file}:{line},{col} → {cline},{ccol} [{name}]",{file:token.file,line:token.line,col:token.col,cline:current_line,ccol:current_col,name:name||""})}}:noop;function get(){return OUTPUT}var stack=[];return{get:get,toString:get,indent:indent,indentation:function(){return indentation},current_width:function(){return current_col-indentation},should_break:function(){return options.width&&this.current_width()>=options.width},newline:newline,print:print,space:space,comma:comma,colon:colon,last:function(){return last},semicolon:semicolon,force_semicolon:force_semicolon,to_ascii:to_ascii,print_name:function(name){print(make_name(name))},print_string:function(str){print(encode_string(str))},next_indent:next_indent,with_indent:with_indent,with_block:with_block,with_parens:with_parens,with_square:with_square,add_mapping:add_mapping,option:function(opt){return options[opt]},line:function(){return current_line},col:function(){return current_col},pos:function(){return current_pos},push_node:function(node){stack.push(node)},pop_node:function(){return stack.pop()},stack:function(){return stack},parent:function(n){return stack[stack.length-2-(n||0)]}}}(function(){function DEFPRINT(nodetype,generator){nodetype.DEFMETHOD("print",function(stream){var self=this;stream.push_node(self);if(self.needs_parens(stream)){stream.with_parens(function(){self.add_comments(stream);self.add_source_map(stream);generator(self,stream)})}else{self.add_comments(stream);self.add_source_map(stream);generator(self,stream)}stream.pop_node()})}AST_Node.DEFMETHOD("print_to_string",function(options){var s=OutputStream(options);this.print(s);return s.get()});AST_Node.DEFMETHOD("add_comments",function(output){var c=output.option("comments"),self=this;if(c){var start=self.start;if(start&&!start._comments_dumped){start._comments_dumped=true;var comments=start.comments_before;if(c.test){comments=comments.filter(function(comment){return c.test(comment.value)})}else if(typeof c=="function"){comments=comments.filter(function(comment){return c(self,comment)})}comments.forEach(function(c){if(c.type=="comment1"){output.print("//"+c.value+"\n");output.indent()}else if(c.type=="comment2"){output.print("/*"+c.value+"*/");if(start.nlb){output.print("\n");output.indent()}else{output.space()}}})}}});function PARENS(nodetype,func){nodetype.DEFMETHOD("needs_parens",func)}PARENS(AST_Node,function(){return false});PARENS(AST_Function,function(output){return first_in_statement(output)});PARENS(AST_Object,function(output){return first_in_statement(output)});PARENS(AST_Seq,function(output){var p=output.parent();return p instanceof AST_Call||p instanceof AST_Unary||p instanceof AST_Binary||p instanceof AST_VarDef||p instanceof AST_Dot||p instanceof AST_Array||p instanceof AST_ObjectProperty||p instanceof AST_Conditional});PARENS(AST_Binary,function(output){var p=output.parent();if(p instanceof AST_Call&&p.expression===this)return true;if(p instanceof AST_Unary)return true;if(p instanceof AST_PropAccess&&p.expression===this)return true;if(p instanceof AST_Binary){var po=p.operator,pp=PRECEDENCE[po];var so=this.operator,sp=PRECEDENCE[so];if(pp>sp||pp==sp&&this===p.right&&!(so==po&&(so=="*"||so=="&&"||so=="||"))){return true}}if(this.operator=="in"){if((p instanceof AST_For||p instanceof AST_ForIn)&&p.init===this)return true;if(p instanceof AST_VarDef){var v=output.parent(1),p2=output.parent(2);if((p2 instanceof AST_For||p2 instanceof AST_ForIn)&&p2.init===v)return true}}});PARENS(AST_New,function(output){var p=output.parent();if(p instanceof AST_Dot&&no_constructor_parens(this,output))return true});function assign_and_conditional_paren_rules(output){var p=output.parent();if(p instanceof AST_Unary)return true;if(p instanceof AST_Binary&&!(p instanceof AST_Assign))return true;if(p instanceof AST_Call&&p.expression===this)return true;if(p instanceof AST_Conditional&&p.condition===this)return true;if(p instanceof AST_PropAccess&&p.expression===this)return true}PARENS(AST_Assign,assign_and_conditional_paren_rules);PARENS(AST_Conditional,assign_and_conditional_paren_rules);DEFPRINT(AST_Directive,function(self,output){output.print_string(self.value);output.semicolon()});DEFPRINT(AST_Debugger,function(self,output){output.print("debugger");output.semicolon()});function display_body(body,is_toplevel,output){var last=body.length-1;body.forEach(function(stmt,i){if(!(stmt instanceof AST_EmptyStatement)){output.indent();stmt.print(output);if(!(i==last&&is_toplevel)){output.newline();if(is_toplevel)output.newline()}}})}AST_StatementWithBody.DEFMETHOD("_do_print_body",function(output){force_statement(this.body,output)});DEFPRINT(AST_Statement,function(self,output){self.body.print(output);output.semicolon()});DEFPRINT(AST_Toplevel,function(self,output){display_body(self.body,true,output)});DEFPRINT(AST_LabeledStatement,function(self,output){self.label.print(output);output.colon();self.body.print(output)});DEFPRINT(AST_SimpleStatement,function(self,output){self.body.print(output);output.semicolon()});function print_bracketed(body,output){if(body.length>0)output.with_block(function(){display_body(body,false,output)});else output.print("{}")}DEFPRINT(AST_BlockStatement,function(self,output){print_bracketed(self.body,output)});DEFPRINT(AST_EmptyStatement,function(self,output){output.semicolon()});DEFPRINT(AST_Do,function(self,output){output.print("do");output.space();self._do_print_body(output);output.space();output.print("while");output.space();output.with_parens(function(){self.condition.print(output)});output.semicolon()});DEFPRINT(AST_While,function(self,output){output.print("while");output.space();output.with_parens(function(){self.condition.print(output)});output.space();self._do_print_body(output)});DEFPRINT(AST_For,function(self,output){output.print("for");output.space();output.with_parens(function(){if(self.init){self.init.print(output);output.print(";");output.space()}else{output.print(";")}if(self.condition){self.condition.print(output);output.print(";");output.space()}else{output.print(";")}if(self.step){self.step.print(output)}});output.space();self._do_print_body(output)});DEFPRINT(AST_ForIn,function(self,output){output.print("for");output.space();output.with_parens(function(){self.init.print(output);output.space();output.print("in");output.space();self.object.print(output)});output.space();self._do_print_body(output)});DEFPRINT(AST_With,function(self,output){output.print("with");output.space();output.with_parens(function(){self.expression.print(output)});output.space();self._do_print_body(output)});AST_Lambda.DEFMETHOD("_do_print",function(output,nokeyword){var self=this;if(!nokeyword){output.print("function")}if(self.name){output.space();self.name.print(output)}output.with_parens(function(){self.argnames.forEach(function(arg,i){if(i)output.comma();arg.print(output)})});output.space();print_bracketed(self.body,output)});DEFPRINT(AST_Lambda,function(self,output){self._do_print(output)});AST_Exit.DEFMETHOD("_do_print",function(output,kind){output.print(kind);if(this.value){output.space();this.value.print(output)}output.semicolon()});DEFPRINT(AST_Return,function(self,output){self._do_print(output,"return")});DEFPRINT(AST_Throw,function(self,output){self._do_print(output,"throw")});AST_LoopControl.DEFMETHOD("_do_print",function(output,kind){output.print(kind);if(this.label){output.space();this.label.print(output)}output.semicolon()});DEFPRINT(AST_Break,function(self,output){self._do_print(output,"break")});DEFPRINT(AST_Continue,function(self,output){self._do_print(output,"continue")});function make_then(self,output){if(output.option("bracketize")){make_block(self.body,output);return}if(!self.body)return output.semicolon();if(self.body instanceof AST_Do&&output.option("ie_proof")){make_block(self.body,output);return}var b=self.body;while(true){if(b instanceof AST_If){if(!b.alternative){make_block(self.body,output);return}b=b.alternative}else if(b instanceof AST_StatementWithBody){b=b.body}else break}self.body.print(output)}DEFPRINT(AST_If,function(self,output){output.print("if");output.space();output.with_parens(function(){self.condition.print(output)});output.space();if(self.alternative){make_then(self,output);output.space();output.print("else");output.space();force_statement(self.alternative,output)}else{self._do_print_body(output)}});DEFPRINT(AST_Switch,function(self,output){output.print("switch");output.space();output.with_parens(function(){self.expression.print(output)});output.space();if(self.body.length>0)output.with_block(function(){self.body.forEach(function(stmt,i){if(i)output.newline();output.indent(true);stmt.print(output)})});else output.print("{}")});AST_SwitchBranch.DEFMETHOD("_do_print_body",function(output){if(this.body.length>0){output.newline();this.body.forEach(function(stmt){output.indent();stmt.print(output);output.newline()})}});DEFPRINT(AST_Default,function(self,output){output.print("default:");self._do_print_body(output)});DEFPRINT(AST_Case,function(self,output){output.print("case");output.space();self.expression.print(output);output.print(":");self._do_print_body(output)});DEFPRINT(AST_Try,function(self,output){output.print("try");output.space();print_bracketed(self.body,output);if(self.bcatch){output.space();self.bcatch.print(output)}if(self.bfinally){output.space();self.bfinally.print(output)}});DEFPRINT(AST_Catch,function(self,output){output.print("catch");output.space();output.with_parens(function(){self.argname.print(output)});output.space();print_bracketed(self.body,output)});DEFPRINT(AST_Finally,function(self,output){output.print("finally");output.space();print_bracketed(self.body,output)});AST_Definitions.DEFMETHOD("_do_print",function(output,kind){output.print(kind);output.space();this.definitions.forEach(function(def,i){if(i)output.comma();def.print(output)});var p=output.parent();var in_for=p instanceof AST_For||p instanceof AST_ForIn;var avoid_semicolon=in_for&&p.init===this;if(!avoid_semicolon)output.semicolon()});DEFPRINT(AST_Var,function(self,output){self._do_print(output,"var")});DEFPRINT(AST_Const,function(self,output){self._do_print(output,"const")});DEFPRINT(AST_VarDef,function(self,output){self.name.print(output);if(self.value){output.space();output.print("=");output.space();self.value.print(output)}});DEFPRINT(AST_Call,function(self,output){self.expression.print(output);if(self instanceof AST_New&&no_constructor_parens(self,output))return;output.with_parens(function(){self.args.forEach(function(expr,i){if(i)output.comma();expr.print(output)})})});DEFPRINT(AST_New,function(self,output){output.print("new");output.space();AST_Call.prototype.print.call(self,output)});AST_Seq.DEFMETHOD("_do_print",function(output){this.car.print(output);if(this.cdr){output.comma();if(output.should_break()){output.newline();output.indent()}this.cdr.print(output)}});DEFPRINT(AST_Seq,function(self,output){self._do_print(output)});DEFPRINT(AST_Dot,function(self,output){var expr=self.expression;expr.print(output);if(expr instanceof AST_Number){if(!/[xa-f.]/i.test(output.last())){output.print(".")}}output.print(".");output.add_mapping(self.end);output.print_name(self.property)});DEFPRINT(AST_Sub,function(self,output){self.expression.print(output);output.print("[");self.property.print(output);output.print("]")});DEFPRINT(AST_UnaryPrefix,function(self,output){var op=self.operator;output.print(op);if(/^[a-z]/i.test(op))output.space();self.expression.print(output)});DEFPRINT(AST_UnaryPostfix,function(self,output){self.expression.print(output);output.print(self.operator)});DEFPRINT(AST_Binary,function(self,output){self.left.print(output);output.space();output.print(self.operator);output.space();self.right.print(output)});DEFPRINT(AST_Conditional,function(self,output){self.condition.print(output);output.space();output.print("?");output.space();self.consequent.print(output);output.space();output.colon();self.alternative.print(output)});DEFPRINT(AST_Array,function(self,output){output.with_square(function(){var a=self.elements,len=a.length;if(len>0)output.space();a.forEach(function(exp,i){if(i)output.comma();if(!(exp instanceof AST_Undefined))exp.print(output)});if(len>0)output.space()})});DEFPRINT(AST_Object,function(self,output){if(self.properties.length>0)output.with_block(function(){self.properties.forEach(function(prop,i){if(i){output.print(",");output.newline()}output.indent();prop.print(output)});output.newline()});else output.print("{}")});DEFPRINT(AST_ObjectKeyVal,function(self,output){var key=self.key;if(output.option("quote_keys")){output.print_string(key)}else if((typeof key=="number"||!output.option("beautify")&&+key+""==key)&&parseFloat(key)>=0){output.print(make_num(key))}else if(!is_identifier(key)){output.print_string(key)}else{output.print_name(key)}output.colon();self.value.print(output)});DEFPRINT(AST_ObjectSetter,function(self,output){output.print("set");self.value._do_print(output,true)});DEFPRINT(AST_ObjectGetter,function(self,output){output.print("get");self.value._do_print(output,true)});DEFPRINT(AST_Symbol,function(self,output){var def=self.definition();output.print_name(def?def.mangled_name||def.name:self.name)});DEFPRINT(AST_Undefined,function(self,output){output.print("void 0")});DEFPRINT(AST_Infinity,function(self,output){output.print("1/0")});DEFPRINT(AST_NaN,function(self,output){output.print("0/0")});DEFPRINT(AST_This,function(self,output){output.print("this")});DEFPRINT(AST_Constant,function(self,output){output.print(self.getValue())});DEFPRINT(AST_String,function(self,output){output.print_string(self.getValue())});DEFPRINT(AST_Number,function(self,output){output.print(make_num(self.getValue()))});DEFPRINT(AST_RegExp,function(self,output){var str=self.getValue().toString();if(output.option("ascii_only"))str=output.to_ascii(str);output.print(str)});function force_statement(stat,output){if(output.option("bracketize")){if(!stat||stat instanceof AST_EmptyStatement)output.print("{}");else if(stat instanceof AST_BlockStatement)stat.print(output);else output.with_block(function(){output.indent();stat.print(output);output.newline()})}else{if(!stat||stat instanceof AST_EmptyStatement)output.force_semicolon();else stat.print(output)}}function first_in_statement(output){var a=output.stack(),i=a.length,node=a[--i],p=a[--i];while(i>0){if(p instanceof AST_Statement&&p.body===node)return true;if(p instanceof AST_Seq&&p.car===node||p instanceof AST_Call&&p.expression===node||p instanceof AST_Dot&&p.expression===node||p instanceof AST_Sub&&p.expression===node||p instanceof AST_Conditional&&p.condition===node||p instanceof AST_Binary&&p.left===node||p instanceof AST_UnaryPostfix&&p.expression===node){node=p;p=a[--i]}else{return false}}}function no_constructor_parens(self,output){return self.args.length==0&&!output.option("beautify")}function best_of(a){var best=a[0],len=best.length;for(var i=1;i<a.length;++i){if(a[i].length<len){best=a[i];len=best.length}}return best}function make_num(num){var str=num.toString(10),a=[str.replace(/^0\./,".").replace("e+","e")],m;if(Math.floor(num)===num){if(num>=0){a.push("0x"+num.toString(16).toLowerCase(),"0"+num.toString(8))}else{a.push("-0x"+-num.toString(16).toLowerCase(),"-0"+-num.toString(8))}if(m=/^(.*?)(0+)$/.exec(num)){a.push(m[1]+"e"+m[2].length)}}else if(m=/^0?\.(0+)(.*)$/.exec(num)){a.push(m[2]+"e-"+(m[1].length+m[2].length),str.substr(str.indexOf(".")))}return best_of(a)}function make_block(stmt,output){if(stmt instanceof AST_BlockStatement){stmt.print(output);return}output.with_block(function(){output.indent();stmt.print(output);output.newline()})}function DEFMAP(nodetype,generator){nodetype.DEFMETHOD("add_source_map",function(stream){generator(this,stream)})}DEFMAP(AST_Node,noop);function basic_sourcemap_gen(self,output){output.add_mapping(self.start)}DEFMAP(AST_Directive,basic_sourcemap_gen);DEFMAP(AST_Debugger,basic_sourcemap_gen);DEFMAP(AST_Symbol,basic_sourcemap_gen);DEFMAP(AST_Jump,basic_sourcemap_gen);DEFMAP(AST_StatementWithBody,basic_sourcemap_gen);DEFMAP(AST_LabeledStatement,noop);DEFMAP(AST_Lambda,basic_sourcemap_gen);DEFMAP(AST_Switch,basic_sourcemap_gen);DEFMAP(AST_SwitchBranch,basic_sourcemap_gen);DEFMAP(AST_BlockStatement,basic_sourcemap_gen);DEFMAP(AST_Toplevel,noop);DEFMAP(AST_New,basic_sourcemap_gen);DEFMAP(AST_Try,basic_sourcemap_gen);DEFMAP(AST_Catch,basic_sourcemap_gen);DEFMAP(AST_Finally,basic_sourcemap_gen);DEFMAP(AST_Definitions,basic_sourcemap_gen);DEFMAP(AST_Constant,basic_sourcemap_gen);DEFMAP(AST_ObjectProperty,function(self,output){output.add_mapping(self.start,self.key)})})();"use strict";function Compressor(options,false_by_default){if(!(this instanceof Compressor))return new Compressor(options,false_by_default);TreeTransformer.call(this,this.before,this.after);this.options=defaults(options,{sequences:!false_by_default,properties:!false_by_default,dead_code:!false_by_default,drop_debugger:!false_by_default,unsafe:!false_by_default,unsafe_comps:false,conditionals:!false_by_default,comparisons:!false_by_default,evaluate:!false_by_default,booleans:!false_by_default,loops:!false_by_default,unused:!false_by_default,hoist_funs:!false_by_default,hoist_vars:false,if_return:!false_by_default,join_vars:!false_by_default,cascade:!false_by_default,side_effects:!false_by_default,warnings:true,global_defs:{}},true)}Compressor.prototype=new TreeTransformer;merge(Compressor.prototype,{option:function(key){return this.options[key]},warn:function(){if(this.options.warnings)AST_Node.warn.apply(AST_Node,arguments)},before:function(node,descend,in_list){if(node._squeezed)return node;if(node instanceof AST_Scope){node.drop_unused(this);node=node.hoist_declarations(this)}descend(node,this);node=node.optimize(this);if(node instanceof AST_Scope){var save_warnings=this.options.warnings;this.options.warnings=false;node.drop_unused(this);this.options.warnings=save_warnings}node._squeezed=true;return node}});(function(){function OPT(node,optimizer){node.DEFMETHOD("optimize",function(compressor){var self=this;if(self._optimized)return self;var opt=optimizer(self,compressor);opt._optimized=true;if(opt===self)return opt;return opt.transform(compressor)})}OPT(AST_Node,function(self,compressor){return self});AST_Node.DEFMETHOD("equivalent_to",function(node){return this.print_to_string()==node.print_to_string()});function make_node(ctor,orig,props){if(!props)props={};if(orig){if(!props.start)props.start=orig.start;if(!props.end)props.end=orig.end}return new ctor(props)}function make_node_from_constant(compressor,val,orig){if(val instanceof AST_Node)return val.transform(compressor);switch(typeof val){case"string":return make_node(AST_String,orig,{value:val}).optimize(compressor);case"number":return make_node(isNaN(val)?AST_NaN:AST_Number,orig,{value:val}).optimize(compressor);case"boolean":return make_node(val?AST_True:AST_False,orig);case"undefined":return make_node(AST_Undefined,orig).optimize(compressor);default:if(val===null){return make_node(AST_Null,orig).optimize(compressor)}if(val instanceof RegExp){return make_node(AST_RegExp,orig).optimize(compressor)}throw new Error(string_template("Can't handle constant of type: {type}",{type:typeof val}))}}function as_statement_array(thing){if(thing===null)return[];if(thing instanceof AST_BlockStatement)return thing.body;if(thing instanceof AST_EmptyStatement)return[];if(thing instanceof AST_Statement)return[thing];throw new Error("Can't convert thing to statement array")}function is_empty(thing){if(thing===null)return true;if(thing instanceof AST_EmptyStatement)return true;if(thing instanceof AST_BlockStatement)return thing.body.length==0;return false}function loop_body(x){if(x instanceof AST_Switch)return x;if(x instanceof AST_For||x instanceof AST_ForIn||x instanceof AST_DWLoop){return x.body instanceof AST_BlockStatement?x.body:x}return x}function tighten_body(statements,compressor){var CHANGED;do{CHANGED=false;statements=eliminate_spurious_blocks(statements);if(compressor.option("dead_code")){statements=eliminate_dead_code(statements,compressor)}if(compressor.option("if_return")){statements=handle_if_return(statements,compressor)}if(compressor.option("sequences")){statements=sequencesize(statements,compressor)}if(compressor.option("join_vars")){statements=join_consecutive_vars(statements,compressor)}}while(CHANGED);return statements;function eliminate_spurious_blocks(statements){var seen_dirs=[];return statements.reduce(function(a,stat){if(stat instanceof AST_BlockStatement){CHANGED=true;a.push.apply(a,eliminate_spurious_blocks(stat.body))}else if(stat instanceof AST_EmptyStatement){CHANGED=true}else if(stat instanceof AST_Directive){if(seen_dirs.indexOf(stat.value)<0){a.push(stat);seen_dirs.push(stat.value)}else{CHANGED=true}}else{a.push(stat)}return a},[])}function handle_if_return(statements,compressor){var self=compressor.self();var in_lambda=self instanceof AST_Lambda;var ret=[];loop:for(var i=statements.length;--i>=0;){var stat=statements[i];switch(true){case in_lambda&&stat instanceof AST_Return&&!stat.value&&ret.length==0:CHANGED=true;continue loop;case stat instanceof AST_If:if(stat.body instanceof AST_Return){if((in_lambda&&ret.length==0||ret[0]instanceof AST_Return&&!ret[0].value)&&!stat.body.value&&!stat.alternative){CHANGED=true;var cond=make_node(AST_SimpleStatement,stat.condition,{body:stat.condition});ret.unshift(cond);continue loop}if(ret[0]instanceof AST_Return&&stat.body.value&&ret[0].value&&!stat.alternative){CHANGED=true;stat=stat.clone();stat.alternative=ret[0];ret[0]=stat.transform(compressor);continue loop}if((ret.length==0||ret[0]instanceof AST_Return)&&stat.body.value&&!stat.alternative&&in_lambda){CHANGED=true;stat=stat.clone();stat.alternative=ret[0]||make_node(AST_Return,stat,{value:make_node(AST_Undefined,stat)});ret[0]=stat.transform(compressor);continue loop}if(!stat.body.value&&in_lambda){CHANGED=true;stat=stat.clone();stat.condition=stat.condition.negate(compressor);stat.body=make_node(AST_BlockStatement,stat,{body:as_statement_array(stat.alternative).concat(ret)});stat.alternative=null;ret=[stat.transform(compressor)];continue loop}if(ret.length==1&&in_lambda&&ret[0]instanceof AST_SimpleStatement&&(!stat.alternative||stat.alternative instanceof AST_SimpleStatement)){CHANGED=true;ret.push(make_node(AST_Return,ret[0],{value:make_node(AST_Undefined,ret[0])}).transform(compressor));ret=as_statement_array(stat.alternative).concat(ret);ret.unshift(stat);continue loop}}var ab=aborts(stat.body);var lct=ab instanceof AST_LoopControl?compressor.loopcontrol_target(ab.label):null;if(ab&&(ab instanceof AST_Return&&!ab.value&&in_lambda||ab instanceof AST_Continue&&self===loop_body(lct)||ab instanceof AST_Break&&lct instanceof AST_BlockStatement&&self===lct)){if(ab.label){remove(ab.label.thedef.references,ab.label)}CHANGED=true;var body=as_statement_array(stat.body).slice(0,-1);stat=stat.clone();stat.condition=stat.condition.negate(compressor);stat.body=make_node(AST_BlockStatement,stat,{body:ret});stat.alternative=make_node(AST_BlockStatement,stat,{body:body});ret=[stat.transform(compressor)];continue loop}var ab=aborts(stat.alternative);var lct=ab instanceof AST_LoopControl?compressor.loopcontrol_target(ab.label):null;if(ab&&(ab instanceof AST_Return&&!ab.value&&in_lambda||ab instanceof AST_Continue&&self===loop_body(lct)||ab instanceof AST_Break&&lct instanceof AST_BlockStatement&&self===lct)){if(ab.label){remove(ab.label.thedef.references,ab.label)}CHANGED=true;stat=stat.clone();stat.body=make_node(AST_BlockStatement,stat.body,{body:as_statement_array(stat.body).concat(ret)});stat.alternative=make_node(AST_BlockStatement,stat.alternative,{body:as_statement_array(stat.alternative).slice(0,-1)});ret=[stat.transform(compressor)];continue loop}ret.unshift(stat);break;default:ret.unshift(stat);break}}return ret}function eliminate_dead_code(statements,compressor){var has_quit=false;var orig=statements.length;var self=compressor.self();statements=statements.reduce(function(a,stat){if(has_quit){extract_declarations_from_unreachable_code(compressor,stat,a)
}else{if(stat instanceof AST_LoopControl){var lct=compressor.loopcontrol_target(stat.label);if(stat instanceof AST_Break&&lct instanceof AST_BlockStatement&&loop_body(lct)===self||stat instanceof AST_Continue&&loop_body(lct)===self){if(stat.label){remove(stat.label.thedef.references,stat.label)}}else{a.push(stat)}}else{a.push(stat)}if(aborts(stat))has_quit=true}return a},[]);CHANGED=statements.length!=orig;return statements}function sequencesize(statements,compressor){if(statements.length<2)return statements;var seq=[],ret=[];function push_seq(){seq=AST_Seq.from_array(seq);if(seq)ret.push(make_node(AST_SimpleStatement,seq,{body:seq}));seq=[]}statements.forEach(function(stat){if(stat instanceof AST_SimpleStatement)seq.push(stat.body);else push_seq(),ret.push(stat)});push_seq();ret=sequencesize_2(ret,compressor);CHANGED=ret.length!=statements.length;return ret}function sequencesize_2(statements,compressor){function cons_seq(right){ret.pop();var left=prev.body;if(left instanceof AST_Seq){left.add(right)}else{left=AST_Seq.cons(left,right)}return left.transform(compressor)}var ret=[],prev=null;statements.forEach(function(stat){if(prev){if(stat instanceof AST_For){var opera={};try{prev.body.walk(new TreeWalker(function(node){if(node instanceof AST_Binary&&node.operator=="in")throw opera}));if(stat.init&&!(stat.init instanceof AST_Definitions)){stat.init=cons_seq(stat.init)}else if(!stat.init){stat.init=prev.body;ret.pop()}}catch(ex){if(ex!==opera)throw ex}}else if(stat instanceof AST_If){stat.condition=cons_seq(stat.condition)}else if(stat instanceof AST_With){stat.expression=cons_seq(stat.expression)}else if(stat instanceof AST_Exit&&stat.value){stat.value=cons_seq(stat.value)}else if(stat instanceof AST_Exit){stat.value=cons_seq(make_node(AST_Undefined,stat))}else if(stat instanceof AST_Switch){stat.expression=cons_seq(stat.expression)}}ret.push(stat);prev=stat instanceof AST_SimpleStatement?stat:null});return ret}function join_consecutive_vars(statements,compressor){var prev=null;return statements.reduce(function(a,stat){if(stat instanceof AST_Definitions&&prev&&prev.TYPE==stat.TYPE){prev.definitions=prev.definitions.concat(stat.definitions);CHANGED=true}else if(stat instanceof AST_For&&prev instanceof AST_Definitions&&(!stat.init||stat.init.TYPE==prev.TYPE)){CHANGED=true;a.pop();if(stat.init){stat.init.definitions=prev.definitions.concat(stat.init.definitions)}else{stat.init=prev}a.push(stat);prev=stat}else{prev=stat;a.push(stat)}return a},[])}}function extract_declarations_from_unreachable_code(compressor,stat,target){compressor.warn("Dropping unreachable code [{file}:{line},{col}]",stat.start);stat.walk(new TreeWalker(function(node){if(node instanceof AST_Definitions){compressor.warn("Declarations in unreachable code! [{file}:{line},{col}]",node.start);node.remove_initializers();target.push(node);return true}if(node instanceof AST_Defun){target.push(node);return true}if(node instanceof AST_Scope){return true}}))}(function(def){var unary_bool=["!","delete"];var binary_bool=["in","instanceof","==","!=","===","!==","<","<=",">=",">"];def(AST_Node,function(){return false});def(AST_UnaryPrefix,function(){return member(this.operator,unary_bool)});def(AST_Binary,function(){return member(this.operator,binary_bool)||(this.operator=="&&"||this.operator=="||")&&this.left.is_boolean()&&this.right.is_boolean()});def(AST_Conditional,function(){return this.consequent.is_boolean()&&this.alternative.is_boolean()});def(AST_Assign,function(){return this.operator=="="&&this.right.is_boolean()});def(AST_Seq,function(){return this.cdr.is_boolean()});def(AST_True,function(){return true});def(AST_False,function(){return true})})(function(node,func){node.DEFMETHOD("is_boolean",func)});(function(def){def(AST_Node,function(){return false});def(AST_String,function(){return true});def(AST_UnaryPrefix,function(){return this.operator=="typeof"});def(AST_Binary,function(){return this.operator=="+"&&(this.left.is_string()||this.right.is_string())});def(AST_Assign,function(){return this.operator=="="&&this.right.is_string()})})(function(node,func){node.DEFMETHOD("is_string",func)});function best_of(ast1,ast2){return ast1.print_to_string().length>ast2.print_to_string().length?ast2:ast1}(function(def){AST_Node.DEFMETHOD("evaluate",function(compressor){if(!compressor.option("evaluate"))return[this];try{var val=this._eval(),ast=make_node_from_constant(compressor,val,this);return[best_of(ast,this),val]}catch(ex){if(ex!==def)throw ex;return[this]}});def(AST_Statement,function(){throw new Error(string_template("Cannot evaluate a statement [{file}:{line},{col}]",this.start))});def(AST_Function,function(){return[this]});function ev(node){return node._eval()}def(AST_Node,function(){throw def});def(AST_Constant,function(){return this.getValue()});def(AST_UnaryPrefix,function(){var e=this.expression;switch(this.operator){case"!":return!ev(e);case"typeof":return typeof ev(e);case"void":return void ev(e);case"~":return~ev(e);case"-":return-ev(e);case"+":return+ev(e)}throw def});def(AST_Binary,function(){var left=this.left,right=this.right;switch(this.operator){case"&&":return ev(left)&&ev(right);case"||":return ev(left)||ev(right);case"|":return ev(left)|ev(right);case"&":return ev(left)&ev(right);case"^":return ev(left)^ev(right);case"+":return ev(left)+ev(right);case"*":return ev(left)*ev(right);case"/":return ev(left)/ev(right);case"%":return ev(left)%ev(right);case"-":return ev(left)-ev(right);case"<<":return ev(left)<<ev(right);case">>":return ev(left)>>ev(right);case">>>":return ev(left)>>>ev(right);case"==":return ev(left)==ev(right);case"===":return ev(left)===ev(right);case"!=":return ev(left)!=ev(right);case"!==":return ev(left)!==ev(right);case"<":return ev(left)<ev(right);case"<=":return ev(left)<=ev(right);case">":return ev(left)>ev(right);case">=":return ev(left)>=ev(right);case"in":return ev(left)in ev(right);case"instanceof":return ev(left)instanceof ev(right)}throw def});def(AST_Conditional,function(){return ev(this.condition)?ev(this.consequent):ev(this.alternative)});def(AST_SymbolRef,function(){var d=this.definition();if(d&&d.constant){var orig=d.orig[0];if(orig)orig=orig.init[0];orig=orig&&orig.value;if(orig)return ev(orig)}throw def})})(function(node,func){node.DEFMETHOD("_eval",func)});(function(def){function basic_negation(exp){return make_node(AST_UnaryPrefix,exp,{operator:"!",expression:exp})}def(AST_Node,function(){return basic_negation(this)});def(AST_Statement,function(){throw new Error("Cannot negate a statement")});def(AST_Function,function(){return basic_negation(this)});def(AST_UnaryPrefix,function(){if(this.operator=="!")return this.expression;return basic_negation(this)});def(AST_Seq,function(compressor){var self=this.clone();self.cdr=self.cdr.negate(compressor);return self});def(AST_Conditional,function(compressor){var self=this.clone();self.consequent=self.consequent.negate(compressor);self.alternative=self.alternative.negate(compressor);return best_of(basic_negation(this),self)});def(AST_Binary,function(compressor){var self=this.clone(),op=this.operator;if(compressor.option("unsafe_comps")){switch(op){case"<=":self.operator=">";return self;case"<":self.operator=">=";return self;case">=":self.operator="<";return self;case">":self.operator="<=";return self}}switch(op){case"==":self.operator="!=";return self;case"!=":self.operator="==";return self;case"===":self.operator="!==";return self;case"!==":self.operator="===";return self;case"&&":self.operator="||";self.left=self.left.negate(compressor);self.right=self.right.negate(compressor);return best_of(basic_negation(this),self);case"||":self.operator="&&";self.left=self.left.negate(compressor);self.right=self.right.negate(compressor);return best_of(basic_negation(this),self)}return basic_negation(this)})})(function(node,func){node.DEFMETHOD("negate",function(compressor){return func.call(this,compressor)})});(function(def){def(AST_Node,function(){return true});def(AST_EmptyStatement,function(){return false});def(AST_Constant,function(){return false});def(AST_This,function(){return false});def(AST_Block,function(){for(var i=this.body.length;--i>=0;){if(this.body[i].has_side_effects())return true}return false});def(AST_SimpleStatement,function(){return this.body.has_side_effects()});def(AST_Defun,function(){return true});def(AST_Function,function(){return false});def(AST_Binary,function(){return this.left.has_side_effects()||this.right.has_side_effects()});def(AST_Assign,function(){return true});def(AST_Conditional,function(){return this.condition.has_side_effects()||this.consequent.has_side_effects()||this.alternative.has_side_effects()});def(AST_Unary,function(){return this.operator=="delete"||this.operator=="++"||this.operator=="--"||this.expression.has_side_effects()});def(AST_SymbolRef,function(){return false});def(AST_Object,function(){for(var i=this.properties.length;--i>=0;)if(this.properties[i].has_side_effects())return true;return false});def(AST_ObjectProperty,function(){return this.value.has_side_effects()});def(AST_Array,function(){for(var i=this.elements.length;--i>=0;)if(this.elements[i].has_side_effects())return true;return false});def(AST_PropAccess,function(){return true});def(AST_Seq,function(){return this.car.has_side_effects()||this.cdr.has_side_effects()})})(function(node,func){node.DEFMETHOD("has_side_effects",func)});function aborts(thing){return thing&&thing.aborts()}(function(def){def(AST_Statement,function(){return null});def(AST_Jump,function(){return this});def(AST_BlockStatement,function(){var n=this.body.length;return n>0&&aborts(this.body[n-1])});def(AST_If,function(){return this.alternative&&aborts(this.body)&&aborts(this.alternative)})})(function(node,func){node.DEFMETHOD("aborts",func)});OPT(AST_Directive,function(self,compressor){if(self.scope.has_directive(self.value)!==self.scope){return make_node(AST_EmptyStatement,self)}return self});OPT(AST_Debugger,function(self,compressor){if(compressor.option("drop_debugger"))return make_node(AST_EmptyStatement,self);return self});OPT(AST_LabeledStatement,function(self,compressor){if(self.body instanceof AST_Break&&compressor.loopcontrol_target(self.body.label)===self.body){return make_node(AST_EmptyStatement,self)}return self.label.references.length==0?self.body:self});OPT(AST_Block,function(self,compressor){self.body=tighten_body(self.body,compressor);return self});OPT(AST_BlockStatement,function(self,compressor){self.body=tighten_body(self.body,compressor);switch(self.body.length){case 1:return self.body[0];case 0:return make_node(AST_EmptyStatement,self)}return self});AST_Scope.DEFMETHOD("drop_unused",function(compressor){var self=this;if(compressor.option("unused")&&!(self instanceof AST_Toplevel)&&!self.uses_eval){var in_use=[];var scope=this;var tw=new TreeWalker(function(node,descend){if(node!==self){if(node instanceof AST_Defun){return true}if(node instanceof AST_Definitions&&scope===self){node.definitions.forEach(function(def){if(def.value&&def.value.has_side_effects()){def.value.walk(tw)}});return true}if(node instanceof AST_SymbolRef&&!(node instanceof AST_LabelRef)){push_uniq(in_use,node.definition());return true}if(node instanceof AST_Scope){var save_scope=scope;scope=node;descend();scope=save_scope;return true}}});self.walk(tw);for(var i=0;i<in_use.length;++i){in_use[i].orig.forEach(function(decl){if(decl instanceof AST_SymbolDeclaration){decl.init.forEach(function(init){var tw=new TreeWalker(function(node){if(node instanceof AST_SymbolRef&&!(node instanceof AST_LabelRef)){push_uniq(in_use,node.definition())}});init.walk(tw)})}})}var tt=new TreeTransformer(function before(node,descend){if(node instanceof AST_Lambda){for(var a=node.argnames,i=a.length;--i>=0;){var sym=a[i];if(sym.unreferenced()){a.pop();compressor.warn("Dropping unused function argument {name} [{file}:{line},{col}]",{name:sym.name,file:sym.start.file,line:sym.start.line,col:sym.start.col})}else break}}if(node instanceof AST_Defun&&node!==self){if(!member(node.name.definition(),in_use)){compressor.warn("Dropping unused function {name} [{file}:{line},{col}]",{name:node.name.name,file:node.name.start.file,line:node.name.start.line,col:node.name.start.col});return make_node(AST_EmptyStatement,node)}return node}if(node instanceof AST_Definitions&&!(tt.parent()instanceof AST_ForIn)){var def=node.definitions.filter(function(def){if(member(def.name.definition(),in_use))return true;var w={name:def.name.name,file:def.name.start.file,line:def.name.start.line,col:def.name.start.col};if(def.value&&def.value.has_side_effects()){def._unused_side_effects=true;compressor.warn("Side effects in initialization of unused variable {name} [{file}:{line},{col}]",w);return true}compressor.warn("Dropping unused variable {name} [{file}:{line},{col}]",w);return false});def=mergeSort(def,function(a,b){if(!a.value&&b.value)return-1;if(!b.value&&a.value)return 1;return 0});var side_effects=[];for(var i=0;i<def.length;){var x=def[i];if(x._unused_side_effects){side_effects.push(x.value);def.splice(i,1)}else{if(side_effects.length>0){side_effects.push(x.value);x.value=AST_Seq.from_array(side_effects);side_effects=[]}++i}}if(side_effects.length>0){side_effects=make_node(AST_BlockStatement,node,{body:[make_node(AST_SimpleStatement,node,{body:AST_Seq.from_array(side_effects)})]})}else{side_effects=null}if(def.length==0&&!side_effects){return make_node(AST_EmptyStatement,node)}if(def.length==0){return side_effects}node.definitions=def;if(side_effects){side_effects.body.unshift(node);node=side_effects}return node}if(node instanceof AST_Scope&&node!==self)return node});self.transform(tt)}});AST_Scope.DEFMETHOD("hoist_declarations",function(compressor){var hoist_funs=compressor.option("hoist_funs");var hoist_vars=compressor.option("hoist_vars");var self=this;if(hoist_funs||hoist_vars){var dirs=[];var hoisted=[];var vars={},vars_found=0,var_decl=0;self.walk(new TreeWalker(function(node){if(node instanceof AST_Scope&&node!==self)return true;if(node instanceof AST_Var){++var_decl;return true}}));hoist_vars=hoist_vars&&var_decl>1;var tt=new TreeTransformer(function before(node){if(node!==self){if(node instanceof AST_Directive){dirs.push(node);return make_node(AST_EmptyStatement,node)}if(node instanceof AST_Defun&&hoist_funs){hoisted.push(node);return make_node(AST_EmptyStatement,node)}if(node instanceof AST_Var&&hoist_vars){node.definitions.forEach(function(def){vars[def.name.name]=def;++vars_found});var seq=node.to_assignments();var p=tt.parent();if(p instanceof AST_ForIn&&p.init===node){if(seq==null)return node.definitions[0].name;return seq}if(p instanceof AST_For&&p.init===node){return seq}if(!seq)return make_node(AST_EmptyStatement,node);return make_node(AST_SimpleStatement,node,{body:seq})}if(node instanceof AST_Scope)return node}});self=self.transform(tt);if(vars_found>0)hoisted.unshift(make_node(AST_Var,self,{definitions:Object.keys(vars).map(function(name){var def=vars[name].clone();def.value=null;return def})}));self.body=dirs.concat(hoisted,self.body)}return self});OPT(AST_SimpleStatement,function(self,compressor){if(compressor.option("side_effects")){if(!self.body.has_side_effects()){compressor.warn("Dropping side-effect-free statement [{file}:{line},{col}]",self.start);return make_node(AST_EmptyStatement,self)}}return self});OPT(AST_DWLoop,function(self,compressor){var cond=self.condition.evaluate(compressor);self.condition=cond[0];if(!compressor.option("loops"))return self;if(cond.length>1){if(cond[1]){return make_node(AST_For,self,{body:self.body})}else if(self instanceof AST_While){if(compressor.option("dead_code")){var a=[];extract_declarations_from_unreachable_code(compressor,self.body,a);return make_node(AST_BlockStatement,self,{body:a})}}else{return self.body}}return self});OPT(AST_For,function(self,compressor){var cond=self.condition;if(cond){cond=cond.evaluate(compressor);self.condition=cond[0]}if(!compressor.option("loops"))return self;if(cond){if(cond.length>1&&!cond[1]){if(compressor.option("dead_code")){var a=[];if(self.init instanceof AST_Statement){a.push(self.init)}else if(self.init){a.push(make_node(AST_SimpleStatement,self.init,{body:self.init}))}extract_declarations_from_unreachable_code(compressor,self.body,a);return make_node(AST_BlockStatement,self,{body:a})}}}return self});OPT(AST_If,function(self,compressor){if(!compressor.option("conditionals"))return self;var cond=self.condition.evaluate(compressor);self.condition=cond[0];if(cond.length>1){if(cond[1]){compressor.warn("Condition always true [{file}:{line},{col}]",self.condition.start);if(compressor.option("dead_code")){var a=[];if(self.alternative){extract_declarations_from_unreachable_code(compressor,self.alternative,a)}a.push(self.body);return make_node(AST_BlockStatement,self,{body:a}).transform(compressor)}}else{compressor.warn("Condition always false [{file}:{line},{col}]",self.condition.start);if(compressor.option("dead_code")){var a=[];extract_declarations_from_unreachable_code(compressor,self.body,a);if(self.alternative)a.push(self.alternative);return make_node(AST_BlockStatement,self,{body:a}).transform(compressor)}}}if(is_empty(self.alternative))self.alternative=null;var negated=self.condition.negate(compressor);var negated_is_best=best_of(self.condition,negated)===negated;if(self.alternative&&negated_is_best){negated_is_best=false;self.condition=negated;var tmp=self.body;self.body=self.alternative||make_node(AST_EmptyStatement);self.alternative=tmp}if(is_empty(self.body)&&is_empty(self.alternative)){return make_node(AST_SimpleStatement,self.condition,{body:self.condition}).transform(compressor)}if(self.body instanceof AST_SimpleStatement&&self.alternative instanceof AST_SimpleStatement){return make_node(AST_SimpleStatement,self,{body:make_node(AST_Conditional,self,{condition:self.condition,consequent:self.body.body,alternative:self.alternative.body})}).transform(compressor)}if(is_empty(self.alternative)&&self.body instanceof AST_SimpleStatement){if(negated_is_best)return make_node(AST_SimpleStatement,self,{body:make_node(AST_Binary,self,{operator:"||",left:negated,right:self.body.body})}).transform(compressor);return make_node(AST_SimpleStatement,self,{body:make_node(AST_Binary,self,{operator:"&&",left:self.condition,right:self.body.body})}).transform(compressor)}if(self.body instanceof AST_EmptyStatement&&self.alternative&&self.alternative instanceof AST_SimpleStatement){return make_node(AST_SimpleStatement,self,{body:make_node(AST_Binary,self,{operator:"||",left:self.condition,right:self.alternative.body})}).transform(compressor)}if(self.body instanceof AST_Exit&&self.alternative instanceof AST_Exit&&self.body.TYPE==self.alternative.TYPE){return make_node(self.body.CTOR,self,{value:make_node(AST_Conditional,self,{condition:self.condition,consequent:self.body.value||make_node(AST_Undefined,self.body).optimize(compressor),alternative:self.alternative.value||make_node(AST_Undefined,self.alternative).optimize(compressor)})}).transform(compressor)}if(self.body instanceof AST_If&&!self.body.alternative&&!self.alternative){self.condition=make_node(AST_Binary,self.condition,{operator:"&&",left:self.condition,right:self.body.condition}).transform(compressor);self.body=self.body.body}if(aborts(self.body)){if(self.alternative){var alt=self.alternative;self.alternative=null;return make_node(AST_BlockStatement,self,{body:[self,alt]}).transform(compressor)}}if(aborts(self.alternative)){var body=self.body;self.body=self.alternative;self.condition=negated_is_best?negated:self.condition.negate(compressor);self.alternative=null;return make_node(AST_BlockStatement,self,{body:[self,body]}).transform(compressor)}return self});OPT(AST_Switch,function(self,compressor){if(self.body.length==0&&compressor.option("conditionals")){return make_node(AST_SimpleStatement,self,{body:self.expression}).transform(compressor)}var last_branch=self.body[self.body.length-1];if(last_branch){var stat=last_branch.body[last_branch.body.length-1];if(stat instanceof AST_Break&&loop_body(compressor.loopcontrol_target(stat.label))===self)last_branch.body.pop()}return self});OPT(AST_Case,function(self,compressor){self.body=tighten_body(self.body,compressor);return self});OPT(AST_Try,function(self,compressor){self.body=tighten_body(self.body,compressor);return self});AST_Definitions.DEFMETHOD("remove_initializers",function(){this.definitions.forEach(function(def){def.value=null})});AST_Definitions.DEFMETHOD("to_assignments",function(){var assignments=this.definitions.reduce(function(a,def){if(def.value){var name=make_node(AST_SymbolRef,def.name,def.name);a.push(make_node(AST_Assign,def,{operator:"=",left:name,right:def.value}))}return a},[]);if(assignments.length==0)return null;return AST_Seq.from_array(assignments)});OPT(AST_Definitions,function(self,compressor){if(self.definitions.length==0)return make_node(AST_EmptyStatement,self);return self});OPT(AST_Function,function(self,compressor){self=AST_Lambda.prototype.optimize.call(self,compressor);if(compressor.option("unused")){if(self.name&&self.name.unreferenced()){self.name=null}}return self});OPT(AST_Call,function(self,compressor){if(compressor.option("unsafe")){var exp=self.expression;if(exp instanceof AST_SymbolRef&&exp.undeclared()){switch(exp.name){case"Array":if(self.args.length!=1){return make_node(AST_Array,self,{elements:self.args})}break;case"Object":if(self.args.length==0){return make_node(AST_Object,self,{properties:[]})}break;case"String":return make_node(AST_Binary,self,{left:self.args[0],operator:"+",right:make_node(AST_String,self,{value:""})})}}else if(exp instanceof AST_Dot&&exp.property=="toString"&&self.args.length==0){return make_node(AST_Binary,self,{left:exp.expression,operator:"+",right:make_node(AST_String,self,{value:""})}).transform(compressor)}}if(compressor.option("side_effects")){if(self.expression instanceof AST_Function&&self.args.length==0&&!AST_Block.prototype.has_side_effects.call(self.expression)){return make_node(AST_Undefined,self).transform(compressor)}}return self});OPT(AST_New,function(self,compressor){if(compressor.option("unsafe")){var exp=self.expression;if(exp instanceof AST_SymbolRef&&exp.undeclared()){switch(exp.name){case"Object":case"RegExp":case"Function":case"Error":case"Array":return make_node(AST_Call,self,self)}}}return self});OPT(AST_Seq,function(self,compressor){if(!compressor.option("side_effects"))return self;if(!self.car.has_side_effects())return self.cdr;if(compressor.option("cascade")){if(self.car instanceof AST_Assign&&!self.car.left.has_side_effects()&&self.car.left.equivalent_to(self.cdr)){return self.car}if(!self.car.has_side_effects()&&!self.cdr.has_side_effects()&&self.car.equivalent_to(self.cdr)){return self.car}}return self});AST_Unary.DEFMETHOD("lift_sequences",function(compressor){if(compressor.option("sequences")){if(this.expression instanceof AST_Seq){var seq=this.expression;var x=seq.to_array();this.expression=x.pop();x.push(this);seq=AST_Seq.from_array(x).transform(compressor);return seq}}return this});OPT(AST_UnaryPostfix,function(self,compressor){return self.lift_sequences(compressor)});OPT(AST_UnaryPrefix,function(self,compressor){self=self.lift_sequences(compressor);var e=self.expression;if(compressor.option("booleans")&&compressor.in_boolean_context()){switch(self.operator){case"!":if(e instanceof AST_UnaryPrefix&&e.operator=="!"){return e.expression}break;case"typeof":compressor.warn("Boolean expression always true [{file}:{line},{col}]",self.start);return make_node(AST_True,self)}if(e instanceof AST_Binary&&self.operator=="!"){self=best_of(self,e.negate(compressor))}}return self.evaluate(compressor)[0]});AST_Binary.DEFMETHOD("lift_sequences",function(compressor){if(compressor.option("sequences")){if(this.left instanceof AST_Seq){var seq=this.left;var x=seq.to_array();this.left=x.pop();x.push(this);seq=AST_Seq.from_array(x).transform(compressor);return seq}if(this.right instanceof AST_Seq&&!(this.operator=="||"||this.operator=="&&")&&!this.left.has_side_effects()){var seq=this.right;var x=seq.to_array();this.right=x.pop();x.push(this);seq=AST_Seq.from_array(x).transform(compressor);return seq}}return this});OPT(AST_Binary,function(self,compressor){self=self.lift_sequences(compressor);if(compressor.option("comparisons"))switch(self.operator){case"===":case"!==":if(self.left.is_string()&&self.right.is_string()||self.left.is_boolean()&&self.right.is_boolean()){self.operator=self.operator.substr(0,2)}case"==":case"!=":if(self.left instanceof AST_UnaryPrefix&&self.left.operator=="typeof"&&self.right instanceof AST_String&&self.right.value=="undefined"){if(!(self.left.expression instanceof AST_SymbolRef)||!self.left.expression.undeclared()){self.left=self.left.expression;self.right=make_node(AST_Undefined,self.right).optimize(compressor);if(self.operator.length==2)self.operator+="="}}else if(self.left instanceof AST_String&&self.left.value=="undefined"&&self.right instanceof AST_UnaryPrefix&&self.right.operator=="typeof"){if(!(self.right.expression instanceof AST_SymbolRef)||!self.right.expression.undeclared()){self.left=self.right.expression;self.right=make_node(AST_Undefined,self.left).optimize(compressor);if(self.operator.length==2)self.operator+="="}}break}if(compressor.option("booleans")&&compressor.in_boolean_context())switch(self.operator){case"&&":var ll=self.left.evaluate(compressor);var rr=self.right.evaluate(compressor);if(ll.length>1&&!ll[1]||rr.length>1&&!rr[1]){compressor.warn("Boolean && always false [{file}:{line},{col}]",self.start);return make_node(AST_False,self)}if(ll.length>1&&ll[1]){return rr[0]}if(rr.length>1&&rr[1]){return ll[0]}break;case"||":var ll=self.left.evaluate(compressor);var rr=self.right.evaluate(compressor);if(ll.length>1&&ll[1]||rr.length>1&&rr[1]){compressor.warn("Boolean || always true [{file}:{line},{col}]",self.start);return make_node(AST_True,self)}if(ll.length>1&&!ll[1]){return rr[0]}if(rr.length>1&&!rr[1]){return ll[0]}break;case"+":var ll=self.left.evaluate(compressor);var rr=self.right.evaluate(compressor);if(ll.length>1&&ll[0]instanceof AST_String&&ll[1]||rr.length>1&&rr[0]instanceof AST_String&&rr[1]){compressor.warn("+ in boolean context always true [{file}:{line},{col}]",self.start);return make_node(AST_True,self)}break}var exp=self.evaluate(compressor);if(exp.length>1){if(best_of(exp[0],self)!==self)return exp[0]}if(compressor.option("comparisons")){if(!(compressor.parent()instanceof AST_Binary)||compressor.parent()instanceof AST_Assign){var negated=make_node(AST_UnaryPrefix,self,{operator:"!",expression:self.negate(compressor)});self=best_of(self,negated)}var reverse=function(op){self.operator=op;var tmp=self.left;self.left=self.right;self.right=tmp};switch(self.operator){case"<":reverse(">");break;case"<=":reverse(">=");break}}return self});OPT(AST_SymbolRef,function(self,compressor){if(self.undeclared()){var defines=compressor.option("global_defs");if(defines&&defines.hasOwnProperty(self.name)){return make_node_from_constant(compressor,defines[self.name],self)}switch(self.name){case"undefined":return make_node(AST_Undefined,self);case"NaN":return make_node(AST_NaN,self);case"Infinity":return make_node(AST_Infinity,self)}}return self});OPT(AST_Undefined,function(self,compressor){if(compressor.option("unsafe")){var scope=compressor.find_parent(AST_Scope);var undef=scope.find_variable("undefined");if(undef){var ref=make_node(AST_SymbolRef,self,{name:"undefined",scope:scope,thedef:undef});ref.reference();return ref}}return self});var ASSIGN_OPS=["+","-","/","*","%",">>","<<",">>>","|","^","&"];OPT(AST_Assign,function(self,compressor){self=self.lift_sequences(compressor);if(self.operator=="="&&self.left instanceof AST_SymbolRef&&self.right instanceof AST_Binary&&self.right.left instanceof AST_SymbolRef&&self.right.left.name==self.left.name&&member(self.right.operator,ASSIGN_OPS)){self.operator=self.right.operator+"=";self.right=self.right.right}return self});OPT(AST_Conditional,function(self,compressor){if(!compressor.option("conditionals"))return self;if(self.condition instanceof AST_Seq){var car=self.condition.car;self.condition=self.condition.cdr;return AST_Seq.cons(car,self)}var cond=self.condition.evaluate(compressor);if(cond.length>1){if(cond[1]){compressor.warn("Condition always true [{file}:{line},{col}]",self.start);return self.consequent}else{compressor.warn("Condition always false [{file}:{line},{col}]",self.start);return self.alternative}}var negated=cond[0].negate(compressor);if(best_of(cond[0],negated)===negated){self=make_node(AST_Conditional,self,{condition:negated,consequent:self.alternative,alternative:self.consequent})}var consequent=self.consequent;var alternative=self.alternative;if(consequent instanceof AST_Assign&&alternative instanceof AST_Assign&&consequent.operator==alternative.operator&&consequent.left.equivalent_to(alternative.left)){self=make_node(AST_Assign,self,{operator:consequent.operator,left:consequent.left,right:make_node(AST_Conditional,self,{condition:self.condition,consequent:consequent.right,alternative:alternative.right})})}return self});OPT(AST_Boolean,function(self,compressor){if(compressor.option("booleans")){var p=compressor.parent();if(p instanceof AST_Binary&&(p.operator=="=="||p.operator=="!=")){compressor.warn("Non-strict equality against boolean: {operator} {value} [{file}:{line},{col}]",{operator:p.operator,value:self.value,file:p.start.file,line:p.start.line,col:p.start.col});return make_node(AST_Number,self,{value:+self.value})}return make_node(AST_UnaryPrefix,self,{operator:"!",expression:make_node(AST_Number,self,{value:1-self.value})})}return self});OPT(AST_Sub,function(self,compressor){var prop=self.property;if(prop instanceof AST_String&&compressor.option("properties")){prop=prop.getValue();if(is_identifier(prop)){return make_node(AST_Dot,self,{expression:self.expression,property:prop})}}return self});function literals_in_boolean_context(self,compressor){if(compressor.option("booleans")&&compressor.in_boolean_context()){return make_node(AST_True,self)}return self}OPT(AST_Array,literals_in_boolean_context);OPT(AST_Object,literals_in_boolean_context);OPT(AST_RegExp,literals_in_boolean_context)})();"use strict";function SourceMap(options){options=defaults(options,{file:null,root:null,orig:null});var generator=new MOZ_SourceMap.SourceMapGenerator({file:options.file,sourceRoot:options.root});var orig_map=options.orig&&new MOZ_SourceMap.SourceMapConsumer(options.orig);function add(source,gen_line,gen_col,orig_line,orig_col,name){if(orig_map){var info=orig_map.originalPositionFor({line:orig_line,column:orig_col});source=info.source;orig_line=info.line;orig_col=info.column;name=info.name}generator.addMapping({generated:{line:gen_line,column:gen_col},original:{line:orig_line,column:orig_col},source:source,name:name})}return{add:add,get:function(){return generator},toString:function(){return generator.toString()}}}"use strict";(function(){var MOZ_TO_ME={TryStatement:function(M){return new AST_Try({start:my_start_token(M),end:my_end_token(M),body:from_moz(M.block).body,bcatch:from_moz(M.handlers[0]),bfinally:M.finalizer?new AST_Finally(from_moz(M.finalizer)):null})},CatchClause:function(M){return new AST_Catch({start:my_start_token(M),end:my_end_token(M),argname:from_moz(M.param),body:from_moz(M.body).body})},ObjectExpression:function(M){return new AST_Object({start:my_start_token(M),end:my_end_token(M),properties:M.properties.map(function(prop){var key=prop.key;var name=key.type=="Identifier"?key.name:key.value;var args={start:my_start_token(key),end:my_end_token(prop.value),key:name,value:from_moz(prop.value)};switch(prop.kind){case"init":return new AST_ObjectKeyVal(args);case"set":args.value.name=from_moz(key);return new AST_ObjectSetter(args);case"get":args.value.name=from_moz(key);return new AST_ObjectGetter(args)}})})},SequenceExpression:function(M){return AST_Seq.from_array(M.expressions.map(from_moz))},MemberExpression:function(M){return new(M.computed?AST_Sub:AST_Dot)({start:my_start_token(M),end:my_end_token(M),property:M.computed?from_moz(M.property):M.property.name,expression:from_moz(M.object)})
},SwitchCase:function(M){return new(M.test?AST_Case:AST_Default)({start:my_start_token(M),end:my_end_token(M),expression:from_moz(M.test),body:M.consequent.map(from_moz)})},Literal:function(M){var val=M.value,args={start:my_start_token(M),end:my_end_token(M)};if(val===null)return new AST_Null(args);switch(typeof val){case"string":args.value=val;return new AST_String(args);case"number":args.value=val;return new AST_Number(args);case"boolean":return new(val?AST_True:AST_False)(args);default:args.value=val;return new AST_RegExp(args)}},UnaryExpression:From_Moz_Unary,UpdateExpression:From_Moz_Unary,Identifier:function(M){var p=FROM_MOZ_STACK[FROM_MOZ_STACK.length-2];return new(M.name=="this"?AST_This:p.type=="LabeledStatement"?AST_Label:p.type=="VariableDeclarator"&&p.id===M?p.kind=="const"?AST_SymbolConst:AST_SymbolVar:p.type=="FunctionExpression"?p.id===M?AST_SymbolLambda:AST_SymbolFunarg:p.type=="FunctionDeclaration"?p.id===M?AST_SymbolDefun:AST_SymbolFunarg:p.type=="CatchClause"?AST_SymbolCatch:p.type=="BreakStatement"||p.type=="ContinueStatement"?AST_LabelRef:AST_SymbolRef)({start:my_start_token(M),end:my_end_token(M),name:M.name})}};function From_Moz_Unary(M){return new(M.prefix?AST_UnaryPrefix:AST_UnaryPostfix)({start:my_start_token(M),end:my_end_token(M),operator:M.operator,expression:from_moz(M.argument)})}var ME_TO_MOZ={};map("Node",AST_Node);map("Program",AST_Toplevel,"body@body");map("Function",AST_Function,"id>name, params@argnames, body%body");map("EmptyStatement",AST_EmptyStatement);map("BlockStatement",AST_BlockStatement,"body@body");map("ExpressionStatement",AST_SimpleStatement,"expression>body");map("IfStatement",AST_If,"test>condition, consequent>body, alternate>alternative");map("LabeledStatement",AST_LabeledStatement,"label>label, body>body");map("BreakStatement",AST_Break,"label>label");map("ContinueStatement",AST_Continue,"label>label");map("WithStatement",AST_With,"object>expression, body>body");map("SwitchStatement",AST_Switch,"discriminant>expression, cases@body");map("ReturnStatement",AST_Return,"argument>value");map("ThrowStatement",AST_Throw,"argument>value");map("WhileStatement",AST_While,"test>condition, body>body");map("DoWhileStatement",AST_Do,"test>condition, body>body");map("ForStatement",AST_For,"init>init, test>condition, update>step, body>body");map("ForInStatement",AST_ForIn,"left>init, right>object, body>body");map("DebuggerStatement",AST_Debugger);map("FunctionDeclaration",AST_Defun,"id>name, params@argnames, body%body");map("VariableDeclaration",AST_Var,"declarations@definitions");map("VariableDeclarator",AST_VarDef,"id>name, init>value");map("ThisExpression",AST_This);map("ArrayExpression",AST_Array,"elements@elements");map("FunctionExpression",AST_Function,"id>name, params@argnames, body%body");map("BinaryExpression",AST_Binary,"operator=operator, left>left, right>right");map("AssignmentExpression",AST_Assign,"operator=operator, left>left, right>right");map("LogicalExpression",AST_Binary,"operator=operator, left>left, right>right");map("ConditionalExpression",AST_Conditional,"test>condition, consequent>consequent, alternate>alternative");map("NewExpression",AST_New,"callee>expression, arguments@args");map("CallExpression",AST_Call,"callee>expression, arguments@args");function my_start_token(moznode){return new AST_Token({file:moznode.loc&&moznode.loc.source,line:moznode.loc&&moznode.loc.start.line,col:moznode.loc&&moznode.loc.start.column,pos:moznode.start,endpos:moznode.start})}function my_end_token(moznode){return new AST_Token({file:moznode.loc&&moznode.loc.source,line:moznode.loc&&moznode.loc.end.line,col:moznode.loc&&moznode.loc.end.column,pos:moznode.end,endpos:moznode.end})}function map(moztype,mytype,propmap){var moz_to_me="function From_Moz_"+moztype+"(M){\n";moz_to_me+="return new mytype({\n"+"start: my_start_token(M),\n"+"end: my_end_token(M)";if(propmap)propmap.split(/\s*,\s*/).forEach(function(prop){var m=/([a-z0-9$_]+)(=|@|>|%)([a-z0-9$_]+)/i.exec(prop);if(!m)throw new Error("Can't understand property map: "+prop);var moz="M."+m[1],how=m[2],my=m[3];moz_to_me+=",\n"+my+": ";if(how=="@"){moz_to_me+=moz+".map(from_moz)"}else if(how==">"){moz_to_me+="from_moz("+moz+")"}else if(how=="="){moz_to_me+=moz}else if(how=="%"){moz_to_me+="from_moz("+moz+").body"}else throw new Error("Can't understand operator in propmap: "+prop)});moz_to_me+="\n})}";moz_to_me=new Function("mytype","my_start_token","my_end_token","from_moz","return("+moz_to_me+")")(mytype,my_start_token,my_end_token,from_moz);return MOZ_TO_ME[moztype]=moz_to_me}var FROM_MOZ_STACK=null;function from_moz(node){FROM_MOZ_STACK.push(node);var ret=node!=null?MOZ_TO_ME[node.type](node):null;FROM_MOZ_STACK.pop();return ret}AST_Node.from_mozilla_ast=function(node){var save_stack=FROM_MOZ_STACK;FROM_MOZ_STACK=[];var ast=from_moz(node);FROM_MOZ_STACK=save_stack;return ast}})();exports["array_to_hash"]=array_to_hash;exports["slice"]=slice;exports["characters"]=characters;exports["member"]=member;exports["find_if"]=find_if;exports["repeat_string"]=repeat_string;exports["DefaultsError"]=DefaultsError;exports["defaults"]=defaults;exports["merge"]=merge;exports["noop"]=noop;exports["MAP"]=MAP;exports["push_uniq"]=push_uniq;exports["string_template"]=string_template;exports["remove"]=remove;exports["mergeSort"]=mergeSort;exports["set_difference"]=set_difference;exports["set_intersection"]=set_intersection;exports["makePredicate"]=makePredicate;exports["DEFNODE"]=DEFNODE;exports["AST_Token"]=AST_Token;exports["AST_Node"]=AST_Node;exports["AST_Statement"]=AST_Statement;exports["AST_Debugger"]=AST_Debugger;exports["AST_Directive"]=AST_Directive;exports["AST_SimpleStatement"]=AST_SimpleStatement;exports["walk_body"]=walk_body;exports["AST_Block"]=AST_Block;exports["AST_BlockStatement"]=AST_BlockStatement;exports["AST_EmptyStatement"]=AST_EmptyStatement;exports["AST_StatementWithBody"]=AST_StatementWithBody;exports["AST_LabeledStatement"]=AST_LabeledStatement;exports["AST_DWLoop"]=AST_DWLoop;exports["AST_Do"]=AST_Do;exports["AST_While"]=AST_While;exports["AST_For"]=AST_For;exports["AST_ForIn"]=AST_ForIn;exports["AST_With"]=AST_With;exports["AST_Scope"]=AST_Scope;exports["AST_Toplevel"]=AST_Toplevel;exports["AST_Lambda"]=AST_Lambda;exports["AST_Function"]=AST_Function;exports["AST_Defun"]=AST_Defun;exports["AST_Jump"]=AST_Jump;exports["AST_Exit"]=AST_Exit;exports["AST_Return"]=AST_Return;exports["AST_Throw"]=AST_Throw;exports["AST_LoopControl"]=AST_LoopControl;exports["AST_Break"]=AST_Break;exports["AST_Continue"]=AST_Continue;exports["AST_If"]=AST_If;exports["AST_Switch"]=AST_Switch;exports["AST_SwitchBranch"]=AST_SwitchBranch;exports["AST_Default"]=AST_Default;exports["AST_Case"]=AST_Case;exports["AST_Try"]=AST_Try;exports["AST_Catch"]=AST_Catch;exports["AST_Finally"]=AST_Finally;exports["AST_Definitions"]=AST_Definitions;exports["AST_Var"]=AST_Var;exports["AST_Const"]=AST_Const;exports["AST_VarDef"]=AST_VarDef;exports["AST_Call"]=AST_Call;exports["AST_New"]=AST_New;exports["AST_Seq"]=AST_Seq;exports["AST_PropAccess"]=AST_PropAccess;exports["AST_Dot"]=AST_Dot;exports["AST_Sub"]=AST_Sub;exports["AST_Unary"]=AST_Unary;exports["AST_UnaryPrefix"]=AST_UnaryPrefix;exports["AST_UnaryPostfix"]=AST_UnaryPostfix;exports["AST_Binary"]=AST_Binary;exports["AST_Conditional"]=AST_Conditional;exports["AST_Assign"]=AST_Assign;exports["AST_Array"]=AST_Array;exports["AST_Object"]=AST_Object;exports["AST_ObjectProperty"]=AST_ObjectProperty;exports["AST_ObjectKeyVal"]=AST_ObjectKeyVal;exports["AST_ObjectSetter"]=AST_ObjectSetter;exports["AST_ObjectGetter"]=AST_ObjectGetter;exports["AST_Symbol"]=AST_Symbol;exports["AST_SymbolDeclaration"]=AST_SymbolDeclaration;exports["AST_SymbolVar"]=AST_SymbolVar;exports["AST_SymbolConst"]=AST_SymbolConst;exports["AST_SymbolFunarg"]=AST_SymbolFunarg;exports["AST_SymbolDefun"]=AST_SymbolDefun;exports["AST_SymbolLambda"]=AST_SymbolLambda;exports["AST_SymbolCatch"]=AST_SymbolCatch;exports["AST_Label"]=AST_Label;exports["AST_SymbolRef"]=AST_SymbolRef;exports["AST_LabelRef"]=AST_LabelRef;exports["AST_This"]=AST_This;exports["AST_Constant"]=AST_Constant;exports["AST_String"]=AST_String;exports["AST_Number"]=AST_Number;exports["AST_RegExp"]=AST_RegExp;exports["AST_Atom"]=AST_Atom;exports["AST_Null"]=AST_Null;exports["AST_NaN"]=AST_NaN;exports["AST_Undefined"]=AST_Undefined;exports["AST_Infinity"]=AST_Infinity;exports["AST_Boolean"]=AST_Boolean;exports["AST_False"]=AST_False;exports["AST_True"]=AST_True;exports["TreeWalker"]=TreeWalker;exports["KEYWORDS"]=KEYWORDS;exports["KEYWORDS_ATOM"]=KEYWORDS_ATOM;exports["RESERVED_WORDS"]=RESERVED_WORDS;exports["KEYWORDS_BEFORE_EXPRESSION"]=KEYWORDS_BEFORE_EXPRESSION;exports["OPERATOR_CHARS"]=OPERATOR_CHARS;exports["RE_HEX_NUMBER"]=RE_HEX_NUMBER;exports["RE_OCT_NUMBER"]=RE_OCT_NUMBER;exports["RE_DEC_NUMBER"]=RE_DEC_NUMBER;exports["OPERATORS"]=OPERATORS;exports["WHITESPACE_CHARS"]=WHITESPACE_CHARS;exports["PUNC_BEFORE_EXPRESSION"]=PUNC_BEFORE_EXPRESSION;exports["PUNC_CHARS"]=PUNC_CHARS;exports["REGEXP_MODIFIERS"]=REGEXP_MODIFIERS;exports["UNICODE"]=UNICODE;exports["is_letter"]=is_letter;exports["is_digit"]=is_digit;exports["is_alphanumeric_char"]=is_alphanumeric_char;exports["is_unicode_combining_mark"]=is_unicode_combining_mark;exports["is_unicode_connector_punctuation"]=is_unicode_connector_punctuation;exports["is_identifier"]=is_identifier;exports["is_identifier_start"]=is_identifier_start;exports["is_identifier_char"]=is_identifier_char;exports["parse_js_number"]=parse_js_number;exports["JS_Parse_Error"]=JS_Parse_Error;exports["js_error"]=js_error;exports["is_token"]=is_token;exports["EX_EOF"]=EX_EOF;exports["tokenizer"]=tokenizer;exports["UNARY_PREFIX"]=UNARY_PREFIX;exports["UNARY_POSTFIX"]=UNARY_POSTFIX;exports["ASSIGNMENT"]=ASSIGNMENT;exports["PRECEDENCE"]=PRECEDENCE;exports["STATEMENTS_WITH_LABELS"]=STATEMENTS_WITH_LABELS;exports["ATOMIC_START_TOKEN"]=ATOMIC_START_TOKEN;exports["parse"]=parse;exports["TreeTransformer"]=TreeTransformer;exports["SymbolDef"]=SymbolDef;exports["base54"]=base54;exports["OutputStream"]=OutputStream;exports["Compressor"]=Compressor;exports["SourceMap"]=SourceMap})({},function(){return this}())