require "v8"

class Uglifier
  # Raised when compilation fails
  class Error < StandardError; end

  DEFAULTS = {
    :mangle => true, # Mangle variables names
    :toplevel => false, # Mangle top-level variable names
    :squeeze => true, # Squeeze code resulting in smaller, but less-readable code
    :seqs => true, # Reduce consecutive statements in blocks into single statement
    :dead_code => true, # Remove dead code (e.g. after return)
    :extra => false, # Additional and potentially unsafe optimizations
    :unsafe => false, # Optimizations known to be unsafe in some situations
    :beautify => false, # Ouput indented code
    :beautify_options => {
      :indent_level => 4,
      :indent_start => 0,
      :quote_keys => false,
      :space_colon => 0
    }
  }

  def initialize(options = {})
    @options = DEFAULTS.merge(options)
    @exports = {
      "sys" => {
        :debug => lambda {|m| puts m }
      }
    }
  end

  def compile(source)
    V8::Context.new do |cxt|
      cxt["process"] = { :version => "v0.2.0" }

      load_file(cxt, "parse-js")
      load_file(cxt, "process")
      @exports["process"]["set_logger"].call(lambda {|m| puts m })
      begin
        return generate_code(cxt, ast(cxt, source))
      rescue Exception => e
        raise Error.new(e.message)
      end
    end
  end

  def self.compile(source, options = {})
    self.new(options).compile(source)
  end

  private

  def generate_code(cxt, ast)
    cxt["gen_code"].call(ast, @options[:beautify] && @options[:beautify_options])
  end

  def ast(cxt, source)
    squeeze_unsafe(cxt, squeeze(cxt, mangle(cxt, cxt["parse"].call(source))))
  end

  def mangle(cxt, ast)
    return ast unless @options[:mangle]
    cxt["ast_mangle"].call(ast, @options[:toplevel])
  end

  def squeeze(cxt, ast)
    return ast unless @options[:squeeze]

    cxt["ast_squeeze"].call(ast, {
      "make_seqs" => @options[:seqs],
      "dead_code" => @options[:dead_code],
      "extra" => @options[:extra]
    })
  end

  def squeeze_unsafe(cxt, ast)
    return ast unless @options[:unsafe]
    cxt["ast_squeeze_more"].call(ast)
  end

  def load_file(cxt, file)
    old = cxt["exports"]
    cxt["exports"] = {}
    cxt["require"] = lambda {|r|
      @exports[File.basename(r, ".js")] || begin
        @exports[file] = cxt["exports"] # Prevent circular dependencies
        load_file(cxt, File.basename(r, ".js"))
      end
    }
    cxt.load(File.join(File.dirname(__FILE__), "..", "vendor", "uglifyjs", "lib", File.basename(file, ".js") + ".js"))
    @exports[file] = cxt["exports"]
    cxt["exports"] = old
    @exports[file]
  end
end
