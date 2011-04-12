var _ = require('underscore');
var fs = require('fs');
var path = require('path');

module.exports = {
  // readFile(file1, file2, ...) returns the contents of the first found file
  // It also caches the contents, refreshing when the file changes
  readFile: (function() {
    var cache = {};
    var watching = {};
    var watch = function(file) {
      if (watching[file]) { return; }
      watching[file] = fs.watchFile(file, function(curr, prev) {
        if (!curr.nlink) { delete cache[file]; }
        if (curr.mtime <= prev.mtime) { return; }
        fs.readFile(file, 'utf-8', function(err, data) {
          if (!err) { cache[file] = data; }
        });
      });
    };

    return function() {
      for (var i=0, file; file=arguments[i]; i++) {
        file = path.resolve(__dirname, file);
        watch(file);
        if (file in cache) { return cache[file]; }
        else if (path.existsSync(file)) { return cache[file] = fs.readFileSync(file, 'utf-8'); }
      }

      return '';
    };
  })()
};
