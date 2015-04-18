# encoding: UTF-8
require 'stringio'
require File.expand_path(File.dirname(__FILE__) + '/spec_helper')

describe "Uglifier" do
  let(:source) do
    <<-JS
      function hello () {
        function world () {
          return 2;
        };

        return world() + world();
      };
    JS
  end

  it "generates source maps" do
    source = File.open("lib/uglify.js", "r:UTF-8").read
    minified, map = Uglifier.new.compile_with_map(source)
    expect(minified.length).to be < source.length
    expect(map.length).to be > 0
    expect { JSON.parse(map) }.not_to raise_error
  end

  it "generates source maps with the correct meta-data" do
    _, map = Uglifier.compile_with_map(
      source,
      :source_map => {
        :source_filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :source_root => "http://localhost/"
      }
    )

    map = SourceMap.from_s(map)
    expect(map.file).to eq("ahoy.min.js")
    expect(map.sources).to eq(["ahoy.js"])
    expect(map.names).to eq(%w(hello world))
    expect(map.source_root).to eq("http://localhost/")
    expect(map.mappings.first[:generated_line]).to eq(1)
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

    _, map = Uglifier.compile_with_map(
      source,
      :source_map => {
        :source_filename => "ahoy.js",
        :source_root => "http://localhost/"
      }
    )

    map = SourceMap.from_s(map)
    expect(map.mappings.first[:generated_line]).to eq(2)
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

    minified1, map1 = Uglifier.compile_with_map(
      source,
      :source_map => {
        :source_filename => "ahoy.js",
        :source_root => "http://localhost/"
      },
      :mangle => false
    )

    _, map2 = Uglifier.compile_with_map(
      source,
      :source_map => {
        :input_source_map => map1
      },
      :mangle => true
    )

    expect(minified1.lines.to_a.length).to eq(1)

    map = SourceMap.from_s(map2)
    expect(map.sources).to eq(["ahoy.js", "http://localhost/ahoy.js"])
    expect(map.mappings.first[:source_line]).to eq(1)
    expect(map.mappings.last[:source_line]).to eq(6)
  end

  it "appends source map url" do
    minified, = Uglifier.compile_with_map(
      source,
      :source_map => {
        :source_filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :source_root => "http://localhost/",
        :source_map_url => "http://example.com/map"
      }
    )
    expect(minified).to include("\n//# sourceMappingURL=http://example.com/map")
  end

  it "appends source url" do
    minified, = Uglifier.compile_with_map(
      source,
      :source_map => {
        :source_filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :source_root => "http://localhost/",
        :source_url => "http://example.com/source"
      }
    )
    expect(minified).to include("\n//# sourceURL=http://example.com/source")
  end

  it "inlines source map" do
    minified = Uglifier.compile(
      source,
      :source_map => {
        :source_filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :source_root => "http://localhost/",
        :source_url => "http://example.com/source"
      }
    )
    source_map_mime = "application/json;charset=utf-8;base64,"
    expect(minified).to include("\n//# sourceMappingURL=data:#{source_map_mime}")
  end

  it "parses inline source maps" do
    minified = Uglifier.compile(
      source,
      :source_map => {
        :source_filename => "ahoy.js",
        :source_map_include_sources => true
      }
    )
    _, map = Uglifier.compile_with_map(minified)
    expect(JSON.load(map)["sourcesContent"]).to include(source)
  end
end
