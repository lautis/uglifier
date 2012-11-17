# encoding: UTF-8

require "execjs"
require "multi_json"

class Uglifier
  Error = ExecJS::Error
  # MultiJson.engine = :json_gem

  # Default options for compilation
  DEFAULTS = {
    :mangle => true, # Mangle variable and function names, use :vars to skip function mangling
    :except => ["$super"], # Variable names to be excluded from mangling
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
    },
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
    @options = DEFAULTS.merge(options)
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
      var options = %s;
      var source = options.source;
      var ast = UglifyJS.parse(source, options.parse_options);
      ast.figure_out_scope();

      if (options.squeeze) {
        var compressor = UglifyJS.Compressor(options.compressor_options);
        ast = ast.transform(compressor);
        ast.figure_out_scope();
      }

      if (options.mangle) {
        ast.compute_char_frequency();
        ast.mangle_names(options.mangle_options);
      }

      var gen_code_options = options.gen_code_options;

      if (options.generate_map) {
          var source_map = UglifyJS.SourceMap(options.source_map_options);
          gen_code_options.source_map = source_map;
      }

      var stream = UglifyJS.OutputStream(gen_code_options);

      if (options.copyright) {
        var comments = ast.start.comments_before;
        for (var i = 0; i < comments.length; i++) {
          var c = comments[i];
          stream.print((c.type == "comment1") ? "//"+c.value+"\\n" : "/*"+c.value+"*/\\n");
        }
      }

      ast.print(stream);
      if (options.generate_map) {
          return [stream.toString(), source_map.toString()];
      } else {
          return stream.toString();
      }
    JS

    @context.exec(js % json_encode(
      :source => source,
      :compressor_options => compressor_options,
      :gen_code_options => gen_code_options,
      :mangle_options => mangle_options,
      :parse_options => parse_options,
      :source_map_options => source_map_options,
      :squeeze => squeeze?,
      :mangle => mangle?,
      :copyright => copyright?,
      :generate_map => (!!generate_map)
    ))
  end

  def mangle?
    !!@options[:mangle]
  end

  def squeeze?
    !!@options[:squeeze]
  end

  def copyright?
    !!@options[:copyright]
  end

  def mangle_options
    {"except" => @options[:except]}
  end

  def compressor_options
    {
      "sequences" => @options[:seqs],
      "dead_code" => @options[:dead_code],
      "unsafe" => !@options[:unsafe],
      "hoist_vars" => @options[:lift_vars],
      "global_defs" => @options[:define] || {}
    }
  end

  def gen_code_options
    options = {
      :ascii_only => @options[:ascii_only],
      :inline_script => @options[:inline_script],
      :quote_keys => @options[:quote_keys],
      :max_line_len => @options[:max_line_length]
    }

    if @options[:beautify]
      options.merge(:beautify => true).merge(@options[:beautify_options])
    else
      options
    end
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
end
