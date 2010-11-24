require File.expand_path(File.dirname(__FILE__) + '/spec_helper')

describe "Uglifier" do
  it "minifies JS" do
    source = File.read("vendor/uglifyjs/lib/parse-js.js")
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

  it "logs to output" do
    $stdout.should_receive(:write).at_least(:once)
    lambda {
      Uglifier.new.compile("function uglifyThis() {
        return;
        return 1; // This is an error
      }")
    }.should_not raise_error(Uglifier::Error)
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
    Uglifier.new(:squeeze => false).compile(code).length.should > Uglifier.new(:squeeze => true).compile(code).length
  end
end
