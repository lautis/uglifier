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
    }
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
    source = source.respond_to?(:read) ? source.read : source.to_s

    js = <<-JS
      var source = %{source};
      var ast = UglifyJS.parse(source);
      ast.figure_out_scope();

      if (%{squeeze}) {
        var compressor = UglifyJS.Compressor(%{compressor_options});
        ast = ast.transform(compressor);
        ast.figure_out_scope();
      }

      if (%{mangle}) {
        ast.compute_char_frequency();
        ast.mangle_names(%{mangle_options});
      }

      var stream = UglifyJS.OutputStream(%{gen_code_options});

      if (%{copyright}) {
        var comments = ast.start.comments_before;
        for (var i = 0; i < comments.length; i++) {
          var c = comments[i];
          stream.print((c.type == "comment1") ? "//"+c.value+"\\n" : "/*"+c.value+"*/\\n");
        }
      }

      ast.print(stream);
      return stream.toString() + ";";
    JS

    @context.exec(js % {
      :source => json_encode(source),
      :compressor_options => json_encode(compressor_options),
      :gen_code_options => json_encode(gen_code_options),
      :mangle_options => json_encode(mangle_options),
      :squeeze => squeeze?.to_s,
      :mangle => mangle?.to_s,
      :copyright => copyright?.to_s
    })
  end
  alias_method :compress, :compile

  private

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
