# Uglifier  [![Build Status](https://secure.travis-ci.org/lautis/uglifier.png?branch=master)](http://travis-ci.org/lautis/uglifier) [![Dependency Status](https://gemnasium.com/lautis/uglifier.png?travis)](https://gemnasium.com/lautis/uglifier)

Ruby wrapper for [UglifyJS](https://github.com/mishoo/UglifyJS) JavaScript compressor.

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

When initializing UglifyJS, you can tune the behavior of UglifyJS by passing options. For example, if you want top-level variable names to be mangled:

    Uglifier.new(:toplevel => true).compile(source)

    # Or
    Uglifier.compile(source, :toplevel => true)

Available options and their defaults are

    {
      :mangle => true, # Mangle variable and function names, use :variables to skip function mangling
      :toplevel => false, # Mangle top-level variable names
      :except => [], # Variable names to be excluded from mangling
      :max_line_length => 32 * 1024, # Maximum line length
      :squeeze => true, # Squeeze code resulting in smaller, but less-readable code
      :seqs => true, # Reduce consecutive statements in blocks into single statement
      :dead_code => true, # Remove dead code (e.g. after return)
      :lift_vars => false, # Lift all var declarations at the start of the scope
      :unsafe => false, # Optimizations known to be unsafe in some situations
      :copyright => true, # Show copyright message
      :ascii_only => false, # Encode non-ASCII characters as Unicode code points
      :inline_script => false, # Escape </script
      :quote_keys => false, # Quote keys in object literals
      :define => {}, # Define values for symbol replacement
      :beautify => false, # Ouput indented code
      :beautify_options => {
        :indent_level => 4,
        :indent_start => 0,
        :space_colon => false
      }
    }

## Development

Uglifier bundles its javascript dependencies using git submodules. If you want to rebuild the javascript you will first need to get the latest version of the code with `git submodule update --init`. After you have the git submodules at the desired versions, run `rake js` to recreate `lib/uglify.js`.

See [CONTRIBUTING](https://github.com/lautis/uglifier/blob/master/CONTRIBUTING.md) for details about contributing to Uglifier.

## Copyright

© Ville Lautanala, [Flowdock](https://flowdock.com/). Released under MIT license, see [LICENSE.txt](https://github.com/lautis/uglifier/blob/master/LICENSE.txt) for more details.
