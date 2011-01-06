require 'optparse'

class Uglifier
  module Cli
    def self.run!
      options = {}
      OptionParser.new do |opts|
        opts.banner = "Usage: uglifier [options] file1 file2 ..."

        opts.on("-M", "--no-mangle", "Don't mangle variable names") do |m|
          options[:mangle] = m
        end

        opts.on("-t", "--toplevel", "Mangle top-level variable names") do |m|
          options[:toplevel] = m
        end

        opts.on("-S", "--no-squeeze", "Squeeze code resulting in smaller, but less-readable code") do |s|
          options[:squeeze] = s
        end

        opts.on("-Q", "--no-seqs", "Reduce consecutive statements in blocks into single statement") do |q|
          options[:seqs] = q
        end

        opts.on("-d", "--[no-]dead-code", "Remove dead code (e.g. after return)") do |d|
          options[:dead_code] = d
        end

        opts.on("-x", "--extra-optimizations", "Additional and potentially unsafe optimizations") do |x|
          options[:extra] = x
        end

        opts.on("-u", "--unsafe-optimizations", "Optimizations known to be unsafe in some situations") do |d|
          options[:unsafe] = d
        end

        opts.on("-C", "--no-copyright", "Omit copyright information") do |d|
          options[:copyright] = d
        end

        opts.on("-b", "--beautify", "Output indented code") do |d|
          options[:beautify] = d
        end

        opts.on("-v", "--verbose", "Run verbosely") do |v|
          options[:verbose] = v
        end
      end.parse!

      uglifier = Uglifier.new(options)
      if ARGV[0]
        ARGV.each do |f|
          puts uglifier.compile(File.open(f, 'r'))
        end
      else
        puts uglifier.compile($stdin)
      end
      true
    end
  end
end
