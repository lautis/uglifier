require "execjs"
require "multi_json"

class Uglifier
  Error = ExecJS::Error
  # MultiJson.engine = :json_gem

  DEFAULTS = {
    :mangle => true, # Mangle variables names
    :toplevel => false, # Mangle top-level variable names
    :squeeze => true, # Squeeze code resulting in smaller, but less-readable code
    :seqs => true, # Reduce consecutive statements in blocks into single statement
    :dead_code => true, # Remove dead code (e.g. after return)
    :unsafe => false, # Optimizations known to be unsafe in some situations
    :copyright => true, # Show copyright message
    :beautify => false, # Ouput indented code
    :beautify_options => {
      :indent_level => 4,
      :indent_start => 0,
      :quote_keys => false,
      :space_colon => 0
    }
  }

  SourcePath = File.expand_path("../uglify.js", __FILE__)

  def self.compile(source, options = {})
    self.new(options).compile(source)
  end

  # Create new instance of Uglifier with given options
  def initialize(options = {})
    @options = DEFAULTS.merge(options)
    @context = ExecJS.compile(File.read(SourcePath))
  end

  def compile(source)
    source = source.respond_to?(:read) ? source.read : source.to_s

    js = []
    js << "var result = '';"
    js << "var source = #{MultiJson.encode(source)};"
    js << "var ast = UglifyJS.parser.parse(source);"

    if @options[:copyright]
      js << <<-JS
      var comments = UglifyJS.parser.tokenizer(source)().comments_before;
      for (var i = 0; i < comments.length; i++) {
        var c = comments[i];
        result += (c.type == "comment1") ? "//"+c.value+"\\n" : "/*"+c.value+"*/\\n";
      }
      JS
    end

    if @options[:mangle]
      js << "ast = UglifyJS.uglify.ast_mangle(ast, #{MultiJson.encode(mangle_options)});"
    end

    if @options[:squeeze]
      js << "ast = UglifyJS.uglify.ast_squeeze(ast, #{MultiJson.encode(squeeze_options)});"
    end

    if @options[:unsafe]
      js << "ast = UglifyJS.uglify.ast_squeeze_more(ast);"
    end

    js << "result += UglifyJS.uglify.gen_code(ast, #{MultiJson.encode(gen_code_options)});"
    js << "return result;"

    @context.exec js.join("\n")
  end
  alias_method :compress, :compile

  private

  def mangle_options
    @options[:toplevel]
  end

  def squeeze_options
    {
      "make_seqs" => @options[:seqs],
      "dead_code" => @options[:dead_code],
      "keep_comps" => !@options[:unsafe]
    }
  end

  def gen_code_options
    @options[:beautify] ? @options[:beautify_options] : {}
  end
end
