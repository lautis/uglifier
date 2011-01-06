require "v8"

class Uglifier
  class Node < V8::Context
    def initialize(*args, &blk)
      @exports = {}
      super(*args, &blk)
    end
    def require(file)
      old = self["exports"]
      self["exports"] = {}
      self["require"] = lambda {|r|
        @exports[File.basename(r, ".js")] || begin
          @exports[file] = self["exports"] # Prevent circular dependencies
          self.require(File.basename(r, ".js"))
        end
      }
      load(File.join(File.dirname(__FILE__), "..", "..", "vendor", "uglifyjs", "lib", File.basename(file, ".js") + ".js"))
      @exports[file] = self["exports"]
      self["exports"] = old
      @exports[file]
    end
  end
end
