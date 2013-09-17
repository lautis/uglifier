source "https://rubygems.org"

gem "execjs", ">= 0.3.0"
gem "json", ">= 1.8.0"

# Depend on defined ExecJS runtime
execjs_runtimes = {
  "RubyRacer" => "therubyracer",
  "RubyRhino" => "therubyrhino",
  "Mustang" => "mustang"
}

if ENV["EXECJS_RUNTIME"] && execjs_runtimes[ENV["EXECJS_RUNTIME"]]
  gem execjs_runtimes[ENV["EXECJS_RUNTIME"]], :group => :development
end

group :development do
  gem "rspec", "~> 2.7"
  gem "bundler", "~> 1.0"
  gem "jeweler", "~> 1.8.3"
  gem "rdoc", ">= 3.11"
  gem "source_map"
end
