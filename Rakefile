# encoding: utf-8

# rubocop:disable Metrics/BlockLength

require 'fileutils'
require 'bundler/gem_tasks'
require 'rspec/core/rake_task'
RSpec::Core::RakeTask.new(:spec) do |spec|
  spec.pattern = FileList['spec/**/*_spec.rb']
end

def version
  ENV.fetch('VERSION')
end

HEADER = "## next"

def changelog_tail
  changelog = File.read("CHANGELOG.md")
  if changelog.start_with?(HEADER)
    changelog[HEADER.length + 2..-1]
  else
    "\n" + changelog
  end
end

namespace :uglifyjs do
  desc "Update UglifyJS source to version specified in VERSION environment variable"
  task :update do
    cd 'vendor/uglifyjs' do
      `git fetch && git checkout v#{version}`
    end

    cd 'vendor/uglifyjs-harmony' do
      `git fetch && git checkout harmony-v#{version}`
    end
  end

  desc "Rebuild lib/uglify*.js"
  task :build do
    cd 'vendor/source-map/' do
      `npm install --no-package-lock --no-save`
    end

    cd 'vendor/uglifyjs/' do
      # required to run ./uglifyjs2 --self; not bundled.
      `npm install --no-package-lock --no-save`
    end

    cd 'vendor/uglifyjs-harmony' do
      # required to run ./uglifyjs2 --self; not bundled.
      `npm install --no-package-lock --no-save`
    end

    FileUtils.cp("vendor/source-map/dist/source-map.js", "lib/source-map.js")

    source = `./vendor/uglifyjs/bin/uglifyjs --self --comments /Copyright/`
    File.write("lib/uglify.js", source)

    harmony_source = `./vendor/uglifyjs-harmony/bin/uglifyjs --self --comments /Copyright/`
    File.write("lib/uglify-harmony.js", harmony_source)

    FileUtils.cp("vendor/split/split.js", "lib/split.js")
    `patch -p1 -i patches/es5-string-split.patch`
  end

  desc "Add UglifyJS version bump to changelog"
  task :changelog do
    item = "- update UglifyJS to #{version}"
    changelog = "#{HEADER}\n\n#{item}\n#{changelog_tail}"
    File.write("CHANGELOG.md", changelog)
  end

  desc "Commit changes from UglifyJS version bump"
  task :commit do
    files = [
      'CHANGELOG.md',
      'lib/uglify.js',
      'lib/uglify-harmony.js',
      'vendor/uglifyjs',
      'vendor/uglifyjs-harmony'
    ]
    `git add #{files.join(' ')}`
    `git commit -m "Update UglifyJS to #{version}"`
  end
end

desc "Update UglifyJS to version specified in VERSION environment variable"
task :uglifyjs => ['uglifyjs:update', 'uglifyjs:build', 'uglifyjs:changelog', 'uglifyjs:commit']

begin
  require 'rubocop/rake_task'
  RuboCop::RakeTask.new(:rubocop)
  task :default => [:rubocop, :spec]
rescue LoadError
  task :default => [:spec]
end
