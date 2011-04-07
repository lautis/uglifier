require File.expand_path(File.dirname(__FILE__) + '/spec_helper')

describe "Uglifier" do
  it "minifies JS" do
    source = File.read("vendor/uglifyjs/lib/process.js")
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

  describe "Copyright Preservation" do
    before :all do
      @source = <<-EOS
        /* Copyright Notice */
        /* (c) 2011 */
        // INCLUDED
        function identity(p) { return p; }
      EOS
      @minified = Uglifier.compile(@source, :copyright => true)
    end

    it "preserves copyright notice" do
      @minified.should match /Copyright Notice/
    end

    it "handles multiple copyright blocks" do
      @minified.should match /\(c\) 2011/
    end

    it "does include different comment types" do
      @minified.should match /INCLUDED/
    end

    it "puts comments on own lines" do
      @minified.split("\n").should have(4).items
    end

    it "omits copyright notification if copyright parameter is set to false" do
      Uglifier.compile(@source, :copyright => false).should_not match /Copyright/
    end
  end

  it "does additional squeezing when unsafe options is true" do
    unsafe_input = "function a(b){b.toString();}"
    Uglifier.new(:unsafe => true).compile(unsafe_input).length.should < Uglifier.new(:unsafe => false).compile(unsafe_input).length
  end

  it "mangles variables only if mangle is set to true" do
    code = "function longFunctionName(){}"
    Uglifier.new(:mangle => false).compile(code).length.should == code.length
  end

  it "squeezes code only if squeeze is set to true" do
    code = "function a(a){if(a) { return 0; } else { return 1; }}"
    Uglifier.compile(code, :squeeze => false).length.should > Uglifier.compile(code, :squeeze => true).length
  end

  describe "Input Formats" do
    it "handles strings" do
      lambda {
        Uglifier.new.compile(File.read("vendor/uglifyjs/lib/process.js")).should_not be_empty
      }.should_not raise_error
    end

    it "handles files" do
      lambda {
        Uglifier.new.compile(File.open("vendor/uglifyjs/lib/process.js", "r")).should_not be_empty
      }.should_not raise_error
    end
  end
end
