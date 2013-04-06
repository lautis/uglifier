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
    expect {
      Uglifier.new.compile(")(")
    }.to raise_error(Uglifier::Error)
  end

  it "throws an exception on invalid option" do
    expect {
      Uglifier.new(:foo => true)
    }.to raise_error(ArgumentError)
  end

  it "doesn't omit null character in strings" do
    Uglifier.new.compile('var foo="\0bar"').should match(/(\0|\\0)/)
  end

  it "adds trailing semicolon to minified source" do
    source = "(function id(i) {return i;}());"
    Uglifier.new.compile(source)[-1].should eql(";"[0])
  end

  describe "argument name mangling" do
    it "doesn't try to mangle $super by default to avoid breaking PrototypeJS" do
      Uglifier.compile('function foo($super) {return $super}').should include("$super")
    end

    it "allows variables to be excluded from mangling" do
      code = "function bar(foo) {return foo + 'bar'};"
      Uglifier.compile(code, :mangle => {:except => ["foo"]}).should include("(foo)")
    end

    it "skips mangling when set to false" do
      code = "function bar(foo) {return foo + 'bar'};"
      Uglifier.compile(code, :mangle => false).should include("(foo)")
    end

    it "mangles argumen names by default" do
      code = "function bar(foo) {return foo + 'bar'};"
      Uglifier.compile(code, :mangle => true).should_not include("(foo)")
    end
  end

  describe "comment preservation" do
    let(:source) {
      <<-EOS
        /* @preserve Copyright Notice */
        /* (c) 2011 */
        // INCLUDED
        function identity(p) { return p; }
        /* Another Copyright */
        function add(a, b) { return a + b; }
      EOS
    }

    it "handles copyright option" do
      compiled = Uglifier.compile(source, :copyright => false)
      compiled.should_not match /Copyright/
    end

    describe ":copyright" do
      subject { Uglifier.compile(source, :comments => :copyright) }

      it "preserves comments with string Copyright" do
        subject.should match /Copyright Notice/
        subject.should match /Another Copyright/
      end

      it "ignores other comments" do
        subject.should_not match /INCLUDED/
      end
    end

    describe ":jsdoc" do
      subject { Uglifier.compile(source, :output => {:comments => :jsdoc}) }

      it "preserves jsdoc license/preserve blocks" do
        subject.should match /Copyright Notice/
      end

      it "ignores other comments" do
        subject.should_not match /Another Copyright/
      end
    end

    describe ":all" do
      subject { Uglifier.compile(source, :comments => :all) }

      it "preserves all comments" do
        subject.should match /INCLUDED/
        subject.should match /2011/
      end
    end

    describe ":none" do
      subject { Uglifier.compile(source, :comments => :none) }

      it "omits all comments" do
        subject.should_not match /\/\//
        subject.should_not match /\/\*/
      end
    end

    describe "regular expression" do
      subject { Uglifier.compile(source, :comments => /included/i) }

      it "matches comment blocks with regex" do
        subject.should match /INCLUDED/
      end

      it "omits other blocks" do
        subject.should_not match /2011/
      end
    end
  end

  it "squeezes code only if squeeze is set to true" do
    code = "function a(a){if(a) { return 0; } else { return 1; }}"
    Uglifier.compile(code, :squeeze => false).length.should > Uglifier.compile(code, :squeeze => true).length
  end

  it "honors max line length" do
    code = "var foo = 123;function bar() { return foo; }"
    Uglifier.compile(code, :output => {:max_line_len => 16}, :compress => false).split("\n").length.should == 2
  end

  it "hoists vars to top of the scope" do
    code = "function something() { var foo = 123; foo = 1234; var bar = 123456; return foo + bar}"
    Uglifier.compile(code, :compress => {:hoist_vars => true}).should match /var \w,\w/
  end

  it "can be configured to output only ASCII" do
    code = "function emoji() { return '\\ud83c\\ude01'; }"
    Uglifier.compile(code, :output => {:ascii_only => true}).should include("\\ud83c\\ude01")
  end

  it "escapes </script when asked to" do
    code = "function test() { return '</script>';}"
    Uglifier.compile(code, :output => {:inline_script => true}).should_not include("</script>")
  end

  it "quotes keys" do
    code = "var a = {foo: 1}"
    Uglifier.compile(code, :output => {:quote_keys => true}).should include('"foo"')
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
