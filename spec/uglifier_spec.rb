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
end
