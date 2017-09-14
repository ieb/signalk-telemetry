/*jshint node:true */
"use strict";


module.exports = (function() {

	const Influx = require('influxdb-nodejs');



    // this gets inserted into the schema.
    var configschema = {
      enabled: {
        title: 'Enabled',
        type: 'boolean',
        default: false
      },
      url : {
        title: "InfluxDB URL",
        type: "string",
        default: "http://127.0.0.1:8086/"
      },
      db : {
        title: "InfluxDB URL",
        type: "string",
        default: "sk"
      }
    }

    function Backend(plugin, options, config) {
    	this.plugin = plugin;
    	this.config = config;
    	this.client = new Influx(config.url+config.db);
    	// setup the schema


    	this.fieldDef = {};
	    // subscribe to each active stream to accumulate the current value.
	    var idx = 1;
	    for (var i = plugin.sentences.length - 1; i >= 0; i--) {
	        var sentence = plugin.sentences[i];
	        if ( options[sentence.optionKey]) {
	          sentence.id = idx;
	          this.fieldDef[sentence.key] = 'f';
	          idx++;
	        }
	    };
	    console.log("Fields ", this.fieldDef);
	    this.client.schema(config.db,this.fieldDef);
	    this.nextFlush = Date.now()+30000;
	    var self = this;
	    // flush the queue at when it fills up or 30s have elapsed.
	    this.client.on('writeQueue', () => {
	    	if (self.client.writeQueueLength >= 100 || Date.now() > self.nextFlush) {
	    		self.nextFlush = Date.now()+30000;
	    		self.client.syncWrite()
	    			.then(() => {
	    				if ( self.config.debug ) {
					        console.info('sync write success');
	    				}
				    })
				    .catch(console.error);
	    	}
	    });
	};

    Backend.prototype.close = function() {
    };


    Backend.prototype.flush = function(ts, metrics) {
    	var output = {};
    	for (var key in this.fieldDef) {
    		if ( metrics[key] !== undefined ) {
	    		output[key] = metrics[key];
    		} else {
    			output[key] = 0;
    		}
    	}
    	this.client.write(this.config.db)
    		.field(output)
    		.queue();

	};

	return {
        Backend : Backend,
        title: 'Influxdb Backend',
        schema : configschema
    };
}());