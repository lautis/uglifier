require 'rubygems'
require 'bundler'
begin
  Bundler.setup(:default, :development)
rescue Bundler::BundlerError => e
  $stderr.puts e.message
  $stderr.puts "Run `bundle install` to install missing gems"
  exit e.status_code
end
require 'rake'

require 'jeweler'
Jeweler::Tasks.new do |gem|
  # gem is a Gem::Specification... see http://docs.rubygems.org/read/chapter/20 for more options
  gem.name = "uglifier"
  gem.summary = %Q{Ruby wrapper for UglifyJS JavaScript compressor}
  gem.email = "lautis@gmail.com"
  gem.homepage = "http://github.com/lautis/uglifier"
  gem.authors = ["Ville Lautanala"]
end
Jeweler::RubygemsDotOrgTasks.new

require 'rspec/core'
require 'rspec/core/rake_task'
RSpec::Core::RakeTask.new(:spec) do |spec|
  spec.pattern = FileList['spec/**/*_spec.rb']
end

task :default => :spec

require 'rdoc/task'
Rake::RDocTask.new do |rdoc|
  version = File.exist?('VERSION') ? File.read('VERSION') : ""

  rdoc.rdoc_dir = 'rdoc'
  rdoc.title = "uglifier #{version}"
  rdoc.rdoc_files.include('README*')
  rdoc.rdoc_files.include('lib/**/*.rb')
end

desc "Rebuild lib/uglify.js"
task :js do

  cd 'vendor/source-map/' do
    `npm install`
    `node Makefile.dryice.js`
  end

  cd 'vendor/uglifyjs/' do
    # required to run ./uglifyjs2 --self; not bundled.
    `npm install`
  end

  source = ""
  source << "window = this;"
  source << File.read("vendor/source-map/dist/source-map.js")
  source << "MOZ_SourceMap = sourceMap;"
  source << `./vendor/uglifyjs/bin/uglifyjs2 --self`

  File.write("lib/uglify.js", source)
end
