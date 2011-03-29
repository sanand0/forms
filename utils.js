var fs = require('fs');

module.exports = {
  // Return the contents of a file, cache it, and periodically update it
  readFile: (function() {
    var cache = {};
    return function(filename) {
      if (cache[filename]) { return cache[filename]; }
      fs.watchFile(filename, function(curr, prev) {
        if (curr.mtime <= prev.mtime) { return; }
        fs.readFile(filename, function(err, data) {
          if (err) { return; }
          cache[filename] = data;
        });
      });
      return cache[filename] = fs.readFileSync(filename, 'utf-8');
    };
  })()
};

module.exports.readFile = function(filename) { return fs.readFileSync(filename, 'utf-8'); };
