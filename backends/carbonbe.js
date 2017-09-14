/*jshint node:true */
"use strict";

/* Based on StatsD Carbon Backend https://github.com/etsy/statsd/blob/master/backends/graphite.js 
   The version in statsD assumes it is the only module in node, and uses globals,
   this has been refactored to a module */


module.exports = (function() {


    var net = require('net');


    // Minimally necessary pickle opcodes.
    var MARK = '(',
        STOP = '.',
        LONG = 'L',
        STRING = 'S',
        APPEND = 'a',
        LIST = 'l',
        TUPLE = 't';

        // A single measurement for sending to graphite.
    function Metric(key, value, ts) {
      var m = this;
      this.key = key;
      this.value = value;
      this.ts = ts;
    }

      // return a string representation of this metric appropriate 
      // for sending to the graphite collector. does not include
      // a trailing newline.
    Metric.prototype.toText = function() {
        return this.key + " " + this.value + " " + this.ts;
    };

    Metric.prototype.toPickle = function() {
        return MARK + STRING + '\'' + this.key + '\'\n' + MARK + LONG + this.ts + 'L\n' + STRING + '\'' + this.value + '\'\n' + TUPLE + TUPLE + APPEND;
    };

    // A collection of measurements for sending to graphite.
    function Stats() {
      this.metrics = [];
    }

    Stats.prototype.add = function(key, value, ts) {
        this.metrics.push(new Metric(key, value, ts));
    };

    Stats.prototype.toText = function() {
        return this.metrics.map(function(m) { return m.toText(); }).join('\n') + '\n';
    };



    Stats.prototype.toPickle = function() {
        var body = MARK + LIST + this.metrics.map(function(m) { return m.toPickle(); }).join('') + STOP;

        // The first four bytes of the graphite pickle format
        // contain the length of the rest of the payload.
        // We use Buffer because this is binary data.
        var buf = new Buffer(4 + body.length);

        buf.writeUInt32BE(body.length,0);
        buf.write(body,4);

        return buf;
    };

    // this gets inserted into the schema.
    var configschema = {
      enabled: {
        title: 'Enabled',
        type: 'boolean',
        default: false
      },
      pickle: {
        title : "Use Pickle",
        type: "boolean",
        default: true
      },
      host : {
        title: "Host",
        type: "string",
        default: "localhost"
      }
    }


    function Backend(plugin, options, config) {
      console.log("Creating backend with ",config);
      this.plugin = plugin;
      this.config = config;
      this.config.pickle = this.config.pickle || true;
      this.config.host = this.config.host || "localhost";
      this.config.testport = this.config.testport || 2003;
      this.config.pickleport = this.config.pickleport || 2004;


      // In order to unconditionally add this string, it either needs to be an
      // empty string if it was unset, OR prefixed by a . if it was set.

      this.last_flush = 0;
      this.last_exception = 0;
      this.flush_time = 0;
      this.flush_length = 0;

      if (this.config.keyNameSanitize !== undefined) {
        this.globalKeySanitize = this.config.keyNameSanitize;
      }

      return this;
    }

    Backend.prototype.close = function() {
      // release resources.
    };

    Backend.prototype._post_stats = function(ts, stats) {
      var self = this;
      var last_flush = this.last_flush || 0;
      var last_exception = this.last_exception || 0;
      var flush_time = this.flush_time || 0;
      var flush_length = this.flush_length || 0;

      if (this.config.host) {
        try {
          var port = this.config.pickle?this.config.pickleport:this.config.textport;
          var graphite = net.createConnection(port, this.config.host);
          graphite.addListener('error', function(connectionException){
            console.log("Error ", connectionException);
            if (self.debug) {
              console.error(connectionException);
            }
          });
          graphite.on('connect', function() {
            var ts = Math.round(Date.now() / 1000);
            stats.add('stats.graphiteStats.last_exception', self.last_exception, ts);
            stats.add('stats.graphiteStats.last_flush', self.last_flush    , ts);
            stats.add('stats.graphiteStats.flush_time', self.flush_time    , ts);
            stats.add('stats.graphiteStats.flush_length', self.flush_length  , ts);
            var stats_payload = self.config.pickle ? stats.toPickle() : stats.toText();

            var starttime = Date.now();
            this.write(stats_payload);
            this.end();

            self.flush_time = (Date.now() - starttime);
            self.flush_length = stats_payload.length;
            self.last_flush = Math.round(Date.now() / 1000);
          });
        } catch(e){
          console.log("Error ",e);
          if (this.debug) {
            console.error(e);
          }
          this.last_exception = Math.round(Date.now() / 1000);
        }
      }
    };

    Backend.prototype._sk = function(key) {
        // Sanitize key for graphite if not done globally
        if (this.globalKeySanitize) {
          return key;
        } else {
          return key.replace(/\s+/g, '_')
                    .replace(/\//g, '-')
                    .replace(/[^a-zA-Z_\-0-9\.]/g, '');
        }
    };

    Backend.prototype.flush = function(ts, metrics) {
      var starttime = Date.now();
      var numStats = 0;
      var stats = new Stats();
      for (var key in metrics) {
        stats.add(this._sk(key), metrics[key], ts);
        numStats += 1;
      }
      stats.add('stats.numStats', numStats, ts);
      stats.add('stats.graphiteStats.calculationtime', (Date.now() - starttime) , ts);
      this._post_stats(ts, stats);

      if (this.debug) {
       l.log("numStats: " + numStats);
      }
    };

    return {
        Backend : Backend,
        title: 'Carbon Backend',
        schema : configschema
    };

}());
