# encoding: UTF-8

require "execjs"
require "multi_json"

class Uglifier
  Error = ExecJS::Error
  # MultiJson.engine = :json_gem

  # Default options for compilation
  DEFAULTS = {
    :output => {
      :ascii_only => false, # Escape non-ASCII characterss
      :comments => :copyright, # Preserve comments, possible values: :all, :jsdoc, :copyright, and :none.
      :inline_script => false, # Escape occurrences of </script in strings
      :quote_keys => false, # Quote keys in object literals
      :max_line_len => 32 * 1024, # Maximum line length in minified code
      :ie_proof => true, # Output block brakcets around do-while loops ([details](https://github.com/mishoo/UglifyJS/issues/57))
      :bracketize => false, # Always insert brackets in if, for, do, while or with statements, even if their body is a single statement.
      :semicolons => true, # Separate statements with semicolons
      :preserve_line => false,
      :beautify => false, # Beautify output
      :indent_level => 4, # Indent level in spaces
      :indent_start => 0, # Starting indent level
      :space_colon => false, # Insert space before colons (only with beautifier)
      :width => 80 # Specify line width when beautifier is used (only with beautifier)
    },
    :mangle => {
      :except => ["$super"]
    }, # Mangle variable and function names, set to false to skip mangling
    :compress => {
      :sequences => true, # join consecutive simple statements using the comma operator
      :properties => true, # rewrite property access using the dot notation, for example foo["bar"] → foo.bar
      :dead_code => true, # remove unreachable code
      :drop_debugger => true, # remove debugger; statements
      :unsafe => false,# apply "unsafe" transformations (discussion below)
      :conditionals => true, # apply optimizations for if-s and conditional expressions
      :comparisons => true, # apply certain optimizations to binary nodes, for example: !(a <= b) → a > b (only when unsafe), attempts to negate binary nodes, e.g. a = !b && !c && !d && !e → a=!(b||c||d||e) etc.
      :evaluate => true, # attempt to evaluate constant expressions
      :booleans => true, # various optimizations for boolean context, for example !!a ? b : c → a ? b : c
      :loops => true, # optimizations for do, while and for loops when we can statically determine the condition
      :unused => true, # drop unreferenced functions and variables
      :hoist_funs => true, # hoist function declarations
      :hoist_vars => false, # hoist var declarations (this is false by default because it seems to increase the size of the output in general)
      :if_return => true, # optimizations for if/return and if/continue
      :join_vars => true, # join consecutive var statements
      :cascade => true, # small optimization for sequences, transform x, x into x and x = something(), x into x = something()
      :warnings => true # display warnings when dropping unreachable code or unused declarations etc.
    }, # Apply transformations to code, set to false to skip
    :define => {}, # Define values for symbol replacement
    :source_filename => nil, # The filename of the input
    :source_root => nil, # The URL of the directory which contains :source_filename
    :output_filename => nil, # The filename or URL where the minified output can be found
    :input_source_map => nil, # The contents of the source map describing the input
  }

  SourcePath = File.expand_path("../uglify.js", __FILE__)
  ES5FallbackPath = File.expand_path("../es5.js", __FILE__)

  # Minifies JavaScript code using implicit context.
  #
  # source should be a String or IO object containing valid JavaScript.
  # options contain optional overrides to Uglifier::DEFAULTS
  #
  # Returns minified code as String
  def self.compile(source, options = {})
    self.new(options).compile(source)
  end

  # Minifies JavaScript code and generates a source map using implicit context.
  #
  # source should be a String or IO object containing valid JavaScript.
  # options contain optional overrides to Uglifier::DEFAULTS
  #
  # Returns a pair of [minified code as String, source map as a String]
  def self.compile_with_map(source, options = {})
    self.new(options).compile_with_map(source)
  end

  # Initialize new context for Uglifier with given options
  #
  # options - Hash of options to override Uglifier::DEFAULTS
  def initialize(options = {})
    @options = options
    @context = ExecJS.compile(File.open(ES5FallbackPath, "r:UTF-8").read + File.open(SourcePath, "r:UTF-8").read)
  end

  # Minifies JavaScript code
  #
  # source should be a String or IO object containing valid JavaScript.
  #
  # Returns minified code as String
  def compile(source)
    really_compile(source, false)
  end
  alias_method :compress, :compile

  # Minifies JavaScript code and generates a source map
  #
  # source should be a String or IO object containing valid JavaScript.
  #
  # Returns a pair of [minified code as String, source map as a String]
  def compile_with_map(source)
    really_compile(source, true)
  end

  private

  # Minifies JavaScript code
  #
  # source should be a String or IO object containing valid JavaScript.
  def really_compile(source, generate_map)
    source = source.respond_to?(:read) ? source.read : source.to_s

    js = <<-JS
      function comments(option) {
        if (Object.prototype.toString.call(option) === '[object Array]') {
          return new RegExp(option[0], option[1]);
        } else if (option == "jsdoc") {
          return function(node, comment) {
            if (comment.type == "comment2") {
              return /@preserve|@license|@cc_on/i.test(comment.value);
            } else {
              return false;
            }
          }
        } else {
          return option;
        }
      }

      var options = %s;
      var source = options.source;
      var ast = UglifyJS.parse(source, options.parse_options);
      ast.figure_out_scope();

      if (options.compress) {
        var compressor = UglifyJS.Compressor(options.compress);
        ast = ast.transform(compressor);
        ast.figure_out_scope();
      }

      if (options.mangle) {
        ast.compute_char_frequency();
        ast.mangle_names(options.mangle);
      }

      var gen_code_options = options.output;
      gen_code_options.comments = comments(options.output.comments);

      if (options.generate_map) {
          var source_map = UglifyJS.SourceMap(options.source_map_options);
          gen_code_options.source_map = source_map;
      }

      var stream = UglifyJS.OutputStream(gen_code_options);

      ast.print(stream);
      if (options.generate_map) {
          return [stream.toString(), source_map.toString()];
      } else {
          return stream.toString();
      }
    JS

    @context.exec(js % json_encode(
      :source => source,
      :output => output_options,
      :compress => compressor_options,
      :mangle => mangle_options,
      :parse_options => parse_options,
      :source_map_options => source_map_options,
      :generate_map => (!!generate_map)
    ))
  end

  def mangle_options
    conditional_option(@options[:mangle], DEFAULTS[:mangle])
  end

  def compressor_options
    defaults = conditional_option(DEFAULTS[:compress], :global_defs => @options[:define] || {})
    conditional_option(@options[:compress] || @options[:squeeze], defaults)
  end

  def comment_options
    val = if @options.has_key?(:output) && @options[:output].has_key?(:comments)
      @options[:output][:comments]
    elsif @options.has_key?(:comments)
      @options[:comments]
    else
      DEFAULTS[:output][:comments]
    end

    case val
    when :all, true
      true
    when :jsdoc
      "jsdoc"
    when :copyright
      encode_regexp(/Copyright/i)
    when Regexp
      encode_regexp(val)
    else
      false
    end
  end

  def output_options
    defaults = {
      :ascii_only => @options[:ascii_only],
      :inline_script => @options[:inline_script],
      :quote_keys => @options[:quote_keys],
      :max_line_len => @options[:max_line_length]
    }

    DEFAULTS[:output].merge(@options[:output] || {})
      .merge(:comments => comment_options)
  end

  def source_map_options
    {
      :file => @options[:output_filename],
      :root => @options[:source_root],
      :orig => @options[:input_source_map]
    }
  end

  def parse_options
    {:filename => @options[:source_filename]}
  end

  # MultiJson API detection
  if MultiJson.respond_to? :dump
    def json_encode(obj)
      MultiJson.dump(obj)
    end
  else
    def json_encode(obj)
      MultiJson.encode(obj)
    end
  end

  def encode_regexp(regexp)
    modifiers = if regexp.casefold?
      "i"
    else
      ""
    end

    [regexp.source, modifiers]
  end

  def conditional_option(value, defaults)
    if value == true || value == nil
      defaults
    elsif value
      defaults.merge(value)
    else
      false
    end
  end
end
