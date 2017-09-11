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
      debug : {
        title: "Debug Connection",
        type: "boolean",
        default: false
      },
      host : {
        title: "Host",
        type: "string",
        default: "localhost"
      },
      textport: {
        title: "Text port",
        type: "number",
        default: 2003
      },
      pickleport: {
        title: "Pickle port",
        type: "number",
        default: 2004
      },
      prefixes: {
        title: 'Metrics prefixes',
        type: 'object',
        properties: {
           globalPrefix : {
              title: 'Global Prefix',
              type: 'string',
              default: 'stats'
           },
           prefixCounter : {
              title: 'Counter Prefix',
              type: 'string',
              default: 'counters'
           },
           prefixTimer : {
              title: 'Timer Prefix',
              type: 'string',
              default: 'timers'
           },
           prefixGauge : {
              title: 'Guage Prefix',
              type: 'string',
              default: 'guages'
           },
           prefixSet : {
              title: 'Set Prefix',
              type: 'string',
              default: 'sets'
           },
           globalSuffix : {
              title: 'Global Suffix',
              type: 'string',
              default: ''
           },
           legacyNamespace : {
              title: 'Legacy Namespace',
              type: 'boolean',
              default: false
           },
           prefixStats : {
              title: 'Stats Prefix',
              type: 'string',
              default: 'stats'
           }
        }
      }


    }


    function Backend(config) {
      console.log("Creating backend with ",config);
      var prefixes = config.prefixes;
      this.config = config;
      this.globalNamespace = [];
      this.counterNamespace = [];
      this.timerNamespace = [];
      this.gaugesNamespace = [];
      this.setsNamespace = [];

      // In order to unconditionally add this string, it either needs to be an
      // empty string if it was unset, OR prefixed by a . if it was set.
      this.globalSuffix  = prefixes.globalSuffix !== undefined ? '.' + prefixes.globalSuffix : '';

      if (this.config.prefixes.legacyNamespace === false) {
        if (this.globalPrefix !== "") {
          this.globalNamespace.push(this.globalPrefix);
          this.counterNamespace.push(this.globalPrefix);
          this.timerNamespace.push(this.globalPrefix);
          this.gaugesNamespace.push(this.globalPrefix);
          this.setsNamespace.push(this.globalPrefix);
        }

        if (prefixes.prefixCounter !== "") {
          this.counterNamespace.push(prefixes.prefixCounter);
        }
        if (prefixes.prefixTimer !== "") {
          this.timerNamespace.push(prefixes.prefixTimer);
        }
        if (prefixes.prefixGauge !== "") {
          this.gaugesNamespace.push(prefixes.prefixGauge);
        }
        if (prefixes.prefixSet !== "") {
          this.setsNamespace.push(prefixes.prefixSet);
        }
      } else {
          this.globalNamespace = ['stats'];
          this.counterNamespace = ['stats'];
          this.timerNamespace = ['stats', 'timers'];
          this.gaugesNamespace = ['stats', 'gauges'];
          this.setsNamespace = ['stats', 'sets'];
      }

      this.last_flush = 0;
      this.last_exception = 0;
      this.flush_time = 0;
      this.flush_length = 0;

      if (this.config.keyNameSanitize !== undefined) {
        this.globalKeySanitize = this.config.keyNameSanitize;
      }

      this.flushInterval = config.flushInterval;

      this.flush_counts = typeof(this.config.flush_counts) === "undefined" ? true : this.config.flush_counts;


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
          console.log("Posting to ",this.config.host, port);
          var graphite = net.createConnection(port, this.config.host);
          graphite.addListener('error', function(connectionException){
            console.log("Error ", connectionException);
            if (self.debug) {
              console.error(connectionException);
            }
          });
          graphite.on('connect', function() {
            console.log("Connected");
            var ts = Math.round(Date.now() / 1000);
            var namespace = self.globalNamespace.concat(self.config.prefixes.prefixStats).join(".");
            var globalSuffix = self.config.prefixes.globalSuffix;
            stats.add(namespace + '.graphiteStats.last_exception' + globalSuffix, self.last_exception, ts);
            stats.add(namespace + '.graphiteStats.last_flush'     + globalSuffix, self.last_flush    , ts);
            stats.add(namespace + '.graphiteStats.flush_time'     + globalSuffix, self.flush_time    , ts);
            stats.add(namespace + '.graphiteStats.flush_length'   + globalSuffix, self.flush_length  , ts);
            var stats_payload = self.config.pickle ? stats.toPickle() : stats.toText();

            var starttime = Date.now();
            console.log("Payload ", stats_payload);
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
      var key;
      var timer_data_key;
      var counters = metrics.counters;
      var gauges = metrics.gauges;
      var timers = metrics.timers;
      var sets = metrics.sets;
      var counter_rates = metrics.counter_rates;
      var timer_data = metrics.timer_data;
      var statsd_metrics = metrics.statsd_metrics;
      var globalSuffix = this.config.prefixes.globalSuffix;
      var prefixStats = this.config.prefixes.prefixStats;


      // Flatten all the different types of metrics into a single
      // collection so we can allow serialization to either the graphite
      // text and pickle formats.
      var stats = new Stats();

      for (key in counters) {
        var value = counters[key];
        var valuePerSecond = counter_rates[key]; // pre-calculated "per second" rate
        var keyName = sk(key);
        var namespace = this.counterNamespace.concat(keyName);


        if (this.legacyNamespace === true) {
          stats.add(namespace.join(".") + globalSuffix, valuePerSecond, ts);
          if (flush_counts) {
            stats.add('stats_counts.' + keyName + globalSuffix, value, ts);
          }
        } else {
          stats.add(namespace.concat('rate').join(".")  + globalSuffix, valuePerSecond, ts);
          if (flush_counts) {
            stats.add(namespace.concat('count').join(".") + globalSuffix, value, ts);
          }
        }

        numStats += 1;
      }

      for (key in timer_data) {
        var namespace = this.timerNamespace.concat(sk(key));
        var the_key = namespace.join(".");

        for (timer_data_key in timer_data[key]) {
          if (typeof(timer_data[key][timer_data_key]) === 'number') {
            stats.add(the_key + '.' + timer_data_key + globalSuffix, timer_data[key][timer_data_key], ts);
          } else {
            for (var timer_data_sub_key in timer_data[key][timer_data_key]) {
              if (debug) {
                l.log(timer_data[key][timer_data_key][timer_data_sub_key].toString());
              }
              stats.add(the_key + '.' + timer_data_key + '.' + timer_data_sub_key + globalSuffix,
                        timer_data[key][timer_data_key][timer_data_sub_key], ts);
            }
          }
        }
        numStats += 1;
      }

      for (key in gauges) {
        var namespace = this.gaugesNamespace.concat(sk(key));
        stats.add(namespace.join(".") + globalSuffix, gauges[key], ts);
        numStats += 1;
      }

      for (key in sets) {
        var namespace = this.setsNamespace.concat(sk(key));
        stats.add(namespace.join(".") + '.count' + globalSuffix, sets[key].size(), ts);
        numStats += 1;
      }

      if (this.config.prefixes.legacyNamespace === true) {
        stats.add(prefixStats + '.numStats' + globalSuffix, numStats, ts);
        stats.add('stats.' + prefixStats + '.graphiteStats.calculationtime' + globalSuffix, (Date.now() - starttime), ts);
        for (key in statsd_metrics) {
          stats.add('stats.' + prefixStats + '.' + key + globalSuffix, statsd_metrics[key], ts);
        }
      } else {
        var namespace = this.globalNamespace.concat(prefixStats);
        stats.add(namespace.join(".") + '.numStats' + globalSuffix, numStats, ts);
        stats.add(namespace.join(".") + '.graphiteStats.calculationtime' + globalSuffix, (Date.now() - starttime) , ts);
        for (key in statsd_metrics) {
          var the_key = namespace.concat(key);
          stats.add(the_key.join(".") + globalSuffix,+ statsd_metrics[key], ts);
        }
      }
      this._post_stats(ts, stats);

      if (this.debug) {
       l.log("numStats: " + numStats);
      }
    };

    Backend.prototype.status = function(writeCb) {
      for (var stat in graphiteStats) {
        writeCb(null, 'graphite', stat, graphiteStats[stat]);
      }
    };



    return {
        Backend : Backend,
        title: 'Carbon Backend',
        schema : configschema
    };

}());
