# encoding: UTF-8
require 'stringio'
require File.expand_path(File.dirname(__FILE__) + '/spec_helper')

describe "Uglifier" do
  it "generates source maps" do
    source = File.open("lib/uglify.js", "r:UTF-8").read
    minified, map = Uglifier.new.compile_with_map(source)
    minified.length.should < source.length
    map.length.should > 0
    lambda {
      JSON.parse(map)
    }.should_not raise_error
  end

  it "generates source maps with the correct meta-data" do
    source = <<-JS
      function hello () {
        function world () {
          return 2;
        };

        return world() + world();
      };
    JS

    minified, map = Uglifier.compile_with_map(source,
                                              :source_filename => "ahoy.js",
                                              :output_filename => "ahoy.min.js",
                                              :source_root => "http://localhost/")

    map = SourceMap.from_s(map)
    map.file.should == "ahoy.min.js"
    map.sources.should == ["ahoy.js"]
    map.names.should == ["hello", "world"]
    map.source_root.should == "http://localhost/"
    map.mappings.first[:generated_line].should == 1
  end

  it "should skip copyright lines in source maps" do
    source = <<-JS
      /* @copyright Conrad Irwin */
      function hello () {
        function world () {
          return 2;
        };

        return world() + world();
      };
    JS

    minified, map = Uglifier.compile_with_map(source,
                                              :source_filename => "ahoy.js",
                                              :source_root => "http://localhost/")
    map = SourceMap.from_s(map)
    map.mappings.first[:generated_line].should == 2
  end

  it "should be able to handle an input source map" do
    source = <<-JS
      function hello () {
        function world () {
          return 2;
        };

        return world() + world();
      };
    JS

    minified1, map1 = Uglifier.compile_with_map(source,
                                               :source_filename => "ahoy.js",
                                               :source_root => "http://localhost/",
                                               :mangle => false)

    minified2, map2 = Uglifier.compile_with_map(source,
                                               :input_source_map => map1,
                                               :mangle => true)

    minified1.lines.to_a.length.should == 1

    map = SourceMap.from_s(map2)
    map.sources.should == ["http://localhost/ahoy.js"]
    map.mappings.first[:source_line].should == 1
    map.mappings.last[:source_line].should == 6
  end
end
