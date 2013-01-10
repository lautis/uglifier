# encoding: UTF-8
require 'stringio'
require File.expand_path(File.dirname(__FILE__) + '/spec_helper')

describe "Uglifier" do
  it "minifies JS" do
    source = File.open("lib/uglify.js", "r:UTF-8").read
    minified = Uglifier.new.compile(source)
    minified.length.should < source.length
    lambda {
      Uglifier.new.compile(minified)
    }.should_not raise_error
  end

  it "throws an exception when compilation fails" do
    lambda {
      Uglifier.new.compile(")(")
    }.should raise_error(Uglifier::Error)
  end

  it "doesn't omit null character in strings" do
    Uglifier.new.compile('var foo="\0bar"').should match(/(\0|\\0)/)
  end

  it "doesn't try to mangle $super by default to avoid breaking PrototypeJS" do
    Uglifier.new.compile('function foo($super) {return $super}').should include("$super")
  end

  it "adds trailing semicolon to minified source" do
    source = "(function id(i) {return i;}());"
    Uglifier.new.compile(source)[-1].should eql(";"[0])
  end

  describe "Copyright Preservation" do
    let(:source) {
      <<-EOS
        /* Copyright Notice */
        /* (c) 2011 */
        // INCLUDED
        function identity(p) { return p; }
        /* Another Copyright */
        function add(a, b) { return a + b; }
      EOS
    }
    subject { Uglifier.compile(source, :copyright => true) }

    it "preserves copyright notices" do
      subject.should match /Copyright Notice/
      subject.should match /Another Copyright/
    end

    it "handles multiple copyright blocks" do
      subject.should match /\(c\) 2011/
    end

    it "does include different comment types" do
      subject.should match /INCLUDED/
    end

    it "omits copyright notification if copyright parameter is set to false" do
      Uglifier.compile(source, :copyright => false).should_not match /Copyright/
    end
  end

  it "mangles variables only if mangle is set to true" do
    code = "function longFunctionName(){}"
    Uglifier.new(:mangle => false).compile(code).length.should == code.length
  end

  it "squeezes code only if squeeze is set to true" do
    code = "function a(a){if(a) { return 0; } else { return 1; }}"
    Uglifier.compile(code, :squeeze => false).length.should > Uglifier.compile(code, :squeeze => true).length
  end

  it "allows variables to be excluded from mangling" do
    code = "function bar(foo) {return foo + 'bar'};"
    Uglifier.compile(code, :except => ["foo"]).should include("(foo)")
  end

  it "honors max line length" do
    code = "var foo = 123;var bar = 123456"
    Uglifier.compile(code, :max_line_length => 8, :squeeze => false).split("\n").length.should == 2
  end

  it "lifts vars to top of the scope" do
    code = "function something() { var foo = 123; foo = 1234; var bar = 123456; return foo + bar}"
    Uglifier.compile(code, :lift_vars => true).should match /var \w,\w/
  end

  it "can be configured to output only ASCII" do
    code = "function emoji() { return '\\ud83c\\ude01'; }"
    Uglifier.compile(code, :ascii_only => true).should include("\\ud83c\\ude01")
  end

  it "escapes </script when asked to" do
    code = "function test() { return '</script>';}"
    Uglifier.compile(code, :inline_script => true).should_not include("</script>")
  end

  it "quotes keys" do
    code = "var a = {foo: 1}"
    Uglifier.compile(code, :quote_keys => true).should include('"foo"')
  end

  it "handles constant definitions" do
    code = "if (BOOLEAN) { var a = STRING; var b = NULL; var c = NUMBER; }"
    defines = {"NUMBER" => 1234, "BOOLEAN" => true, "NULL" => nil, "STRING" => "str"}
    processed = Uglifier.compile(code, :define => defines)
    processed.should include("a=\"str\"")
    processed.should_not include("if")
    processed.should include("b=null")
    processed.should include("c=1234")
  end

  describe "Input Formats" do
    let(:code) { "function hello() { return 'hello world'; }" }

    it "handles strings" do
      lambda {
        Uglifier.new.compile(code).should_not be_empty
      }.should_not raise_error
    end

    it "handles IO objects" do
      lambda {
        Uglifier.new.compile(StringIO.new(code)).should_not be_empty
      }.should_not raise_error
    end
  end
end
