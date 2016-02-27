# encoding: UTF-8
require 'stringio'
require File.expand_path(File.dirname(__FILE__) + '/spec_helper')

def expect_to_have_inline_source_map(minified, original)
  options = { :source_map => { :sources_content => true } }
  _, map = Uglifier.compile_with_map(minified, options)
  expect(JSON.load(map).fetch("sourcesContent", [])).to include(original)
end

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
    _, json = Uglifier.compile_with_map(
      source,
      :source_map => {
        :filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :root => "http://localhost/"
      }
    )

    map = SourceMap::Map.from_json(json)
    expect(map.filename).to eq("ahoy.min.js")
    expect(map.sources).to eq(["ahoy.js"])
    expect(map.names).to eq(%w(hello world))
    expect(JSON.load(json)["sourceRoot"]).to eq("http://localhost/")
    expect(map[0].generated.line).to eq(1)
  end

  it "skips copyright lines in source maps" do
    source = <<-JS
      /* @copyright Conrad Irwin */
      function hello () {
        function world () {
          return 2;
        };

        return world() + world();
      };
    JS

    _, json = Uglifier.compile_with_map(
      source,
      :source_map => {
        :filename => "ahoy.js",
        :root => "http://localhost/"
      }
    )

    map = SourceMap::Map.from_json(json)
    expect(map[0].generated.line).to eq(2)
  end

  it "proceses an input source map" do
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
        :filename => "ahoy.js",
        :root => "http://localhost/"
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

    map = SourceMap::Map.from_json(map2)
    expect(map.sources).to eq(["http://localhost/ahoy.js"])
    expect(map[0].generated.line).to eq(1)
    expect(map[-1].original.line).to eq(1)
  end

  it "handles empty string as input map sourceRoot" do
    _, map1 = Uglifier.compile_with_map(
      source,
      :source_map => {
        :filename => "ahoy.js",
        :root => ""
      },
      :mangle => false
    )

    _, map = Uglifier.compile_with_map(
      source,
      :source_map => {
        :input_source_map => map1
      },
      :mangle => true
    )

    expect(SourceMap::Map.from_json(map).sources).to eq(["ahoy.js"])
  end

  it "appends source map url to minified JS" do
    minified, = Uglifier.compile_with_map(
      source,
      :source_map => {
        :filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :root => "http://localhost/",
        :map_url => "http://example.com/map"
      }
    )
    expect(minified).to include("\n//# sourceMappingURL=http://example.com/map")
  end

  it "appends source url to minified JS" do
    minified, = Uglifier.compile_with_map(
      source,
      :source_map => {
        :filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :root => "http://localhost/",
        :url => "http://example.com/source"
      }
    )
    expect(minified).to include("\n//# sourceURL=http://example.com/source")
  end

  it "inlines source map" do
    minified = Uglifier.compile(
      source,
      :source_map => {
        :filename => "ahoy.js",
        :output_filename => "ahoy.min.js",
        :root => "http://localhost/",
        :url => "http://example.com/source"
      }
    )
    source_map_mime = "application/json;charset=utf-8;base64,"
    expect(minified).to include("\n//# sourceMappingURL=data:#{source_map_mime}")
  end

  describe "inline source map parsing" do
    let(:minified) do
      Uglifier.compile(
        source,
        :source_map => {
          :filename => "ahoy.js",
          :sources_content => true
        }
      )
    end

    let(:code) { minified.split("\n")[0] }
    let(:source_mapping_url) { minified.split("\n")[1][2..-1] }

    it "parses inline source maps from line comments" do
      minified = "#{code}\n//#{source_mapping_url}"
      expect_to_have_inline_source_map(minified, source)
    end

    it "parses inline source maps with block comments" do
      minified = "#{code}\n/*#{source_mapping_url}*/"
      expect_to_have_inline_source_map(minified, source)
    end

    it "parses inline source maps with multi-line block comments" do
      minified = "#{code}\n/*\n#{source_mapping_url}\n*/"
      expect_to_have_inline_source_map(minified, source)
    end

    it "parses inline source maps from mixed comments" do
      minified = "#{code}\n/*\n//#{source_mapping_url}\n*/"
      expect_to_have_inline_source_map(minified, source)
    end

    it "only parses source maps at end of file" do
      minified = "#{code}\n//#{source_mapping_url}\nhello();"
      _, map = Uglifier.compile_with_map(minified)
      expect(JSON.load(map)["sourcesContent"]).to be_nil
    end

    it "handles other source map declarations at end of file" do
      minified = "#{code}\n
        //#{source_mapping_url}\n
        //# sourceURL=http://example.com/source.js
        //# sourceURL=http://example.com/source.js
      "
      expect_to_have_inline_source_map(minified, source)
    end

    it "does not explode when data URI is invalid" do
      minified = "#{code}\n//# sourceMappingURL=data:application/javascript,foobar"
      _, map = Uglifier.compile_with_map(minified)
      expect(JSON.load(map)["sourcesContent"]).to be_nil
    end
  end
end
