// through2 is a thin wrapper around node transform streams
var through = require('through2');
var gutil = require('gulp-util');
var mkdirp = require('mkdirp');
var rmdir = require( 'rmdir' );
var request = require('request');
var path = require('path');
var inspect = require('util').inspect;
var fs = require('fs');

var PluginError = gutil.PluginError;
var AUTH_TOKEN;

// Consts
const PLUGIN_NAME = 'gulp-tinypng';
const TEMP_DIR = '.gulp/tinypng/';

function prefixStream(prefixText) {
  var stream = through();
  stream.write(prefixText);
  return stream;
}

var cleanTemp = function() {
  rmdir('.gulp/tinypng', function ( err, dirs, files ){
    mkdirp('.gulp/tinypng', function (err) {
      if (err){ console.error('Error creating temp folder'); }
    });
  });
};

var download = function(uri, filename, complete){
  request.head(uri, function(err, res, body){
    request({url: uri, strictSSL: false})
      .pipe(fs.createWriteStream(TEMP_DIR + filename))
      .on('close', function() {
        complete();
      });
  });
};

var readTemp = function(filename) {
  fs.readFile(filename, function(err, data){
    if (err) {
      return cb(new gutil.PluginError('gulp-tinypng', err));
    }
    file.contents = data;
  });
};

// Plugin level function (dealing with files)
function gulpPrefixer(prefixTexts) {
  var currentPrefixIndex = 0
  var prefixText = prefixTexts[currentPrefixIndex]
  AUTH_TOKEN = new Buffer('api:' + prefixText).toString('base64')
  if (!prefixText) {
    throw PluginError(PLUGIN_NAME, "Missing prefix text!");
  }
  prefixText = new Buffer(prefixText); // allocate ahead of time
  cleanTemp();
  // Creating a stream through which each file will pass
  var stream = through.obj(function (file, enc, callback) {
    if (file.isNull()) {
      this.push(file); // Do nothing if no contents
      return callback();
    }

    if (file.isBuffer()) {
      var prevLength = file.contents.length;
      var cb = function(err, data) {
        if (err && currentPrefixIndex < prefixTexts.length - 1) {
          currentPrefixIndex ++;
          prefixText = prefixTexts[currentPrefixIndex]
          AUTH_TOKEN = new Buffer('api:' + prefixText).toString('base64')
          tinypng(file, cb.bind(this))
        } else {
          file.contents = data;
          this.push(file);
          gutil.log('gulp-tingpng: [compressing]', gutil.colors.green('✔ ') + file.relative + gutil.colors.gray(' (done)'));
          return callback();
        }
      }
      tinypng(file, cb.bind(this));
    }

    if (file.isStream()) {
      throw PluginError(PLUGIN_NAME, "Stream is not supported");
      return callback();
    }
  });

  // returning the file stream
  return stream;
};



function tinypng(file, cb) {
  request({
    url: 'https://api.tinypng.com/shrink',
    method: 'POST',
    strictSSL: false,
    headers: {
      'Accept': '*/*',
      'Cache-Control':  'no-cache',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + AUTH_TOKEN
    },
    body: file.contents
  }, function(error, response, body) {
    var results, filename;
    if(!error) {
      filename = path.basename(file.path);
      results = JSON.parse(body);
      // size
      // ratio
      // url
      if(results.output && results.output.url) {
        download(results.output.url, filename, function() {
          fs.readFile(TEMP_DIR + filename, function(err, data){
            if (err) {
              gutil.log('[error] :  gulp-tinypng - ', err);
              cb(err)
            }
            cb(null, data);
          });
        });
      } else {
        gutil.log('[error] : gulp-tinypng - ', results.message);
        cb(results.error)
      }
    }
  });
};
// Exporting the plugin main function
module.exports = gulpPrefixer;
