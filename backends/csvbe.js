/*jshint node:true */
"use strict";


module.exports = (function() {

	const fs = require('fs');
	const path = require('path')


	  var Logger = function(logBase, headerLine) {
	    this.logFileHour = undefined;
	    this._stream = undefined;
	    this.headerLine = headerLine+"\n";
	    this.logBase = logBase;
	  }

	  Logger.prototype.getLogFileName = function() {
	    var d = new Date();
	    return this.logBase + d.getUTCFullYear() + ("00"+(d.getUTCMonth()+1)).slice(-2)+("00"+d.getUTCDate()).slice(-2) + ("00"+ d.getUTCHours()).slice(-2) + ".csv";
	  };

	  Logger.prototype.log = function(message) {
	    var currentHour = new Date().getUTCHours();
	    if ( this.logFileHour !== currentHour) {
	      if ( this._stream !== undefined) {
	        this._stream.end();
	      }
	      var fname = this.getLogFileName();
	      var writeheader = true;
	      if ( fs.existsSync(fname) && fs.statSync(fname).size > 0) {
	        writeheader = false;
          }
	      this._stream = fs.createWriteStream(fname, { flags: 'a' });
	      this.logFileHour = currentHour;
	      if (writeheader) {
            console.log("Logging data to ", fname);
	        this._stream.write(this.headerLine);
	      }
	    }
	    this._stream.write(message);
	    this._stream.write("\n")
	  };

	  Logger.prototype.close = function() {
	    if ( this._stream !== undefined) {
	        this._stream.end();
	    }
	  };

    // this gets inserted into the schema.
    var configschema = {
      enabled: {
        title: 'Enabled',
        type: 'boolean',
        default: false
      },
      logbase : {
        title: "Base Name - any directories must exist",
        type: "string",
        default: "sklog-"
      }
    }

    function Backend(plugin, options, config) {
    	this.plugin = plugin;
    	this.config = config;
    	this.columns = [];
    	this.columns[0] = 'ts';
    	this.columnkeys = [];
    	this.columnkeys[0] = 'ts';
	    // subscribe to each active stream to accumulate the current value.
	    var idx = 1;
	    for (var i = 0; i  < plugin.sentences.length; i++) {
	        var sentence = plugin.sentences[i];
	        if ( options.sentences[sentence.optionKey]) {
	          sentence.id = idx;
	          this.columns[idx] = sentence.optionKey;
	          this.columnkeys[idx] = sentence.key;
	          idx++;
	        }
	    };
	    this.logger = new Logger(this.config.logbase+"-",this.columns.join(','));
	}
    Backend.prototype.close = function() {
    	this.logger.close();
    };


    Backend.prototype.flush = function(ts, metrics) {
    	var output = [];
    	output[0] = new Date().getTime();
    	for (var i = 0; i < this.columnkeys.length; i++) {
    		if ( metrics[this.columnkeys[i]] !== undefined ) {
	    		output[i] = metrics[this.columnkeys[i]].toPrecision(4);
    		} else {
    			output[i] = 0;
    		}
    	}
    	this.logger.log(output.join(","));
	}

	return {
        Backend : Backend,
        title: 'CSV Backend',
        schema : configschema
    };
}());