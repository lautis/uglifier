# Uglifier  [![Build Status](https://secure.travis-ci.org/lautis/uglifier.png?branch=master)](http://travis-ci.org/lautis/uglifier) [![Dependency Status](https://gemnasium.com/lautis/uglifier.png?travis)](https://gemnasium.com/lautis/uglifier)

Ruby wrapper for [UglifyJS](https://github.com/mishoo/UglifyJS) JavaScript compressor.

**NOTICE:** This documentation is for unreleased Uglifier 2.0, which is based on UglifyJS 2.0.

## Installation

Uglifier is available as a ruby gem.

    $ gem install uglifier

Ensure that your environment has a JavaScript interpreter supported by [ExecJS](https://github.com/sstephenson/execjs). Installing `therubyracer` gem is a safe choice  and having `node` in `PATH` works too.

## Usage

    require 'uglifier'

    Uglifier.new.compile(File.read("source.js"))
    # => js file minified

    # Or alternatively
    Uglifier.compile(File.read("source.js"))

Uglifier also supports generating source maps:

    uglified, source_map = Uglifier.new.compile_with_map(source)

When initializing UglifyJS, you can tune the behavior of UglifyJS by passing options. For example, if you want disable variable name mangling:

    Uglifier.new(:mangle => false).compile(source)

    # Or
    Uglifier.compile(source, :mangle => false)

Available options and their defaults are

    {
      :output => {
        :ascii_only => false, # Escape non-ASCII characters
        :comments => :copyright, # Preserve comments (:all, :jsdoc, :copyright, :none)
        :inline_script => false, # Escape occurrences of </script in strings
        :quote_keys => false, # Quote keys in object literals
        :max_line_len => 32 * 1024, # Maximum line length in minified code
        :ie_proof => true, # Output block brackets around do-while loops
        :bracketize => false, # Bracketize if, for, do, while or with statements, even if their body is a single statement
        :semicolons => true, # Separate statements with semicolons
        :preserve_line => false, # Preserve line numbers in outputs
        :beautify => false, # Beautify output
        :indent_level => 4, # Indent level in spaces
        :indent_start => 0, # Starting indent level
        :space_colon => false, # Insert space before colons (only with beautifier)
        :width => 80 # Specify line width when beautifier is used (only with beautifier)
      },
      :mangle => {
        :except => ["$super"] # Argument names to be excluded from mangling
      }, # Mangle variable and function names, set to false to skip mangling
      :compress => {
        :sequences => true, # Allow statements to be joined by commas
        :properties => true, # Rewrite property access using the dot notation
        :dead_code => true, # Remove unreachable code
        :drop_debugger => true, # Remove debugger; statements
        :unsafe => false, # Apply "unsafe" transformations
        :conditionals => true, # Optimize for if-s and conditional expressions
        :comparisons => true, # Apply binary node optimizations for comparisons
        :evaluate => true, # Attempt to evaluate constant expressions
        :booleans => true, # Various optimizations to boolean contexts
        :loops => true, # Optimize lops when condition can be statically determined
        :unused => true, # Drop unreferenced functions and variables
        :hoist_funs => true, # Hoist function declarations
        :hoist_vars => false, # Hoist var declarations
        :if_return => true, # Optimizations for if/return and if/continue
        :join_vars => true, # Join consecutive var statements
        :cascade => true # Cascade sequences
      }, # Apply transformations to code, set to false to skip
      :define => {}, # Define values for symbol replacement
      :source_filename => nil, # The filename of the input file
      :source_root => nil, # The URL of the directory which contains :source_filename
      :output_filename => nil, # The filename or URL where the minified output can be found
      :input_source_map => nil # The contents of the source map describing the input
    }

## Development

Uglifier bundles its javascript dependencies using git submodules. If you want to rebuild the javascript you will first need to get the latest version of the code with `git submodule update --init`. After you have the git submodules at the desired versions, run `rake js` to recreate `lib/uglify.js`.

See [CONTRIBUTING](https://github.com/lautis/uglifier/blob/master/CONTRIBUTING.md) for details about contributing to Uglifier.

## Copyright

© Ville Lautanala. Released under MIT license, see [LICENSE.txt](https://github.com/lautis/uglifier/blob/master/LICENSE.txt) for more details.
