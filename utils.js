var fs = require('fs');
var path = require('path');

module.exports = {
  // Return the contents of a file, cache it, and periodically update it
  readFile: (function() {
    var cache = {};
    return function(filename) {
      if (filename in cache) {
        return cache[filename];
      }
      else {
        fs.watchFile(filename, function(curr, prev) {
          if (!curr.nlink) { cache[filename] = ''; }
          if (curr.mtime <= prev.mtime) { return; }
          fs.readFile(filename, 'utf-8', function(err, data) {
            if (err) { return; }
            cache[filename] = data;
          });
        });
      }
      return cache[filename] = path.existsSync(filename) ? fs.readFileSync(filename, 'utf-8') : '';
    };
  })()
};
