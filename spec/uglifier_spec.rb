# encoding: UTF-8

require 'stringio'
require File.expand_path(File.dirname(__FILE__) + '/spec_helper')

describe "Uglifier" do
  it "minifies JS" do
    source = File.open("lib/uglify.js", "r:UTF-8", &:read)
    minified = Uglifier.new.compile(source)
    expect(minified.length).to be < source.length
    expect { ExecJS.compile(minified) }.not_to raise_error
  end

  describe 'harmony mode' do
    let(:source) { "const foo = () => bar();" }

    it "minifies JS with Harmony features when harmony option is on" do
      minified = Uglifier.new(:harmony => true, :compress => false).compile(source)
      expect(minified.length).to be < source.length
    end

    it "raises an error when minifying JS with Harmony without harmony option" do
      source = "for (var value of array) { doSomething(value) }"
      expect { Uglifier.new(:compress => false).compile(source) }
        .to raise_error(Uglifier::Error, /harmony/)
    end
  end

  it "throws an exception when compilation fails" do
    expect { Uglifier.new.compile(")(") }.to raise_error(Uglifier::Error)
  end

  it "throws an exception on invalid option" do
    expect { Uglifier.new(:foo => true) }.to raise_error(ArgumentError)
  end

  it "doesn't omit null character in strings" do
    expect(Uglifier.new.compile('var foo="\0bar"')).to include("\\0bar")
  end

  it "adds trailing semicolon to minified source" do
    source = "(function id(i) {return i;}());"
    expect(Uglifier.new.compile(source)[-1]).to eql(";"[0])
  end

  describe "property name mangling" do
    let(:source) do
      <<-JS
        var obj = {
          _hidden: false,
          "quoted": 'value'
        };

        alert(object.quoted);
      JS
    end

    it "does not mangle property names by default" do
      expect(Uglifier.compile(source)).to include("object.quoted")
    end

    it "can be configured to mangle properties" do
      expect(Uglifier.compile(source, :mangle => { :properties => true }))
        .not_to include("object.quoted")
    end

    it "can be configured using old mangle_properties" do
      expect(Uglifier.compile(source, :mangle_properties => true))
        .not_to include("object.quoted")
    end

    it "can configure a regex for mangling" do
      expect(Uglifier.compile(source, :mangle => { :properties => { :regex => /^_/ } }))
        .to include("object.quoted")
    end

    it "can be configured to keep quoted properties" do
      expect(Uglifier.compile(source, :mangle => { :properties => { :keep_quoted => true } }))
        .to include("object.quoted")
    end

    it "can be configured to include debug in mangled properties" do
      expect(Uglifier.compile(source, :mangle => { :properties => { :debug => true } }))
        .to include("_$quoted$_")
    end
  end

  describe "argument name mangling" do
    let(:code) { "function bar(foo) {return foo + 'bar'};" }

    it "doesn't try to mangle $super by default to avoid breaking PrototypeJS" do
      expect(Uglifier.compile('function foo($super) {return $super}')).to include("$super")
    end

    it "allows variables to be excluded from mangling" do
      expect(Uglifier.compile(code, :mangle => { :reserved => ["foo"] }))
        .to include("(foo)")
    end

    it "skips mangling when set to false" do
      expect(Uglifier.compile(code, :mangle => false)).to include("(foo)")
    end

    it "mangles argument names by default" do
      expect(Uglifier.compile(code)).not_to include("(foo)")
    end

    it "mangles top-level names when explicitly instructed" do
      expect(Uglifier.compile(code, :mangle => { :toplevel => false }))
        .to include("bar(")
      expect(Uglifier.compile(code, :mangle => { :toplevel => true }))
        .not_to include("bar(")
    end

    it "can be controlled with mangle option" do
      expect(Uglifier.compile(code, :mangle => false)).to include("(foo)")
    end
  end

  describe "comment preservation" do
    let(:source) do
      <<-JS
        /* @preserve Copyright Notice */
        /* (c) 2011 */
        // INCLUDED
        //! BANG
        function identity(p) { return p; }
        /* Another Copyright */
        /*! Another Bang */
        // A comment!
        function add(a, b) { return a + b; }
      JS
    end

    describe ":copyright" do
      subject { Uglifier.compile(source, :comments => :copyright) }

      it "preserves comments with string Copyright" do
        expect(subject).to match(/Copyright Notice/)
        expect(subject).to match(/Another Copyright/)
      end

      it "preserves comments that start with a bang (!)" do
        expect(subject).to match(/! BANG/)
        expect(subject).to match(/! Another Bang/)
      end

      it "ignores other comments" do
        expect(subject).not_to match(/INCLUDED/)
        expect(subject).not_to match(/A comment!/)
      end
    end

    describe ":jsdoc" do
      subject { Uglifier.compile(source, :output => { :comments => :jsdoc }) }

      it "preserves jsdoc license/preserve blocks" do
        expect(subject).to match(/Copyright Notice/)
      end

      it "ignores other comments" do
        expect(subject).not_to match(/Another Copyright/)
      end
    end

    describe ":all" do
      subject { Uglifier.compile(source, :comments => :all) }

      it "preserves all comments" do
        expect(subject).to match(/INCLUDED/)
        expect(subject).to match(/2011/)
      end
    end

    describe ":none" do
      subject { Uglifier.compile(source, :comments => :none) }

      it "omits all comments" do
        expect(subject).not_to match(%r{//})
        expect(subject).not_to match(%r{/\*})
      end
    end

    describe "regular expression" do
      subject { Uglifier.compile(source, :comments => /included/i) }

      it "matches comment blocks with regex" do
        expect(subject).to match(/INCLUDED/)
      end

      it "omits other blocks" do
        expect(subject).not_to match(/2011/)
      end
    end
  end

  it "honors max line length" do
    code = "var foo = 123;function bar() { return foo; }"
    uglifier = Uglifier.new(:output => { :max_line_len => 20 }, :compress => false)
    expect(uglifier.compile(code).split("\n").map(&:length)).to all(be < 28)
  end

  it "hoists vars to top of the scope" do
    code = <<-JS
      function f() {
        var a = 1;
        var b = 2;
        var c = 3;
        function g() {}
        return g(a, b, c);
      }
    JS
    minified = Uglifier.compile(code, :compress => { :hoist_vars => true })
    expect(minified).to match(/var \w=\d+,\w=\d+/)
  end

  describe 'reduce_funcs' do
    let(:code) do
      <<-JS
        var foo = function(x, y, z) {
          return x < y ? x * y + z : x * z - y;
        }
        var indirect = function(x, y, z) {
          return foo(x, y, z);
        }
        var sum = 0;
        for (var i = 0; i < 100; ++i)
          sum += indirect(i, i + 1, 3 * i);
        console.log(sum);
      JS
    end

    it 'inlines function declaration' do
      minified = Uglifier.compile(
        code,
        :mangle => false,
        :compress => {
          :reduce_funcs => true,
          :reduce_vars => true,
          :toplevel => true,
          :unused => true
        }
      )
      expect(minified).not_to include("foo(")
    end

    it 'defaults to not inlining function declarations' do
      minified = Uglifier.compile(
        code,
        :mangle => false,
        :compress => {
          :reduce_funcs => false,
          :reduce_vars => true,
          :toplevel => true,
          :unused => true
        }
      )
      expect(minified).to include("foo(")
    end
  end

  describe 'reduce_vars' do
    let(:code) do
      <<-JS
        var a = 2;
        (function () {
          console.log(a - 5);
          console.log(a - 1);
        })();
      JS
    end

    it "reduces vars when compress option is set" do
      minified = Uglifier.compile(code, :compress => { :reduce_vars => true, :toplevel => true })
      expect(minified).to include("console.log(-3)")
    end

    it "does not reduce vars when compress option is false" do
      minified = Uglifier.compile(code, :compress => { :reduce_vars => false, :toplevel => true })
      expect(minified).to match(/console.log\(\w+-5\)/)
    end

    it "defaults to variable reducing being disabled" do
      expect(Uglifier.compile(code))
        .to eq(Uglifier.compile(code, :compress => { :reduce_vars => false, :toplevel => true }))
    end

    it "does not reduce variables that are assigned to" do
      options = { :mangle => false, :compress => { :reduce_vars => true } }
      expect(Uglifier.compile(code + "a=3", options)).to match(/console.log\(\w+-5\)/)
    end
  end

  describe "ie8 option" do
    let(:code) { "function something() { return g.switch; }" }

    it "defaults to IE8-safe output" do
      expect(Uglifier.compile(code)).to match("\"switch\"")
    end

    it "forwards ie8 option to UglifyJS" do
      expect(Uglifier.compile(code, :mangle => false, :ie8 => false)).to match(/g\.switch/)
      expect(Uglifier.compile(code, :compress => false, :ie8 => false)).to match(/g\.switch/)
    end
  end

  it "can be configured to output only ASCII" do
    code = "function emoji() { return '\\ud83c\\ude01'; }"
    minified = Uglifier.compile(code, :output => { :ascii_only => true })
    expect(minified).to include("\\ud83c\\ude01")
  end

  it "escapes </script when asked to" do
    code = "function test() { return '</script>';}"
    minified = Uglifier.compile(code, :output => { :inline_script => true })
    expect(minified).not_to include("</script>")
  end

  it "quotes keys" do
    code = "var a = {foo: 1}"
    minified = Uglifier.compile(code, :output => { :quote_keys => true })
    expect(minified).to include('"foo"')
  end

  it "quotes unsafe keys by default" do
    code = 'var code = {"class": "", "\u200c":"A"}'
    expect(Uglifier.compile(code)).to include('"class"')
    expect(Uglifier.compile(code)).to include('"\u200c"')

    uglifier = Uglifier.new(:output => { :ascii_only => false, :quote_keys => false })
    expect(uglifier.compile(code)).to include(["200c".to_i(16)].pack("U*"))
  end

  it "handles constant definitions" do
    code = "if (BOOL) { var a = STR; var b = NULL; var c = NUM; }"
    defines = { "NUM" => 1234, "BOOL" => true, "NULL" => nil, "STR" => "str" }
    processed = Uglifier.compile(code, :define => defines)
    expect(processed).to include("a=\"str\"")
    expect(processed).not_to include("if")
    expect(processed).to include("b=null")
    expect(processed).to include("c=1234")
  end

  it "can disable IIFE negation" do
    code = "(function(value) { console.log(value)})(value);"
    disabled_negation = Uglifier.compile(code, :compress => { :negate_iife => false })
    expect(disabled_negation).not_to include("!")
    negation = Uglifier.compile(code, :compress => { :negate_iife => true })
    expect(negation).to include("!")
  end

  it "can drop console logging" do
    code = "(function() { console.log('test')})();"
    compiled = Uglifier.compile(code, :compress => { :drop_console => true })
    expect(compiled).not_to include("console")
  end

  describe "collapse_vars option" do
    let(:code) do
      <<-JS
        function a() {
          var win = window;
          return win.Handlebars;
        }
      JS
    end

    it "collapses vars when collapse_vars is enabled" do
      compiled = Uglifier.compile(code, :compress => { :collapse_vars => true })
      expect(compiled).to include("return window.Handlebars")
    end

    it "does not collapse variables when disable" do
      compiled = Uglifier.compile(code, :compress => { :collapse_vars => false })
      expect(compiled).not_to include("return window.Handlebars")
    end

    it "defaults to not collapsing variables" do
      expect(Uglifier.compile(code)).to include("return window.Handlebars")
    end
  end

  it "keeps unused function arguments when keep_fargs option is set" do
    code = <<-JS
    function plus(a, b, c) { return a + b};
    plus(1, 2);
    JS

    options = lambda do |keep_fargs|
      {
        :mangle => false,
        :compress => {
          :keep_fargs => keep_fargs,
          :unsafe => true
        }
      }
    end

    expect(Uglifier.compile(code, options.call(false))).not_to include("c)")
    expect(Uglifier.compile(code, options.call(true))).to include("c)")
  end

  describe 'keep_fnames' do
    let(:code) do
      <<-JS
      (function() {
        function plus(a, b) { return a + b; };
        plus(1, 2);
      })();
      JS
    end

    it "keeps function names in output when compressor keep_fnames is set" do
      expect(Uglifier.compile(code, :compress => true)).not_to include("plus")

      keep_fnames = Uglifier.compile(code, :mangle => false, :compress => { :keep_fnames => true })
      expect(keep_fnames).to include("plus")
    end

    it "does not mangle function names in output when mangler keep_fnames is set" do
      expect(Uglifier.compile(code, :mangle => true)).not_to include("plus")

      keep_fnames = Uglifier.compile(code, :mangle => { :keep_fnames => true })
      expect(keep_fnames).to include("plus")
    end

    it "sets sets both compress and mangle keep_fnames when toplevel keep_fnames is true" do
      expect(Uglifier.compile(code)).not_to include("plus")

      keep_fnames = Uglifier.compile(code, :keep_fnames => true)
      expect(keep_fnames).to include("plus")
    end
  end

  describe "Input Formats" do
    let(:code) { "function hello() { return 'hello world'; }" }

    it "handles strings" do
      expect(Uglifier.new.compile(code)).not_to be_empty
    end

    it "handles IO objects" do
      expect(Uglifier.new.compile(StringIO.new(code))).not_to be_empty
    end
  end

  describe "wrap_iife option" do
    let(:code) do
      <<-JS
        (function(value) {
          return function() {
            console.log(value)
          };
        })(1)();
      JS
    end

    it "defaults to not wrap IIFEs" do
      expect(Uglifier.compile(code))
        .to match("!function(n){return function(){console.log(n)}}(1)();")
    end

    it "wraps IIFEs" do
      expect(Uglifier.compile(code, :output => { :wrap_iife => true }))
        .to match("(function(n){return function(){console.log(n)}})(1)();")
    end
  end

  describe 'removing unused top-level functions and variables' do
    let(:code) do
      <<-JS
        var a, b = 1, c = g;
        function f(d) {
          return function() {
            c = 2;
          }
        }
        a = 2;
        function g() {}
        function h() {}
        console.log(b = 3);
      JS
    end

    it 'removes unused top-level functions and variables when toplevel is set' do
      compiled = Uglifier.compile(
        code,
        :mangle => false,
        :compress => { :toplevel => true }
      )
      expect(compiled).not_to include("function h()")
      expect(compiled).not_to include("var a")
    end

    it 'does not unused top-level functions and variables by default' do
      expect(Uglifier.compile(code, :mangle => false))
        .to include("var a").and(include("function h()"))
    end

    it 'keeps variables specified in top_retain' do
      compiled = Uglifier.compile(
        code,
        :mangle => false,
        :compress => { :toplevel => true, :top_retain => %w(a h) }
      )
      expect(compiled).to include("var a").and(include("function h()"))
      expect(compiled).not_to include("function g")
    end
  end

  describe 'unsafe_comps' do
    let(:code) do
      <<-JS
        var obj1, obj2;
        obj1 <= obj2 ? f1() : g1();
      JS
    end

    let(:options) do
      {
        :comparisons => true,
        :conditionals => true,
        :reduce_vars => false,
        :collapse_vars => false
      }
    end

    it 'keeps unsafe comparisons by default' do
      compiled = Uglifier.compile(code, :mangle => false, :compress => options)
      expect(compiled).to include("obj1<=obj2")
    end

    it 'optimises unsafe comparisons when unsafe_comps is enabled' do
      compiled = Uglifier.compile(
        code,
        :mangle => false,
        :compress => options.merge(:unsafe_comps => true)
      )
      expect(compiled).to include("obj2<obj1")
    end
  end

  describe 'unsafe_math' do
    let(:code) do
      <<-JS
        function compute(x) { return 2 * x * 3; }
      JS
    end

    it 'keeps unsafe math by default' do
      compiled = Uglifier.compile(code, :mangle => false)
      expect(compiled).to include('2*x*3')
    end

    it 'optimises unsafe math when unsafe_math is enabled' do
      compiled = Uglifier.compile(
        code,
        :mangle => false,
        :compress => { :unsafe_math => true }
      )
      expect(compiled).to include("6*x")
    end
  end

  describe 'unsafe_proto' do
    let(:code) do
      <<-JS
        Array.prototype.slice.call([1,2,3], 1)
      JS
    end

    it 'keeps unsafe prototype references by default' do
      compiled = Uglifier.compile(code)
      expect(compiled).to include("Array.prototype.slice.call")
    end

    it 'optimises unsafe comparisons when unsafe_comps is enabled' do
      compiled = Uglifier.compile(code, :compress => { :unsafe_proto => true })
      expect(compiled).to include("[].slice.call")
    end
  end

  it 'forwards passes option to compressor' do
    code = File.open("lib/uglify.js", "r:UTF-8", &:read)
    one_pass = Uglifier.compile(code, :mangle => false, :compress => { :passes => 1 })
    two_pass = Uglifier.compile(code, :mangle => false, :compress => { :passes => 2 })
    expect(two_pass.length).to be < one_pass.length
  end

  describe 'shebang' do
    let(:shebang) { '#!/usr/bin/env node' }
    let(:code) { "#{shebang}\nconsole.log('Hello world!')" }

    it 'is not removed by default' do
      compiled = Uglifier.compile(code)
      expect(compiled).to include("#!")
    end

    it 'is removed when shebang option is set to false' do
      compiled = Uglifier.compile(code, :output => { :shebang => false })
      expect(compiled).not_to include("#!")
    end
  end

  describe 'keep_infinity' do
    let(:code) do
      <<-JS
        function fun() { return (123456789 / 0).toString(); }
      JS
    end

    it 'compresses Infinity by default' do
      compiled = Uglifier.compile(code, :compress => {
                                    :evaluate => true,
                                    :keep_infinity => false
                                  })
      expect(compiled).not_to include("Infinity")
    end

    it 'can be enabled to preserve Infinity' do
      compiled = Uglifier.compile(code, :compress => {
                                    :evaluate => true,
                                    :keep_infinity => true
                                  })
      expect(compiled).to include("Infinity")
    end
  end

  describe 'quote style' do
    let(:code) do
      <<-JS
        function fun() { return "foo \\\"bar\\\""; }
      JS
    end

    it 'defaults to auto' do
      compiled = Uglifier.compile(code)
      expect(compiled).to include("'foo \"bar\"'")
    end

    it 'can use numbers for configuration' do
      compiled = Uglifier.compile(code, :output => { :quote_style => 2 })
      expect(compiled).to include("\"foo \\\"bar\\\"\"")
    end

    it 'uses single quotes when single' do
      compiled = Uglifier.compile(code, :output => { :quote_style => :single })
      expect(compiled).to include("'foo \"bar\"'")
    end

    it 'uses double quotes when single' do
      compiled = Uglifier.compile(code, :output => { :quote_style => :double })
      expect(compiled).to include("\"foo \\\"bar\\\"\"")
    end

    it 'preserves original quoting when original' do
      compiled = Uglifier.compile(code, :output => { :quote_style => :original })
      expect(compiled).to include("\"foo \\\"bar\\\"\"")
    end
  end

  describe 'keep quoted props' do
    let(:code) do
      <<-JS
        function fun() { return {"foo": "bar"}; }
      JS
    end

    it 'defaults to not keeping quotes' do
      compiled = Uglifier.compile(code)
      expect(compiled).not_to include('"foo"')
    end

    it 'keeps properties when set to true' do
      compiled = Uglifier.compile(code, :output => { :keep_quoted_props => true })
      expect(compiled).to include('"foo"')
    end
  end

  describe 'side_effects' do
    let(:code) do
      <<-JS
        function fun() { /*@__PURE__*/foo(); }
      JS
    end

    it 'defaults to dropping pure function calls' do
      compiled = Uglifier.compile(code)
      expect(compiled).not_to include('foo()')
    end

    it 'function call dropping can be disabled' do
      compiled = Uglifier.compile(code, :compress => { :side_effects => false })
      expect(compiled).to include('foo()')
    end
  end

  describe 'switches' do
    let(:code) do
      <<-JS
        function fun() {
          switch (1) {
            case 1: foo();
            case 1+1:
              bar();
              break;
            case 1+1+1: baz();
          }
        }
      JS
    end

    it 'drops unreachable switch branches by default' do
      compiled = Uglifier.compile(code)
      expect(compiled).not_to include('baz()')
    end

    it 'branch dropping can be disabled' do
      compiled = Uglifier.compile(code, :compress => { :switches => false })
      expect(compiled).to include('baz()')
    end
  end
end
